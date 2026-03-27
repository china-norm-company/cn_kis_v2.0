"""
LIMS 数据注入器（P0 增强版）

职责：
1. 将 RawLimsRecord 中的原始数据映射到各业务模型
2. 注入前冲突检测（精确/相似匹配）
3. 原子事务注入（每条记录独立事务）
4. 注入日志写入 LimsInjectionLog（保存前值快照）

支持模块（P0 主数据底座）：
  equipment          -> ResourceItem（种子类别保障）
  personnel          -> Account + Staff + LabStaffProfile（三层链路）
  client             -> Client + ClientContact（联动联系人）
  commission         -> Protocol（关联已注入客户）
  commission_detection -> Protocol（补充检测方法字段）
  sample             -> Product + SampleInstance
  sample_storage     -> SampleInstance（补充库存状态）

支持模块（P1 合规约束）：
  standard           -> DetectionMethodTemplate
  method             -> DetectionMethodTemplate
  calibration_record -> EquipmentCalibration
  period_check_record-> EquipmentCalibration（内部校核）
  reference_material -> ResourceItem（标准物质分类）
  consumable         -> Consumable
  training_record    -> Training + SOPTraining
  competency_record  -> MethodQualification
  personnel_auth_ledger -> EquipmentAuthorization

支持模块（P2 过程追溯）：
  equipment_usage        -> EquipmentUsage
  equipment_history      -> EquipmentUsage（历史记录）
  equipment_maintenance_record -> EquipmentMaintenance
  equipment_repair_record      -> EquipmentMaintenance
  sample_transfer        -> SampleTransaction

其余模块 -> KnowledgeEntry（知识库通用存储）
"""
import contextvars
import json
import logging
import re

from datetime import date as date_cls, datetime
from typing import Any, Dict, List, Optional, Tuple

from django.db import transaction

logger = logging.getLogger('cn_kis.lims.injector')

# 当前注入批次上下文（供 _inject_equipment 写入 _lims_synced_at / 批次号）
_lims_inject_context: contextvars.ContextVar[Optional[Dict[str, str]]] = contextvars.ContextVar(
    'lims_inject_context', default=None
)


def _lims_inject_meta() -> Dict[str, str]:
    """返回本次 LIMS 写入的同步时间与批次号（无上下文时仍给同步时间）"""
    ctx = _lims_inject_context.get()
    if ctx:
        return dict(ctx)
    return {
        'synced_at': timezone.now().isoformat(),
        'batch_no': '',
    }


# ============================================================================
# 字段映射规范
# ============================================================================

# LIMS 字段名 -> 新系统字段名的常见映射（用于模糊字段提取）
FIELD_ALIASES = {
    # 设备/仪器
    'equipment_name': ['名称', '设备名称', '仪器名称', 'name', 'equipmentName'],
    'equipment_code': ['编号', '设备编号', '仪器编号', 'code', 'equipmentCode', 'NO', '序号'],
    'manufacturer': ['生产厂商', '制造商', 'manufacturer', '厂家'],
    'model_number': ['规格型号', '型号', 'model', 'modelNumber', '规格'],
    'serial_number': ['序列号', 'serialNumber', '出厂编号'],
    'purchase_date': ['购置日期', '购买日期', 'purchaseDate'],
    'last_calibration_date': ['上次校准日期', '最近校准日期', '校准日期', 'calibrationDate'],
    'next_calibration_date': ['下次校准日期', '下次校准', 'nextCalibrationDate'],
    'status': ['状态', 'status', '设备状态'],
    'location': ['存放地点', '存放位置', 'location', '地点'],
    # 人员
    'display_name': ['姓名', 'name', '人员姓名', 'personnelName'],
    'employee_no': ['工号', 'employeeNo', '员工编号', '人员编号'],
    'department': ['部门', 'department', '所属部门'],
    'position': ['岗位', '职位', 'position', 'jobTitle'],
    'phone': ['电话', 'phone', '手机', 'mobile', '联系方式'],
    'email': ['邮箱', 'email', 'Email'],
    # 客户/委托
    'client_name': ['客户名称', '委托单位', 'clientName', '单位名称'],
    'project_code': ['委托编号', '项目编号', 'projectCode', 'commissionNo'],
    'project_title': ['项目名称', '委托项目', 'projectName', 'title'],
    # 样品
    'sample_code': ['样品编号', 'sampleCode', 'sampleNo', '样品号'],
    'sample_name': ['样品名称', '产品名称', 'sampleName', 'productName'],
    'batch_no': ['批号', 'batchNo', '批次号'],
}


def _parse_lims_date(val: Any) -> Optional[date_cls]:
    """解析 LIMS 日期字符串为 date（YYYY-MM-DD / YYYY/MM/DD）"""
    if val is None:
        return None
    s = str(val).strip()
    if not s:
        return None
    s = s[:19].replace('T', ' ')[:10]
    for fmt in ('%Y-%m-%d', '%Y/%m/%d', '%Y.%m.%d'):
        try:
            return datetime.strptime(s[:10], fmt).date()
        except ValueError:
            continue
    return None


def _lims_first_nonempty_str(raw: dict, keys: tuple) -> str:
    """按候选键顺序取第一个非空字符串（LIMS 列名兼容）"""
    for k in keys:
        v = raw.get(k)
        if v is None:
            continue
        s = str(v).strip()
        if s:
            return s
    return ''


def _infer_unified_name_type(display_name: str) -> str:
    """
    LIMS 未单列「名称分类」时，从展示用设备名推断统一规格类型。
    例：温湿度记录仪 16 → 温湿度记录仪；电子天平 01 → 电子天平。
    """
    if not display_name or not str(display_name).strip():
        return ''
    s = str(display_name).strip()
    t = re.sub(r'\s+\d+$', '', s)
    if t != s:
        return t.strip()
    t = re.sub(r'[-_#]\d+$', '', s, flags=re.IGNORECASE)
    return (t.strip() if t.strip() else s)


def _parse_cycle_days(val: Any) -> Optional[int]:
    """从「365」「365天」「12 个月」等提取周期天数"""
    if val is None or val == '':
        return None
    if isinstance(val, int) and val > 0:
        return val
    if isinstance(val, float) and val > 0:
        return int(val)
    m = re.match(r'^(\d+)', str(val).strip())
    if m:
        n = int(m.group(1))
        return n if n > 0 else None
    return None


def _extract_field(raw_data: dict, field_key: str, default: str = '') -> str:
    """从原始数据中按字段别名提取值"""
    aliases = FIELD_ALIASES.get(field_key, [field_key])
    for alias in aliases:
        val = raw_data.get(alias, '')
        if val and str(val).strip():
            return str(val).strip()
    return default


