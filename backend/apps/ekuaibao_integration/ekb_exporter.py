"""
易快报数据导出器

职责：
1. 将采集到的原始数据持久化为 JSON 文件（Layer 2: 不可变备份）
2. 将原始数据写入 PostgreSQL t_ekb_raw_record 表
3. 创建并管理 EkbImportBatch 批次记录

JSON 文件目录结构：
  backend/data/ekuaibao_backup/
    20260318_143000/
      manifest.json           -- 批次元信息 + SHA256 校验
      phase1_departments.json -- 各模块数据
      phase2_flows.json
      ...
      checksum.sha256         -- 全部文件校验和
      conflict_report.html    -- 冲突报告（注入后生成）
    latest/                   -- 软链接指向最新批次
"""
import hashlib
import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Tuple

from django.utils import timezone

logger = logging.getLogger('cn_kis.ekuaibao.exporter')

# JSON 备份根目录（相对 backend/ 的路径）
BACKUP_ROOT = Path(__file__).resolve().parent.parent.parent / 'data' / 'ekuaibao_backup'


def _compute_checksum(raw_data: Any) -> str:
    """计算 JSON 数据指纹（SHA256）"""
    data_str = json.dumps(raw_data, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(data_str.encode('utf-8')).hexdigest()


def _make_batch_no() -> str:
    """生成批次号，格式: YYYYMMDD_HHMMSS"""
    return datetime.now().strftime('%Y%m%d_%H%M%S')


class EkbExporter:
    """
    易快报数据导出器（两步操作）：
      1. save_to_files()    — 写 JSON 文件（即使 DB 失败原始数据也安全）
      2. save_to_database() — 写 PostgreSQL EkbRawRecord

    设计原则：JSON 文件先于数据库写入，确保原始数据零丢失风险。
    """

    def __init__(self, batch_no: Optional[str] = None, phase: str = ''):
        self.batch_no = batch_no or _make_batch_no()
        self.phase = phase
        self.backup_dir = BACKUP_ROOT / self.batch_no
        self._db_batch = None

    def get_relative_backup_path(self) -> str:
        """返回相对 backend/ 的备份路径"""
        try:
            backend_root = Path(__file__).resolve().parent.parent.parent
            return str(self.backup_dir.relative_to(backend_root))
        except ValueError:
            return str(self.backup_dir)

    # ------------------------------------------------------------------
    # JSON 文件备份（Layer 2 不可变部分）
    # ------------------------------------------------------------------

    def save_to_files(
        self,
        all_data: Dict[str, List[dict]],
        operator: str = 'system',
    ) -> dict:
        """
        将采集数据保存为 JSON 文件并生成校验清单。

        参数:
            all_data: {module: records_list}
            operator: 操作人

        返回: manifest 信息
        """
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        logger.info('JSON 备份目录: %s', self.backup_dir)

        module_stats = {}
        file_checksums = {}
        total_records = 0

        for module, records in all_data.items():
            module_file = self.backup_dir / f'{module}.json'
            payload = {
                'module': module,
                'total': len(records),
                'exported_at': datetime.now().isoformat(),
                'records': records,
            }
            content = json.dumps(payload, ensure_ascii=False, indent=2)
            with open(module_file, 'w', encoding='utf-8') as f:
                f.write(content)

            file_checksums[f'{module}.json'] = hashlib.sha256(
                content.encode('utf-8')
            ).hexdigest()
            module_stats[module] = len(records)
            total_records += len(records)
            logger.info('[%s] JSON 写入: %d 条', module, len(records))

        # 写 manifest.json
        manifest = {
            'batch_no': self.batch_no,
            'phase': self.phase,
            'operator': operator,
            'ekb_app_key': EKB_APP_KEY_MASKED,
            'created_at': datetime.now().isoformat(),
            'total_records': total_records,
            'modules': module_stats,
            'backup_dir': str(self.backup_dir),
            'files': list(module_stats.keys()),
        }
        manifest_content = json.dumps(manifest, ensure_ascii=False, indent=2)
        with open(self.backup_dir / 'manifest.json', 'w', encoding='utf-8') as f:
            f.write(manifest_content)
        file_checksums['manifest.json'] = hashlib.sha256(
            manifest_content.encode('utf-8')
        ).hexdigest()

        # 写 checksum.sha256（全文件校验和，用于完整性验证）
        checksum_lines = [f'{cs}  {fn}' for fn, cs in sorted(file_checksums.items())]
        with open(self.backup_dir / 'checksum.sha256', 'w', encoding='utf-8') as f:
            f.write('\n'.join(checksum_lines) + '\n')

        # 更新 latest 软链接
        latest_link = BACKUP_ROOT / 'latest'
        if latest_link.exists() or latest_link.is_symlink():
            latest_link.unlink()
        try:
            latest_link.symlink_to(self.backup_dir)
        except (OSError, NotImplementedError):
            pass

        logger.info('备份完成: %d 条记录，目录: %s', total_records, self.backup_dir)
        return manifest

    def verify_checksums(self) -> Tuple[bool, List[str]]:
        """验证备份目录文件完整性"""
        checksum_file = self.backup_dir / 'checksum.sha256'
        if not checksum_file.exists():
            return False, ['checksum.sha256 不存在']

        errors = []
        with open(checksum_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                parts = line.split('  ', 1)
                if len(parts) != 2:
                    continue
                expected_cs, filename = parts
                file_path = self.backup_dir / filename
                if not file_path.exists():
                    errors.append(f'文件缺失: {filename}')
                    continue
                with open(file_path, 'rb') as fh:
                    actual_cs = hashlib.sha256(fh.read()).hexdigest()
                if actual_cs != expected_cs:
                    errors.append(f'校验和不匹配: {filename}')

        return len(errors) == 0, errors

    # ------------------------------------------------------------------
    # PostgreSQL 入库
    # ------------------------------------------------------------------

    def create_batch(
        self,
        modules: List[str],
        module_stats: Dict[str, int],
        total_records: int,
        operator: str = 'system',
        notes: str = '',
    ):
        """创建 EkbImportBatch 记录"""
        from apps.ekuaibao_integration.models import EkbImportBatch, EkbBatchStatus
        self._db_batch = EkbImportBatch.objects.create(
            batch_no=self.batch_no,
            phase=self.phase,
            status=EkbBatchStatus.COLLECTED,
            modules=modules,
            module_stats=module_stats,
            backup_path=self.get_relative_backup_path(),
            total_records=total_records,
            operator=operator,
            notes=notes,
            collected_at=timezone.now(),
        )
        logger.info('创建批次记录: batch_no=%s id=%d', self.batch_no, self._db_batch.id)
        return self._db_batch

    def save_to_database(
        self,
        all_data: Dict[str, List[dict]],
        batch=None,
        batch_size: int = 200,
    ) -> Dict[str, int]:
        """
        将原始数据写入 PostgreSQL t_ekb_raw_record。

        已存在相同 (module, ekb_id, checksum) 的记录自动跳过（幂等）。
        返回: {module: inserted_count}
        """
        from apps.ekuaibao_integration.models import EkbRawRecord

        if batch is None:
            batch = self._db_batch
        if batch is None:
            raise ValueError('需要先调用 create_batch() 或传入 batch 参数')

        insert_stats = {}

        for module, records in all_data.items():
            if not records:
                insert_stats[module] = 0
                continue

            # 获取该模块已有的 checksum 集合（全局去重）
            existing_checksums = set(
                EkbRawRecord.objects.filter(module=module).values_list('checksum', flat=True)
            )

            new_records = []
            for rec in records:
                ekb_id = _extract_ekb_id(rec, module)
                checksum = _compute_checksum(rec)
                if checksum in existing_checksums:
                    continue  # 完全相同的数据跳过

                # 提取 updateTime
                source_updated_at = _extract_update_time(rec)

                new_records.append(EkbRawRecord(
                    batch=batch,
                    module=module,
                    ekb_id=ekb_id,
                    raw_data=rec,
                    scraped_at=timezone.now(),
                    checksum=checksum,
                    source_updated_at=source_updated_at,
                    injection_status='pending',
                ))

            # 批量插入
            inserted = 0
            for i in range(0, len(new_records), batch_size):
                chunk = new_records[i:i + batch_size]
                EkbRawRecord.objects.bulk_create(chunk, ignore_conflicts=True)
                inserted += len(chunk)

            skipped = len(records) - inserted
            insert_stats[module] = inserted
            if skipped > 0:
                logger.info('[%s] 入库: %d 条，跳过重复 %d 条', module, inserted, skipped)
            else:
                logger.info('[%s] 入库: %d 条', module, inserted)

        return insert_stats

    # ------------------------------------------------------------------
    # 读取已有备份
    # ------------------------------------------------------------------

    @classmethod
    def load_from_files(cls, batch_no: str) -> Dict[str, List[dict]]:
        """从 JSON 文件加载指定批次的原始数据"""
        backup_dir = BACKUP_ROOT / batch_no
        if not backup_dir.exists():
            raise FileNotFoundError(f'备份目录不存在: {backup_dir}')

        manifest_file = backup_dir / 'manifest.json'
        if not manifest_file.exists():
            raise FileNotFoundError(f'manifest.json 不存在: {manifest_file}')

        with open(manifest_file, 'r', encoding='utf-8') as f:
            manifest = json.load(f)

        all_data = {}
        for module in manifest.get('modules', {}).keys():
            module_file = backup_dir / f'{module}.json'
            if module_file.exists():
                with open(module_file, 'r', encoding='utf-8') as f:
                    payload = json.load(f)
                all_data[module] = payload.get('records', [])

        total = sum(len(v) for v in all_data.values())
        logger.info('从文件加载批次 %s: %d 个模块，%d 条记录', batch_no, len(all_data), total)
        return all_data

    @classmethod
    def list_batches(cls) -> List[dict]:
        """列出所有本地备份批次"""
        if not BACKUP_ROOT.exists():
            return []
        batches = []
        for d in sorted(BACKUP_ROOT.iterdir(), reverse=True):
            if d.is_dir() and d.name != 'latest':
                manifest_file = d / 'manifest.json'
                if manifest_file.exists():
                    with open(manifest_file, 'r', encoding='utf-8') as f:
                        manifest = json.load(f)
                    batches.append({
                        'batch_no': d.name,
                        'phase': manifest.get('phase', ''),
                        'total_records': manifest.get('total_records', 0),
                        'modules': manifest.get('modules', {}),
                        'created_at': manifest.get('created_at', ''),
                        'path': str(d),
                    })
                else:
                    batches.append({'batch_no': d.name, 'path': str(d), 'manifest': 'missing'})
        return batches

    @classmethod
    def get_latest_batch_no(cls) -> Optional[str]:
        batches = cls.list_batches()
        return batches[0]['batch_no'] if batches else None


# ============================================================================
# 工具函数
# ============================================================================

EKB_APP_KEY_MASKED = 'f052df78-****'


def _extract_ekb_id(rec: dict, module: str) -> str:
    """从记录中提取易快报内部 ID"""
    # 大多数接口用 id 字段
    for key in ('id', 'staffId', 'departmentId', 'budgetId', 'flowId', 'invoiceId'):
        if key in rec and rec[key]:
            return str(rec[key])
    # 降级：用记录内容哈希
    return 'hash:' + hashlib.sha256(
        json.dumps(rec, sort_keys=True).encode('utf-8')
    ).hexdigest()[:16]


def _extract_update_time(rec: dict):
    """从记录中提取更新时间"""
    from django.utils import timezone as tz
    for key in ('updateTime', 'lastModifiedDate', 'updatedAt', 'modifiedTime'):
        val = rec.get(key)
        if val:
            try:
                # 易快报时间戳为毫秒
                if isinstance(val, (int, float)) and val > 1e10:
                    import datetime
                    return tz.make_aware(
                        datetime.datetime.fromtimestamp(val / 1000)
                    )
                elif isinstance(val, str):
                    import datetime
                    # 尝试多种格式
                    for fmt in ('%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d'):
                        try:
                            return tz.make_aware(datetime.datetime.strptime(val[:19], fmt))
                        except ValueError:
                            continue
            except Exception:
                pass
    return None