def _parse_lims_date(val: Any) -> Optional[date_cls]:
    """尽量宽松地把 LIMS 日期解析为 date。"""
    if val in (None, ''):
        return None
    if isinstance(val, date_cls):
        return val
    text = str(val).strip()
    if not text:
        return None
    text = text.replace('/', '-')
    for fmt in ('%Y-%m-%d', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M', '%Y%m%d'):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(text).date()
    except ValueError:
        return None


def _lims_first_nonempty_str(raw: dict, keys: tuple) -> str:
    """按候选键顺序返回第一个非空字符串。"""
    for key in keys:
        val = raw.get(key)
        if val is None:
            continue
        text = str(val).strip()
        if text:
            return text
    return ''


def _infer_unified_name_type(display_name: str) -> str:
    """从设备展示名粗略推断名称分类，避免完全空值。"""
    text = (display_name or '').strip()
    if not text:
        return ''
    normalized = ''.join(ch for ch in text if not ch.isdigit()).strip(' -_/')
    return normalized or text


def _parse_cycle_days(val: Any) -> Optional[int]:
    """解析 LIMS 周期字段，统一返回天数。"""
    if val in (None, ''):
        return None
    if isinstance(val, int):
        return val if val > 0 else None
    text = str(val).strip()
    if not text:
        return None
    digits = ''.join(ch for ch in text if ch.isdigit())
    if not digits:
        return None
    try:
        parsed = int(digits)
    except ValueError:
        return None
    return parsed if parsed > 0 else None


def _similarity(s1: str, s2: str) -> float:
    """简单相似度计算（基于公共子序列比例）"""
    if not s1 or not s2:
        return 0.0
    s1, s2 = s1.lower().strip(), s2.lower().strip()
    if s1 == s2:
        return 1.0
    # 基于 Jaccard 相似度（按字符 bigram）
    def bigrams(s):
        return set(s[i:i+2] for i in range(len(s)-1)) if len(s) > 1 else {s}
    bg1, bg2 = bigrams(s1), bigrams(s2)
    if not bg1 and not bg2:
        return 1.0
    intersection = bg1 & bg2
    union = bg1 | bg2
    return len(intersection) / len(union) if union else 0.0


# ============================================================================
# 冲突检测
# ============================================================================

class ConflictDetector:
    """注入前冲突检测器"""

    SIMILARITY_THRESHOLD = 0.8  # 相似度阈值

    @classmethod
    def check_equipment(cls, raw_data: dict) -> Optional[Tuple[Any, str, float]]:
        """检查设备是否已存在，返回 (existing_record, conflict_type, similarity)"""
        try:
            from apps.resource.models import ResourceItem
            code = _extract_field(raw_data, 'equipment_code')
            name = _extract_field(raw_data, 'equipment_name')

            if code:
                existing = ResourceItem.objects.filter(code=code, is_deleted=False).first()
                if existing:
                    return existing, 'exact_code', 1.0

            if name:
                for item in ResourceItem.objects.filter(is_deleted=False).values('id', 'name', 'code'):
                    sim = _similarity(name, item['name'])
                    if sim >= cls.SIMILARITY_THRESHOLD:
                        existing = ResourceItem.objects.get(id=item['id'])
                        return existing, 'fuzzy_name', sim
        except Exception as ex:
            logger.debug('设备冲突检测失败: %s', ex)
        return None

    @classmethod
    def check_personnel(cls, raw_data: dict) -> Optional[Tuple[Any, str, float]]:
        """检查人员是否已存在"""
        try:
            from apps.identity.models import Account
            from apps.hr.models import Staff
            name = _extract_field(raw_data, 'display_name')
            emp_no = _extract_field(raw_data, 'employee_no')

            if emp_no:
                staff = Staff.objects.filter(employee_no=emp_no, is_deleted=False).first()
                if staff:
                    acc = Account.objects.filter(id=staff.account_fk_id).first()
                    return acc or staff, 'exact_code', 1.0

            if name:
                acc = Account.objects.filter(
                    display_name=name, is_deleted=False
                ).first()
                if acc:
                    return acc, 'exact_name', 1.0
                for item in Account.objects.filter(is_deleted=False).values('id', 'display_name'):
                    sim = _similarity(name, item['display_name'])
                    if sim >= cls.SIMILARITY_THRESHOLD:
                        existing = Account.objects.get(id=item['id'])
                        return existing, 'fuzzy_name', sim
        except Exception as ex:
            logger.debug('人员冲突检测失败: %s', ex)
        return None

    @classmethod
    def check_client(cls, raw_data: dict) -> Optional[Tuple[Any, str, float]]:
        """检查客户是否已存在"""
        try:
            from apps.crm.models import Client
            name = _extract_field(raw_data, 'client_name')
            if not name:
                return None
            existing = Client.objects.filter(name=name, is_deleted=False).first()
            if existing:
                return existing, 'exact_name', 1.0
            for item in Client.objects.filter(is_deleted=False).values('id', 'name'):
                sim = _similarity(name, item['name'])
                if sim >= cls.SIMILARITY_THRESHOLD:
                    existing = Client.objects.get(id=item['id'])
                    return existing, 'fuzzy_name', sim
        except Exception as ex:
            logger.debug('客户冲突检测失败: %s', ex)
        return None

    @classmethod
    def check_protocol(cls, raw_data: dict) -> Optional[Tuple[Any, str, float]]:
        """检查项目/委托是否已存在"""
        try:
            from apps.protocol.models import Protocol
            code = _extract_field(raw_data, 'project_code')
            title = _extract_field(raw_data, 'project_title')
            if code:
                existing = Protocol.objects.filter(code=code, is_deleted=False).first()
                if existing:
                    return existing, 'exact_code', 1.0
            if title:
                existing = Protocol.objects.filter(title=title, is_deleted=False).first()
                if existing:
                    return existing, 'exact_name', 1.0
                for item in Protocol.objects.filter(is_deleted=False).values('id', 'title'):
                    sim = _similarity(title, item['title'])
                    if sim >= cls.SIMILARITY_THRESHOLD:
                        existing = Protocol.objects.get(id=item['id'])
                        return existing, 'fuzzy_name', sim
        except Exception as ex:
            logger.debug('项目冲突检测失败: %s', ex)
        return None

    MODULE_CHECKERS = {
        'equipment': 'check_equipment',
        'personnel': 'check_personnel',
        'client': 'check_client',
        'commission': 'check_protocol',
        'commission_detection': 'check_protocol',
    }

    @classmethod
    def detect(cls, module: str, raw_data: dict) -> Optional[Tuple[Any, str, float]]:
        """统一冲突检测入口"""
        method_name = cls.MODULE_CHECKERS.get(module)
        if method_name:
            checker = getattr(cls, method_name)
            return checker(raw_data)
        return None


# ============================================================================
# 数据注入器（按模块）
# ============================================================================

def _model_to_dict(instance) -> dict:
    """将 Django model 实例转为字典（用于保存 before_data 快照）"""
    from django.forms.models import model_to_dict
    try:
        data = model_to_dict(instance)
        # 处理不可序列化的类型
        result = {}
        for k, v in data.items():
            if hasattr(v, 'isoformat'):
                result[k] = v.isoformat()
            elif hasattr(v, '__iter__') and not isinstance(v, (str, dict, list)):
                result[k] = list(v)
            else:
                result[k] = v
        return result
    except Exception:
        return {}


class LimsInjector:
    """
    LIMS 数据注入器

    每条记录：
      1. 冲突检测
      2. 无冲突 → 原子注入 → 写 LimsInjectionLog
      3. 有冲突 → 写 LimsConflict → 等待人工审核
    """

    def __init__(self, batch, dry_run: bool = False, resolve_conflicts: str = 'pending'):
        """
        batch: LimsImportBatch 实例
        dry_run: True 时只检测冲突，不实际写入业务表
        resolve_conflicts: 'pending'（默认，等待人工审核）| 'upsert'（自动用 LIMS 数据覆盖）| 'skip'（跳过冲突）
        """
        self.batch = batch
        self.dry_run = dry_run
        self.resolve_conflicts = resolve_conflicts
        self.stats = {
            'injected': 0,
            'updated': 0,
            'conflicts': 0,
            'skipped': 0,
            'failed': 0,
        }

    def _call_module_injector(self, injector_fn, raw_data):
        """在上下文中调用模块注入器，写入批次号与同步时间戳（attributes._lims_synced_at）"""
        token = _lims_inject_context.set({
            'synced_at': timezone.now().isoformat(),
            'batch_no': getattr(self.batch, 'batch_no', '') or '',
        })
        try:
            return injector_fn(raw_data)
        finally:
            _lims_inject_context.reset(token)

    def inject_module(self, module: str) -> Dict[str, int]:
        """注入指定模块的所有待注入记录"""
        from apps.lims_integration.models import RawLimsRecord

        # upsert 模式下，同时处理 pending 和 conflict 状态的记录
        if self.resolve_conflicts == 'upsert':
            status_filter = ['pending', 'conflict']
        else:
            status_filter = ['pending']

        records = RawLimsRecord.objects.filter(
            batch=self.batch,
            module=module,
            injection_status__in=status_filter,
        )
        logger.info('[%s] 开始注入: %d 条待处理记录（策略: %s）',
                    module, records.count(), self.resolve_conflicts)

        for raw_rec in records:
            try:
                self._inject_one(raw_rec)
            except Exception as ex:
                logger.error('[%s] 注入失败 lims_id=%s: %s', module, raw_rec.lims_id, ex)
                raw_rec.injection_status = 'failed'
                raw_rec.save(update_fields=['injection_status'])
                self.stats['failed'] += 1

        return dict(self.stats)

    def inject_all(self) -> Dict[str, int]:
        """注入批次内所有模块"""
        from apps.lims_integration.models import RawLimsRecord

        if self.resolve_conflicts == 'upsert':
            status_filter = ['pending', 'conflict']
        else:
            status_filter = ['pending']

        modules = list(
            RawLimsRecord.objects.filter(
                batch=self.batch, injection_status__in=status_filter
            ).values_list('module', flat=True).distinct()
        )
        for module in modules:
            self.inject_module(module)
        return dict(self.stats)

    def _inject_one(self, raw_rec):
        """注入单条记录"""
        from apps.lims_integration.models import (
            LimsConflict, LimsInjectionLog, ConflictResolution
        )
        module = raw_rec.module
        raw_data = raw_rec.raw_data

        # 冲突检测
        conflict_result = ConflictDetector.detect(module, raw_data)
        if conflict_result:
            existing, conflict_type, similarity = conflict_result
            existing_data = _model_to_dict(existing)
            diff_fields = self._compute_diff(raw_data, existing_data)

            if self.dry_run:
                logger.info('[DRY-RUN] 冲突: %s:%s → %s (相似度=%.2f)',
                            module, raw_rec.lims_id, conflict_type, similarity)
                self.stats['conflicts'] += 1
                return

            # upsert 模式：直接用 LIMS 数据更新已有记录
            if self.resolve_conflicts == 'upsert':
                injector_fn = self._get_injector_fn(module)
                if injector_fn:
                    from django.db import transaction as db_transaction
                    try:
                        with db_transaction.atomic():
                            result = self._call_module_injector(injector_fn, raw_data)
                            if result:
                                target_obj, action, before_data = result
                                LimsInjectionLog.objects.create(
                                    batch=self.batch,
                                    raw_record=raw_rec,
                                    module=module,
                                    lims_id=raw_rec.lims_id,
                                    target_table=target_obj.__class__._meta.db_table,
                                    target_id=target_obj.id,
                                    action='upsert',
                                    before_data=existing_data,
                                    after_data=raw_data,
                                )
                                raw_rec.injection_status = 'injected'
                                raw_rec.save(update_fields=['injection_status'])
                                self.stats['updated'] += 1
                                return
                    except Exception as e:
                        logger.error('[upsert] %s:%s 失败: %s | data=%s',
                                     module, raw_rec.lims_id, e, str(raw_data)[:200])
                        raw_rec.injection_status = 'failed'
                        raw_rec.save(update_fields=['injection_status'])
                        self.stats['failed'] += 1
                        return
                # 无专用注入器，走知识库
                self._inject_to_knowledge(raw_rec)
                return

            # skip 模式：跳过冲突
            if self.resolve_conflicts == 'skip':
                raw_rec.injection_status = 'skipped'
                raw_rec.save(update_fields=['injection_status'])
                self.stats['skipped'] += 1
                return

            # 默认 pending 模式：记录冲突等待人工审核
            LimsConflict.objects.create(
                batch=self.batch,
                raw_record=raw_rec,
                module=module,
                lims_id=raw_rec.lims_id,
                conflict_type=conflict_type,
                similarity_score=similarity,
                lims_data=raw_data,
                existing_record_id=getattr(existing, 'id', None),
                existing_table=existing.__class__._meta.db_table,
                existing_data=existing_data,
                diff_fields=diff_fields,
                resolution=ConflictResolution.PENDING,
            )
            raw_rec.injection_status = 'conflict'
            raw_rec.save(update_fields=['injection_status'])
            self.stats['conflicts'] += 1
            return

        # 无冲突，直接注入
        if self.dry_run:
            logger.info('[DRY-RUN] 注入: %s:%s', module, raw_rec.lims_id)
            self.stats['injected'] += 1
            return

        injector_fn = self._get_injector_fn(module)
        if not injector_fn:
            # 无专用注入器，走知识库通用路径
            self._inject_to_knowledge(raw_rec)
            return

        try:
            with transaction.atomic():
                result = self._call_module_injector(injector_fn, raw_data)
            if result:
                target_obj, action, before_data = result
                LimsInjectionLog.objects.create(
                    batch=self.batch,
                    raw_record=raw_rec,
                    module=module,
                    lims_id=raw_rec.lims_id,
                    target_table=target_obj.__class__._meta.db_table,
                    target_id=target_obj.id,
                    action=action,
                    before_data=before_data,
                    after_data=raw_data,
                )
                raw_rec.injection_status = 'injected'
                raw_rec.save(update_fields=['injection_status'])
                if action == 'created':
                    self.stats['injected'] += 1
                else:
                    self.stats['updated'] += 1
        except Exception as e:
            logger.error('[%s] 注入异常 lims_id=%s: %s', module, raw_rec.lims_id, e)
            try:
                raw_rec.injection_status = 'failed'
                raw_rec.save(update_fields=['injection_status'])
            except Exception:
                pass
            self.stats['failed'] += 1

    def _get_injector_fn(self, module: str):
        """返回指定模块的注入函数"""
        mapping = {
            # P0 主数据底座
            'equipment': _inject_equipment,
            'personnel': _inject_personnel,
            'client': _inject_client,
            'commission': _inject_commission,
            'commission_detection': _inject_commission,
            'sample': _inject_sample,
            'sample_storage': _inject_sample_storage,
            # P1 合规约束
            'standard': _inject_detection_method,
            'method': _inject_detection_method,
            'calibration_record': _inject_calibration,
            'period_check_record': _inject_period_check,
            'reference_material': _inject_reference_material,
            'consumable': _inject_consumable,
            'training_record': _inject_training_record,
            'competency_record': _inject_competency_record,
            'personnel_auth_ledger': _inject_personnel_auth,
            # P2 过程追溯
            'equipment_usage': _inject_equipment_usage,
            'equipment_history': _inject_equipment_usage,
            'equipment_maintenance_record': _inject_equipment_maintenance,
            'equipment_repair_record': _inject_equipment_maintenance,
            'sample_transfer': _inject_sample_transfer,
        }
        return mapping.get(module)

    def _inject_to_knowledge(self, raw_rec):
        """通过知识库 ingestion_pipeline 注入（通用路径）"""
        try:
            from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline
            module = raw_rec.module
            raw_data = raw_rec.raw_data
            label = raw_rec.lims_id

            content_parts = []
            for k, v in raw_data.items():
                if v and str(v).strip():
                    content_parts.append(f'{k}: {v}')
            content = '\n'.join(content_parts)
            if not content.strip():
                self.stats['skipped'] += 1
                return

            entry_type_map = {
                'quality_doc': 'sop',
                'supplier': 'competitor_intel',
                'supervision_record': 'lesson_learned',
                'report_info': 'lesson_learned',
                'personnel_auth': 'method_reference',
                'detection_project': 'method_reference',
            }
            entry_type = entry_type_map.get(module, 'lesson_learned')

            raw_input = RawKnowledgeInput(
                title=f'[LIMS/{module}] {label}',
                content=content,
                entry_type=entry_type,
                source_type=f'lims_{module}',
                source_key=f'lims:{module}:{raw_rec.lims_id}',
                tags=['LIMS', module, 'lims导入'],
                namespace='lims_import',
                properties={
                    'batch_no': self.batch.batch_no,
                    'lims_id': raw_rec.lims_id,
                    'module': module,
                },
            )
            pipeline_result = run_pipeline(raw_input)
            if pipeline_result.success:
                raw_rec.injection_status = 'injected'
                raw_rec.save(update_fields=['injection_status'])
                self.stats['injected'] += 1
        except Exception as ex:
            logger.warning('[%s] 知识库注入失败: %s', raw_rec.module, ex)
            self.stats['failed'] += 1

    @staticmethod
    def _compute_diff(lims_data: dict, existing_data: dict) -> List[Dict]:
        """计算两个数据字典之间的差异"""
        diff = []
        all_keys = set(lims_data.keys()) | set(existing_data.keys())
        for key in sorted(all_keys):
            lims_val = str(lims_data.get(key, '')).strip()
            exist_val = str(existing_data.get(key, '')).strip()
            if lims_val != exist_val and (lims_val or exist_val):
                diff.append({
                    'field': key,
                    'lims': lims_val[:200],
                    'existing': exist_val[:200],
                })
        return diff


# ============================================================================
# 各模块具体注入函数
# ============================================================================

def _inject_equipment(raw_data: dict):
    """
    注入设备台账 -> ResourceItem（含关联责任人 + EquipmentAuthorization）

    colConfigInfo 修复后，字段含义：
    - SBMC（设备名称）= 真实设备编号（如 FSD0405113, OLY-043）→ 用作 code
    - ZBMC（组别名称）= 设备通用名称（如 温湿度记录仪 16）→ 用作 name
    - SBZRR（设备责任人）= 人员姓名 → 查找已注入的 Account 作为 manager_id
    - SBLYR（设备当前借用人）= 人员姓名 → 创建 EquipmentAuthorization
    - SBLYZT（使用状态）= 设备使用状态（空闲/使用登记等）→ 映射到 ResourceItem.status
    - SBZT（设备状态）= 设备状态（启用/停用/报废等）→ 影响 is_active
    - SYBM（归属部门）= 使用部门 → 设备所属部门标注
    - XCJZSJ（下次校准时间）= 下次校准到期日 → next_calibration_date
    - 名称分类（与 ResourceCategory「设备类别」不同）= 同规格设备统一类型名
      （如 电子天平、glossymeter）→ attributes.name_classification；
      资源类别仍由 SBLB/SBFL/设备分类 等推断。
    """
    try:
        from apps.resource.models import ResourceItem, EquipmentAuthorization
        from apps.identity.models import Account

        # 格式检测：新格式有 col_X 列（LIMS BPM 已修复列偏移）
        # 新格式：设备编号 = 真实设备编号，设备名称 = 真实设备名称
        # 旧格式（colConfigInfo bug）：设备名称 列实际存储设备编号，组别名称 列存储设备名称
        is_new_format = any(k.startswith('col_') for k in raw_data)

        if is_new_format:
            # 新格式：字段含义已正确（LIMS BPM 修复后）
            code = (raw_data.get('设备编号') or raw_data.get('col_0') or '').strip()
            name = (raw_data.get('设备名称') or raw_data.get('col_1') or '').strip()
            # 无效占位符编号（'/' 或 '-'）视为无编号
            if code in ('/', '-', '\\', ''):
                code = ''
        else:
            # 旧格式：colConfigInfo bug 导致列偏移
            # SBMC/设备名称 列 = 真正的设备编号（如 FSD0405113）
            # ZBMC/组别名称 列 = 设备通用名称
            code = (raw_data.get('SBMC')
                    or raw_data.get('设备名称')
                    or '').strip()
            name = (raw_data.get('ZBMC')
                    or raw_data.get('组别名称')
                    or '').strip()

        # 兜底：旧格式补充字段
        if not code:
            for field in ['SBBH', 'equipmentCode', '仪器编号']:
                code = raw_data.get(field, '').strip()
                if code:
                    break
        if not name:
            for field in ['SBMC_name', '仪器名称']:
                name = raw_data.get(field, '').strip()
                if name:
                    break

        if not code and not name:
            return None
        if not name and code:
            name = code
        if not code and name:
            code = name[:50]

        # 截断到字段最大长度（ResourceItem.code max_length=50，name max_length=200）
        code = code[:50]
        name = name[:200]

        # 状态映射
        # SBLYZT = 使用状态（空闲/使用登记），SBZT = 设备状态（启用/停用/报废）
        raw_usage_status = raw_data.get('SBLYZT', raw_data.get('使用状态', '空闲')).strip()
        raw_equip_status = raw_data.get('SBZT', raw_data.get('设备状态', '启用')).strip()
        status_map = {
            '使用登记': 'active', '已领取': 'active', '空闲': 'idle',
            '停用': 'retired', '报废': 'retired', '损坏': 'maintenance',
            '退租退还': 'retired', '启用': 'idle',
        }
        # 综合判断：使用中优先，然后设备状态
        status = status_map.get(raw_usage_status) or status_map.get(raw_equip_status, 'idle')

        # 资源类别（设备大类/实验室分类）— 勿与「名称分类」混用
        category_name_raw = _lims_first_nonempty_str(raw_data, (
            'SBLB', 'SBFL', '设备分类', '资源类别', '设备大类',
            'labCategory', 'equipmentCategory',
        ))
        category = _find_or_create_equipment_category(category_name_raw)

        # 名称分类：LIMS 对同规格设备的统一类型，独立于 ResourceCategory
        name_classification_raw = _lims_first_nonempty_str(raw_data, (
            '名称分类', '设备名称分类', 'MCFL', '标准设备名称', '统一名称', 'TYMC',
            'instrumentType', 'instrumentTypeName', 'typeName', '统一设备名称',
            'standardInstrumentName', 'unifiedName',
        )) or _infer_unified_name_type(name)

        # 设备字段
        model_number = (raw_data.get('YQXH') or raw_data.get('设备规格/型号')
                        or raw_data.get('LX') or raw_data.get('类型') or '').strip()
        serial_number = (raw_data.get('CCBH') or raw_data.get('出厂编号') or '').strip()
        manufacturer = (raw_data.get('SCCJ') or raw_data.get('生产厂家')
                        or raw_data.get('生产厂商') or '').strip()
        department = (raw_data.get('SYBM') or raw_data.get('使用部门') or '').strip()
        location = (raw_data.get('SBWZ') or raw_data.get('设备位置')
                    or raw_data.get('存放地点') or '').strip()

        # 责任人字段（SBZRR = 设备责任人姓名）
        manager_name = (raw_data.get('SBZRR') or raw_data.get('设备责任人') or '').strip()
        # 借用人字段（SBLYR = 设备当前借用人姓名）
        borrower_name = (raw_data.get('SBLYR') or raw_data.get('设备当前借用人') or '').strip()

        # 校准 / 核查 / 维护计划字段
        d_next_cal = _parse_lims_date(
            raw_data.get('XCJZSJ') or raw_data.get('下次校准时间') or raw_data.get('下次校准日期')
        )
        d_next_ver = _parse_lims_date(
            raw_data.get('XCHCSJ') or raw_data.get('下次核查时间') or raw_data.get('下次核查日期')
        )
        d_next_maint = _parse_lims_date(
            raw_data.get('XCWHSJ') or raw_data.get('下次维护时间')
            or raw_data.get('下次维护日期') or raw_data.get('下次保养时间')
        )
        cal_cycle = _parse_cycle_days(
            raw_data.get('JZZQ') or raw_data.get('校准周期') or raw_data.get('校准周期(天)')
        )
        ver_cycle = _parse_cycle_days(
            raw_data.get('HCZQ') or raw_data.get('核查周期') or raw_data.get('核查周期(天)')
        )
        maint_cycle = _parse_cycle_days(
            raw_data.get('WHZQ') or raw_data.get('维护周期')
            or raw_data.get('维护周期(天)') or raw_data.get('保养周期')
        )

        # 查找责任人 Account（使用姓名查找已注入的人员）
        manager_account = None
        if manager_name:
            manager_account = (
                Account.objects.filter(display_name=manager_name, is_deleted=False).first()
                or Account.objects.filter(username=manager_name, is_deleted=False).first()
            )

        meta = _lims_inject_meta()
        lims_attr = {
            '_lims_source': True,
            '_lims_dept': department,
            '_lims_manager': manager_name,
            '_lims_borrower': borrower_name,
            'name_classification': name_classification_raw,
            '_lims_synced_at': meta['synced_at'],
        }
        if meta.get('batch_no'):
            lims_attr['_lims_sync_batch_no'] = meta['batch_no']

        defaults = {
            'name': name,
            'manufacturer': manufacturer or '',
            'model_number': model_number or '',
            'serial_number': serial_number or '',
            'status': status,
            'location': f'{department}/{location}' if department and location else (department or location),
            'attributes': lims_attr,
        }
        if category:
            defaults['category'] = category
        if manager_account:
            defaults['manager_id'] = manager_account.id
        if d_next_cal:
            defaults['next_calibration_date'] = d_next_cal
        if d_next_ver:
            defaults['next_verification_date'] = d_next_ver
        if d_next_maint:
            defaults['next_maintenance_date'] = d_next_maint
        if cal_cycle:
            defaults['calibration_cycle_days'] = cal_cycle
        if ver_cycle:
            defaults['verification_cycle_days'] = ver_cycle
        if maint_cycle:
            defaults['maintenance_cycle_days'] = maint_cycle

        if code:
            obj, created = ResourceItem.objects.get_or_create(
                code=code, defaults=defaults
            )
            # 修复：如果已存在但 manager_id 为空，补充
            if not created and manager_account and not obj.manager_id:
                obj.manager_id = manager_account.id
                obj.save(update_fields=['manager_id'])
            # 已存在的 LIMS 设备：再次同步时以 LIMS 为准刷新台账与扩展字段
            if not created:
                prev_attrs = obj.attributes or {}
                if prev_attrs.get('_lims_source'):
                    merged_attr = {**prev_attrs, **(defaults.get('attributes') or {})}
                    obj.attributes = merged_attr
                    save_fields = ['attributes', 'update_time']
                    for fld, val in (
                        ('next_calibration_date', defaults.get('next_calibration_date')),
                        ('next_verification_date', defaults.get('next_verification_date')),
                        ('next_maintenance_date', defaults.get('next_maintenance_date')),
                        ('calibration_cycle_days', defaults.get('calibration_cycle_days')),
                        ('verification_cycle_days', defaults.get('verification_cycle_days')),
                        ('maintenance_cycle_days', defaults.get('maintenance_cycle_days')),
                    ):
                        if val is not None:
                            setattr(obj, fld, val)
                            save_fields.append(fld)
                    for fld in ('name', 'manufacturer', 'model_number', 'serial_number', 'status'):
                        if fld in defaults:
                            setattr(obj, fld, defaults[fld])
                            save_fields.append(fld)
                    if 'location' in defaults:
                        obj.location = defaults['location']
                        save_fields.append('location')
                    if defaults.get('category'):
                        obj.category = defaults['category']
                        save_fields.append('category_id')
                    obj.save(update_fields=list(dict.fromkeys(save_fields)))
        else:
            obj = ResourceItem.objects.create(**defaults)
            created = True

        # ─── 创建设备授权 ─────────────────────────────────────────────────
        # 为责任人和借用人各创建一条 EquipmentAuthorization
        for person_name, auth_note in [
            (manager_name, '设备责任人'),
            (borrower_name, '设备借用人'),
        ]:
            if not person_name or person_name == manager_name and auth_note == '设备借用人':
                # 跳过空值，且借用人=责任人时不重复
                if not person_name:
                    continue
                if person_name == manager_name and auth_note == '设备借用人':
                    continue

            person_account = (
                Account.objects.filter(display_name=person_name, is_deleted=False).first()
                or Account.objects.filter(username=person_name, is_deleted=False).first()
            )
            if person_account:
                from datetime import date as date_cls
                EquipmentAuthorization.objects.get_or_create(
                    equipment=obj,
                    operator_id=person_account.id,
                    defaults={
                        'operator_name': person_name,
                        'authorized_at': date_cls.today(),
                        'is_active': True,
                        'training_record': f'LIMS历史导入 - {auth_note}',
                        'authorized_by_id': person_account.id,
                    },
                )

        before = {} if created else _model_to_dict(obj)
        action = 'created' if created else 'updated'
        if manager_account:
            logger.debug('  设备注入: %s | 责任人: %s (Account#%d)',
                         code, manager_name, manager_account.id)
        return obj, action, before
    except Exception as ex:
        logger.error('设备注入失败: %s | data=%s', ex, str(raw_data)[:200])
        return None


def _find_or_create_equipment_category(category_name: str):
    """根据设备分类名查找或创建 ResourceCategory"""
    if not category_name:
        from apps.resource.models import ResourceCategory
        return ResourceCategory.objects.filter(code='EQ-LIMS').first()

    from apps.resource.models import ResourceCategory
    # 优先精确匹配
    cat = ResourceCategory.objects.filter(
        name=category_name, resource_type='equipment'
    ).first()
    if cat:
        return cat
    # 尝试在 EQ-LIMS 下创建子类别
    parent = ResourceCategory.objects.filter(code='EQ-LIMS').first()
    if parent:
        cat, _ = ResourceCategory.objects.get_or_create(
            name=category_name,
            resource_type='equipment',
            defaults={
                'code': f'EQ-LIMS-{category_name[:20]}',
                'parent': parent,
                'description': f'LIMS 导入分类: {category_name}',
            },
        )
        return cat
    return ResourceCategory.objects.filter(code='EQ-LIMS').first()


def _inject_personnel(raw_data: dict):
    """
    注入人员档案 -> 六步全链路

    Step 1: Account（统一账号，工作台登录入口）
    Step 2: Staff（人员资质档案，GCP/培训状态）
    Step 3: LabStaffProfile（实验室扩展，角色/排班约束）
    Step 4: AccountRole（角色分配 -> 工作台权限）
    Step 5: EquipmentAuthorization（后续由设备注入阶段完成，此处标记pending）
    Step 6: MethodQualification（默认创建 instrument_operator 基础资质）

    字段说明（兼容两种 LIMS 格式）：
    - 新格式（有 col_X 字段）：字段名含义已正确，姓名='姓名',性别='性别'
    - 旧格式（列偏移 bug）：'姓名'存行号，真实姓名在'性别'列
    - "组别名称"字段 = 组别（始终正确）
    - "上次考核时间"字段 = 岗位状态（旧格式）或上次考核日期（新格式）

    注意：DB 异常不在此处捕获，由上层 _inject_one 的 transaction.atomic() 处理，
    保证事务隔离和正确回滚。
    """
    if True:  # 不用 try/except 包裹，让 DB 异常传播到 _inject_one 的事务处理
        from apps.identity.models import Account, AccountRole
        from apps.hr.models import Staff
        from apps.lims_integration.p0_mapping import (
            extract_personnel_name, extract_job_status, extract_department,
            get_roles_for_group, get_lab_role_for_group, LAB_GROUPS,
        )

        # 提取核心字段
        name = extract_personnel_name(raw_data)
        if not name:
            logger.debug('人员注入：无法提取姓名，跳过')
            return None

        department = extract_department(raw_data)
        job_status = extract_job_status(raw_data)
        employee_no = raw_data.get('工号', raw_data.get('员工编号', raw_data.get('GHBH', ''))).strip()

        # 离职人员：跳过注入（不创建账号）
        if job_status.get('account_status') == 'inactive':
            logger.debug('人员注入：%s 已离职，跳过', name)
            return None

        # ─── Step 1: Account ──────────────────────────────────────────────
        # username 优先使用工号，无工号用姓名
        account_username = employee_no if employee_no else name
        account, acc_created = Account.objects.get_or_create(
            username=account_username,
            defaults={
                'display_name': name,
                'account_type': 'staff',
                'status': 'active',
            },
        )
        if not acc_created:
            # 补充空字段
            changed = False
            if not account.display_name:
                account.display_name = name
                changed = True
            if account.status != 'active':
                account.status = 'active'
                changed = True
            if changed:
                account.save(update_fields=['display_name', 'status'])

        # ─── Step 2: Staff ────────────────────────────────────────────────
        # feishu_open_id 字段 unique=True 且 NOT NULL，LIMS 导入记录用唯一占位符
        # 格式 'lims_XXXXXX'（飞书真实 open_id 以 'ou_' 开头，不会冲突）
        # 当用户后续通过飞书 OAuth 登录时，该值会被自动覆盖为真实 open_id
        import hashlib as _hashlib
        _seed = f"{name}|{department or ''}|{employee_no or ''}"
        lims_feishu_placeholder = f"lims_{_hashlib.md5(_seed.encode()).hexdigest()[:20]}"

        staff_defaults = {
            'name': name,
            'position': job_status.get('training_status', '在岗'),
            'department': department or '',
            'account_fk': account,
            'account_id': account.id,
            'feishu_open_id': lims_feishu_placeholder,
            'training_status': job_status.get('training_status', ''),
        }

        if employee_no:
            staff, staff_created = Staff.objects.get_or_create(
                employee_no=employee_no,
                defaults=staff_defaults,
            )
        else:
            existing_staff = Staff.objects.filter(name=name, is_deleted=False).first()
            if existing_staff:
                staff, staff_created = existing_staff, False
            else:
                # 用 savepoint 保护 create，避免唯一约束失败污染外层事务
                from django.db import transaction as _txn
                try:
                    with _txn.atomic():
                        staff = Staff.objects.create(**staff_defaults)
                    staff_created = True
                except Exception:
                    # 已有同名记录（可能并发写入），回退到查找
                    staff = Staff.objects.filter(name=name).first()
                    staff_created = False
                    if not staff:
                        raise

        # 确保 Staff 关联 Account
        if not staff.account_fk_id:
            staff.account_fk = account
            staff.account_id = account.id
            staff.save(update_fields=['account_fk_id', 'account_id'])

        # ─── Step 3: LabStaffProfile ──────────────────────────────────────
        lab_role_value = get_lab_role_for_group(department)
        if lab_role_value and department in LAB_GROUPS:
            try:
                from apps.lab_personnel.models import LabStaffProfile, CompetencyLevel
                if not hasattr(staff, 'lab_profile'):
                    # 新创建：根据岗位状态推断能力等级
                    status_str = job_status.get('training_status', '')
                    if status_str == '试用期':
                        comp_level = CompetencyLevel.L2_PROBATION
                    else:
                        comp_level = CompetencyLevel.L3_INDEPENDENT  # 在岗人员默认独立期

                    LabStaffProfile.objects.create(
                        staff=staff,
                        lab_role=lab_role_value,
                        competency_level=comp_level,
                        employment_type='full_time',
                        # 默认可排班工作日：周一到周五
                        available_weekdays=[1, 2, 3, 4, 5],
                    )
                    logger.debug('  创建 LabStaffProfile: %s, lab_role=%s', name, lab_role_value)
            except Exception as lab_ex:
                logger.debug('LabStaffProfile 创建失败（非致命）: %s', lab_ex)

        # ─── Step 4: AccountRole（角色分配 -> 工作台权限）─────────────────
        from apps.identity.models import Role
        role_names = get_roles_for_group(department)
        assigned_roles = []
        for role_name in role_names:
            role_obj = Role.objects.filter(name=role_name).first()
            if not role_obj:
                logger.warning('角色不存在: %s（人员: %s）。请先运行 init_lims_roles', role_name, name)
                continue
            _, created_role = AccountRole.objects.get_or_create(
                account=account,
                role=role_obj,
                project_id=None,  # 全局角色
            )
            if created_role:
                assigned_roles.append(role_name)

        if assigned_roles:
            logger.debug('  分配角色: %s -> %s', name, assigned_roles)

        # ─── Step 6: MethodQualification（基础方法资质）──────────────────
        if lab_role_value and department in LAB_GROUPS:
            try:
                from apps.lab_personnel.models import MethodQualification
                from apps.resource.models import DetectionMethodTemplate
                if not MethodQualification.objects.filter(staff=staff).exists():
                    status_str = job_status.get('training_status', '')
                    default_level = 'probation' if status_str == '试用期' else 'independent'
                    # 查找或创建通用方法模板
                    generic_method, _ = DetectionMethodTemplate.objects.get_or_create(
                        code='GENERIC',
                        defaults={
                            'name': '通用检测操作',
                            'category': 'general',
                            'standard_procedure': '[]',
                        },
                    )
                    MethodQualification.objects.create(
                        staff=staff,
                        method=generic_method,
                        level=default_level,
                        notes='LIMS 历史导入 - 通用检测操作资质',
                    )
            except Exception as mq_ex:
                logger.debug('默认 MethodQualification 创建失败（非致命）: %s', mq_ex)

        before = {} if staff_created else _model_to_dict(staff)
        action = 'created' if staff_created else 'updated'
        logger.info('  人员注入: %s | 组别: %s | 角色: %s | 状态: %s',
                    name, department, role_names, job_status.get('training_status', ''))
        return staff, action, before


def _inject_client(raw_data: dict):
    """
    注入客户信息 -> Client + ClientContact

    增强版：
    - 创建 crm.Client
    - 如有联系人信息，同步创建 crm.ClientContact
    - 记录行业、公司类型等字段
    """
    try:
        from apps.crm.models import Client, ClientContact
        from apps.lims_integration.p0_mapping import get_unique_key_value

        name = get_unique_key_value(raw_data, 'client') or _extract_field(raw_data, 'client_name')
        if not name:
            return None

        short_name = raw_data.get('客户简称', raw_data.get('简称', ''))
        industry = raw_data.get('行业', raw_data.get('所属行业', ''))

        obj, created = Client.objects.get_or_create(
            name=name,
            defaults={
                'name': name,
                'short_name': short_name or name[:20],
                'industry': industry,
                'company_type': 'external',
                'level': 'normal',
                'attributes': {
                    '_lims_source': True,
                    '_lims_raw': raw_data,
                },
            },
        )

        # 联动创建联系人（如有）
        contact_name = raw_data.get('联系人', raw_data.get('联系姓名', ''))
        if contact_name and created:
            try:
                ClientContact.objects.get_or_create(
                    client=obj,
                    name=contact_name,
                    defaults={
                        'phone': raw_data.get('联系电话', raw_data.get('联系方式', '')),
                        'email': raw_data.get('联系邮箱', ''),
                        'title': raw_data.get('联系人职位', ''),
                        'role_type': 'contact',
                        'relationship_level': 'working',
                    },
                )
            except Exception as contact_ex:
                logger.debug('ClientContact 创建失败（非致命）: %s', contact_ex)

        before = {} if created else _model_to_dict(obj)
        return obj, 'created' if created else 'updated', before
    except Exception as ex:
        logger.error('客户注入失败: %s', ex)
        return None


def _inject_commission(raw_data: dict):
    """
    注入委托信息 -> Protocol（关联已注入客户）

    增强版：
    - 优先用委托编号作为唯一键
    - 自动关联已入库的 Client（通过 sponsor_id）
    - 状态值映射
    - commission_detection 模块走补充模式（只填空字段）
    """
    try:
        from apps.protocol.models import Protocol
        from apps.crm.models import Client
        from apps.lims_integration.p0_mapping import STATUS_MAP, get_unique_key_value

        code = get_unique_key_value(raw_data, 'commission')
        title = _extract_field(raw_data, 'project_title')
        if not title and not code:
            return None

        # 查找关联客户
        sponsor_id = None
        sponsor_name = _extract_field(raw_data, 'client_name')
        if sponsor_name:
            client = Client.objects.filter(name=sponsor_name, is_deleted=False).first()
            if client:
                sponsor_id = client.id

        # 状态映射
        raw_status = raw_data.get('状态', raw_data.get('项目状态', ''))
        status = STATUS_MAP.get('protocol.status', {}).get(raw_status, 'active')

        defaults = {
            'title': title or code,
            'status': status,
            'parsed_data': raw_data,
        }
        if sponsor_id:
            defaults['sponsor_id'] = sponsor_id
        if raw_data.get('样本量'):
            try:
                defaults['sample_size'] = int(raw_data.get('样本量', 0))
            except (ValueError, TypeError):
                pass

        if code:
            obj, created = Protocol.objects.get_or_create(
                code=code, defaults=defaults
            )
        else:
            obj, created = Protocol.objects.get_or_create(
                title=title, defaults=defaults
            )

        # commission_detection 补充模式：只填充已有 Protocol 的空字段
        if raw_data.get('_supplement_only') and not created:
            changed = False
            if not obj.sponsor_id and sponsor_id:
                obj.sponsor_id = sponsor_id
                changed = True
            test_methods_raw = raw_data.get('检测项目', raw_data.get('检测方法', ''))
            if test_methods_raw and not obj.test_methods:
                try:
                    if isinstance(test_methods_raw, str):
                        obj.test_methods = [m.strip() for m in test_methods_raw.split(',') if m.strip()]
                    else:
                        obj.test_methods = test_methods_raw
                    changed = True
                except Exception:
                    pass
            if changed:
                obj.save()

        before = {} if created else _model_to_dict(obj)
        return obj, 'created' if created else 'updated', before
    except Exception as ex:
        logger.error('委托注入失败: %s', ex)
        return None


def _inject_sample(raw_data: dict):
    """
    注入样品信息 -> Product（关联已注入 Protocol）

    增强版：
    - 自动关联 Protocol（通过 protocol_id）
    - 自动关联 Client/sponsor
    - 有库存信息时创建 SampleInstance
    """
    try:
        from apps.sample.models import Product
        from apps.lims_integration.p0_mapping import STATUS_MAP, get_unique_key_value

        name = _extract_field(raw_data, 'sample_name')
        code = get_unique_key_value(raw_data, 'sample') or _extract_field(raw_data, 'sample_code')
        if not name and not code:
            return None

        # 状态映射
        raw_type = raw_data.get('样品类型', raw_data.get('产品类型', ''))
        product_type = STATUS_MAP.get('sample.product_type', {}).get(raw_type, 'test_product')

        # 关联委托
        protocol_id = None
        protocol_code = _extract_field(raw_data, 'project_code')
        if protocol_code:
            from apps.protocol.models import Protocol
            proto = Protocol.objects.filter(code=protocol_code, is_deleted=False).first()
            if proto:
                protocol_id = proto.id

        # 关联客户
        sponsor_name = _extract_field(raw_data, 'client_name')

        defaults = {
            'name': name or code,
            'product_type': product_type,
            'batch_number': _extract_field(raw_data, 'batch_no'),
            'specification': raw_data.get('规格', ''),
            'storage_condition': raw_data.get('储存条件', raw_data.get('保存条件', '')),
            'sponsor': sponsor_name,
            'attributes': {
                '_lims_source': True,
                '_lims_raw': raw_data,
            },
        }
        if protocol_id:
            defaults['protocol_id'] = protocol_id
        if code:
            defaults['code'] = code

        expiry_raw = raw_data.get('有效期', raw_data.get('失效日期', ''))
        if expiry_raw:
            try:
                from datetime import datetime
                defaults['expiry_date'] = datetime.strptime(str(expiry_raw).strip(), '%Y-%m-%d').date()
            except (ValueError, TypeError):
                pass

        if code:
            obj, created = Product.objects.get_or_create(code=code, defaults=defaults)
        else:
            obj = Product.objects.create(**defaults)
            created = True

        # 有库存记录时创建 SampleInstance
        stock_count = raw_data.get('库存数量', raw_data.get('数量', ''))
        if created and stock_count:
            try:
                from apps.sample.models import SampleInstance
                for i in range(min(int(stock_count), 100)):  # 最多创建100个实例
                    unique_code = f'{code or obj.id}-{i+1:04d}' if code else f'LIMS-{obj.id}-{i+1:04d}'
                    SampleInstance.objects.get_or_create(
                        unique_code=unique_code,
                        defaults={
                            'product': obj,
                            'status': 'in_stock',
                            'storage_location': raw_data.get('存储位置', raw_data.get('存放位置', '')),
                        },
                    )
            except Exception as si_ex:
                logger.debug('SampleInstance 创建失败（非致命）: %s', si_ex)

        before = {} if created else _model_to_dict(obj)
        return obj, 'created' if created else 'updated', before
    except Exception as ex:
        logger.error('样品注入失败: %s', ex)
        return None


def _inject_sample_storage(raw_data: dict):
    """注入样品入库信息 -> SampleInstance（补充库存状态）"""
    try:
        from apps.sample.models import SampleInstance, Product
        from apps.lims_integration.p0_mapping import STATUS_MAP, get_unique_key_value

        unique_code = get_unique_key_value(raw_data, 'sample_storage') or _extract_field(raw_data, 'sample_code')
        if not unique_code:
            return None

        # 先找对应的 Product
        product = None
        code = _extract_field(raw_data, 'sample_code')
        if code:
            product = Product.objects.filter(code=code, is_deleted=False).first()

        raw_status = raw_data.get('状态', raw_data.get('库存状态', '在库'))
        status = STATUS_MAP.get('sample.status', {}).get(raw_status, 'in_stock')

        defaults = {
            'status': status,
            'storage_location': raw_data.get('存储位置', raw_data.get('存放位置', '')),
        }
        if product:
            defaults['product'] = product

        obj, created = SampleInstance.objects.get_or_create(
            unique_code=unique_code,
            defaults=defaults,
        )
        before = {} if created else _model_to_dict(obj)
        return obj, 'created' if created else 'updated', before
    except Exception as ex:
        logger.error('样品入库注入失败: %s', ex)
        return None


def _inject_detection_method(raw_data: dict):
    """注入标准/方法台账 -> DetectionMethodTemplate"""
    try:
        from apps.resource.models import DetectionMethodTemplate
        name = raw_data.get('名称', raw_data.get('方法名称', raw_data.get('name', '')))
        code = raw_data.get('编号', raw_data.get('方法编号', raw_data.get('code', '')))
        if not name and not code:
            return None

        defaults = {
            'name': name or code,
            'code': code or name[:50],
            'category': 'lims_import',
            'standard_procedure': json.dumps(raw_data, ensure_ascii=False),
        }
        if code:
            obj, created = DetectionMethodTemplate.objects.get_or_create(
                code=code, defaults=defaults
            )
        else:
            obj, created = DetectionMethodTemplate.objects.get_or_create(
                name=name, defaults=defaults
            )
        before = {} if created else _model_to_dict(obj)
        return obj, 'created' if created else 'updated', before
    except Exception as ex:
        logger.error('检测方法注入失败: %s', ex)
        return None


def _inject_calibration(raw_data: dict):
    """注入量值溯源记录 -> EquipmentCalibration"""
    try:
        from apps.resource.models import EquipmentCalibration, ResourceItem
        equipment_code = _extract_field(raw_data, 'equipment_code')
        calibration_date = raw_data.get('校准日期', raw_data.get('溯源日期', ''))
        if not calibration_date:
            return None

        equipment = None
        if equipment_code:
            equipment = ResourceItem.objects.filter(code=equipment_code).first()

        if not equipment:
            return None

        obj, created = EquipmentCalibration.objects.get_or_create(
            equipment=equipment,
            calibration_date=calibration_date,
            defaults={
                'result': raw_data.get('结论', raw_data.get('校准结果', '')),
                'next_due_date': raw_data.get('下次校准日期', raw_data.get('有效期', '')),
                'certificate_no': raw_data.get('证书编号', ''),
                'notes': str(raw_data)[:500],
            },
        )
        before = {} if created else _model_to_dict(obj)
        return obj, 'created' if created else 'updated', before
    except Exception as ex:
        logger.error('校准记录注入失败: %s', ex)
        return None


def _inject_reference_material(raw_data: dict):
    """注入标准物质台账 -> ResourceItem（resource_type=reference_material）"""
    try:
        from apps.resource.models import ResourceItem, ResourceCategory
        name = raw_data.get('名称', raw_data.get('标准物质名称', ''))
        code = raw_data.get('编号', raw_data.get('批号', ''))
        if not name:
            return None

        category = ResourceCategory.objects.filter(
            code='reference_material', is_deleted=False
        ).first()

        defaults = {
            'name': name,
            'code': code,
            'status': 'active',
            'notes': str(raw_data)[:500],
        }
        if category:
            defaults['category'] = category

        if code:
            obj, created = ResourceItem.objects.get_or_create(code=code, defaults=defaults)
        else:
            obj = ResourceItem.objects.create(**defaults)
            created = True
        before = {} if created else _model_to_dict(obj)
        return obj, 'created' if created else 'updated', before
    except Exception as ex:
        logger.error('标准物质注入失败: %s', ex)
        return None


def _inject_consumable(raw_data: dict):
    """注入易耗品台账 -> Consumable"""
    try:
        from apps.sample.models_material import Consumable
        name = raw_data.get('名称', raw_data.get('易耗品名称', ''))
        code = raw_data.get('编号', raw_data.get('物品编号', ''))
        if not name:
            return None

        obj, created = Consumable.objects.get_or_create(
            name=name,
            defaults={
                'name': name,
                'code': code,
                'notes': str(raw_data)[:500],
            },
        )
        before = {} if created else _model_to_dict(obj)
        return obj, 'created' if created else 'updated', before
    except Exception as ex:
        logger.error('易耗品注入失败: %s', ex)
        return None


# ============================================================================
# P1 注入函数（合规约束批）
# ============================================================================

def _inject_period_check(raw_data: dict):
    """注入期间核查记录 -> EquipmentCalibration（calibration_type=internal）"""
    try:
        from apps.resource.models import EquipmentCalibration, ResourceItem
        equipment_code = _extract_field(raw_data, 'equipment_code') or raw_data.get('设备编号', '')
        check_date = raw_data.get('核查日期', raw_data.get('检查日期', ''))
        if not check_date:
            return None
        equipment = None
        if equipment_code:
            equipment = ResourceItem.objects.filter(code=equipment_code, is_deleted=False).first()
        if not equipment:
            return None
        obj, created = EquipmentCalibration.objects.get_or_create(
            equipment=equipment,
            calibration_date=check_date,
            calibration_type='internal',
            defaults={
                'result': raw_data.get('结论', raw_data.get('核查结果', '')),
                'next_due_date': raw_data.get('下次核查日期', ''),
                'notes': str(raw_data)[:500],
            },
        )
        before = {} if created else _model_to_dict(obj)
        return obj, 'created' if created else 'updated', before
    except Exception as ex:
        logger.error('期间核查注入失败: %s', ex)
        return None


def _inject_training_record(raw_data: dict):
    """注入培训记录 -> hr.Training（关联 Staff）"""
    try:
        from apps.hr.models import Training, Staff
        staff_name = raw_data.get('培训人员', raw_data.get('姓名', ''))
        training_title = raw_data.get('培训内容', raw_data.get('培训名称', raw_data.get('培训项目', '')))
        if not training_title:
            return None

        # 找到关联人员
        staff = None
        if staff_name:
            staff = Staff.objects.filter(name=staff_name, is_deleted=False).first()

        training_date = raw_data.get('培训日期', raw_data.get('完成日期', ''))

        obj, created = Training.objects.get_or_create(
            title=training_title,
            defaults={
                'title': training_title,
                'content': training_title,
                'training_date': training_date or None,
                'status': 'completed',
                'notes': str(raw_data)[:500],
            },
        )

        # 如果有人员，关联培训记录
        if staff and created:
            try:
                obj.trainees.add(staff.account_fk) if staff.account_fk else None
            except Exception:
                pass

        before = {} if created else _model_to_dict(obj)
        return obj, 'created' if created else 'updated', before
    except Exception as ex:
        logger.error('培训记录注入失败: %s', ex)
        return None


def _inject_competency_record(raw_data: dict):
    """注入能力考核记录 -> lab_personnel.MethodQualification"""
    try:
        from apps.lab_personnel.models import MethodQualification
        from apps.hr.models import Staff
        from apps.resource.models import DetectionMethodTemplate

        staff_name = raw_data.get('考核人员', raw_data.get('姓名', ''))
        method_name = raw_data.get('考核方法', raw_data.get('检测方法', raw_data.get('方法名称', '')))
        if not staff_name or not method_name:
            return None

        staff = Staff.objects.filter(name=staff_name, is_deleted=False).first()
        if not staff:
            return None

        lab_profile = getattr(staff, 'lab_profile', None)
        if not lab_profile:
            return None

        method = DetectionMethodTemplate.objects.filter(name=method_name).first()

        from apps.lims_integration.p0_mapping import STATUS_MAP
        raw_level = raw_data.get('考核结论', raw_data.get('能力等级', ''))
        qual_level = STATUS_MAP.get('personnel.competency_level', {}).get(raw_level, 'independent')

        qualified_date = raw_data.get('考核日期', raw_data.get('通过日期', None))

        create_kw = {
            'staff': lab_profile,
            'method_name': method_name,
        }
        if method:
            create_kw['method'] = method

        obj, created = MethodQualification.objects.get_or_create(
            **create_kw,
            defaults={
                'level': qual_level,
                'qualified_date': qualified_date,
                'notes': str(raw_data)[:500],
            },
        )
        before = {} if created else _model_to_dict(obj)
        return obj, 'created' if created else 'updated', before
    except Exception as ex:
        logger.error('能力考核注入失败: %s', ex)
        return None


def _inject_personnel_auth(raw_data: dict):
    """注入人员授权台账 -> resource.EquipmentAuthorization"""
    try:
        from apps.resource.models import EquipmentAuthorization, ResourceItem
        from apps.hr.models import Staff

        staff_name = raw_data.get('授权人员', raw_data.get('姓名', ''))
        equipment_name = raw_data.get('授权设备', raw_data.get('设备名称', ''))
        if not staff_name or not equipment_name:
            return None

        staff = Staff.objects.filter(name=staff_name, is_deleted=False).first()
        equipment = ResourceItem.objects.filter(name=equipment_name, is_deleted=False).first()
        if not staff or not equipment:
            return None

        auth_date = raw_data.get('授权日期', raw_data.get('批准日期', None))
        expiry_date = raw_data.get('到期日期', raw_data.get('有效期', None))

        operator_id = staff.account_fk_id or staff.account_id

        from datetime import date as date_cls
        obj, created = EquipmentAuthorization.objects.get_or_create(
            equipment=equipment,
            operator_id=operator_id,
            defaults={
                'authorized_at': auth_date or date_cls.today(),
                'expires_at': expiry_date,
                'is_active': True,
                'notes': str(raw_data)[:500],
            },
        )
        before = {} if created else _model_to_dict(obj)
        return obj, 'created' if created else 'updated', before
    except Exception as ex:
        logger.error('人员授权注入失败: %s', ex)
        return None


# ============================================================================
# P2 注入函数（过程追溯批）
# ============================================================================

def _inject_equipment_usage(raw_data: dict):
    """注入设备使用/经历记录 -> EquipmentUsage"""
    try:
        from apps.resource.models import EquipmentUsage, ResourceItem
        from apps.hr.models import Staff

        equipment_code = _extract_field(raw_data, 'equipment_code') or raw_data.get('设备编号', '')
        if not equipment_code:
            return None

        equipment = ResourceItem.objects.filter(code=equipment_code, is_deleted=False).first()
        if not equipment:
            return None

        # 查找操作人
        operator_id = None
        operator_name = raw_data.get('操作人', raw_data.get('使用人', ''))
        if operator_name:
            staff = Staff.objects.filter(name=operator_name, is_deleted=False).first()
            if staff:
                operator_id = staff.account_fk_id or staff.account_id

        usage_date = raw_data.get('使用日期', raw_data.get('操作日期', None))

        obj, created = EquipmentUsage.objects.get_or_create(
            equipment=equipment,
            usage_date=usage_date,
            operator_id=operator_id,
            defaults={
                'usage_type': raw_data.get('使用类型', 'operation'),
                'notes': raw_data.get('备注', ''),
                'notes': str(raw_data)[:500],
            },
        )
        before = {} if created else _model_to_dict(obj)
        return obj, 'created' if created else 'updated', before
    except Exception as ex:
        logger.error('设备使用记录注入失败: %s', ex)
        return None


def _inject_equipment_maintenance(raw_data: dict):
    """注入设备维护/维修记录 -> EquipmentMaintenance"""
    try:
        from apps.resource.models import EquipmentMaintenance, ResourceItem

        equipment_code = _extract_field(raw_data, 'equipment_code') or raw_data.get('设备编号', '')
        if not equipment_code:
            return None

        equipment = ResourceItem.objects.filter(code=equipment_code, is_deleted=False).first()
        if not equipment:
            return None

        maint_type = raw_data.get('维护类型', raw_data.get('类型', 'routine'))
        maint_date = raw_data.get('维护日期', raw_data.get('维修日期', None))

        obj, created = EquipmentMaintenance.objects.get_or_create(
            equipment=equipment,
            maintenance_type=maint_type,
            scheduled_date=maint_date,
            defaults={
                'status': raw_data.get('状态', 'completed'),
                'notes': raw_data.get('备注', raw_data.get('维护内容', '')),
                'notes': str(raw_data)[:500],
            },
        )
        before = {} if created else _model_to_dict(obj)
        return obj, 'created' if created else 'updated', before
    except Exception as ex:
        logger.error('设备维护记录注入失败: %s', ex)
        return None


def _inject_sample_transfer(raw_data: dict):
    """注入子样流转记录 -> SampleTransaction"""
    try:
        from apps.sample.models import SampleTransaction, SampleInstance, Product

        sample_code = _extract_field(raw_data, 'sample_code') or raw_data.get('样品编号', '')
        if not sample_code:
            return None

        # 找到样品实例
        sample_instance = SampleInstance.objects.filter(
            unique_code__icontains=sample_code
        ).first()

        if not sample_instance:
            # 尝试通过 Product 找
            product = Product.objects.filter(code=sample_code, is_deleted=False).first()
            if product:
                sample_instance = SampleInstance.objects.filter(product=product).first()

        if not sample_instance:
            return None

        transaction_type = raw_data.get('流转类型', raw_data.get('操作类型', 'transfer'))
        transaction_date = raw_data.get('流转日期', raw_data.get('操作日期', None))

        obj, created = SampleTransaction.objects.get_or_create(
            sample=sample_instance,
            transaction_type=transaction_type,
            defaults={
                'notes': raw_data.get('备注', ''),
                'transaction_date': transaction_date,
                'notes': str(raw_data)[:500],
            },
        )
        before = {} if created else _model_to_dict(obj)
        return obj, 'created' if created else 'updated', before
    except Exception as ex:
        logger.error('样品流转注入失败: %s', ex)
        return None


