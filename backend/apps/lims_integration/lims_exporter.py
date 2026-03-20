"""
LIMS 数据备份导出器

职责：
1. 将采集到的原始数据持久化为 JSON 文件（Layer 2: 不可变备份）
2. 将原始数据写入 PostgreSQL raw_lims 表（RawLimsRecord）
3. 创建并管理 LimsImportBatch 批次记录

JSON 文件目录结构：
  backend/data/lims_backup/
    20260318_143000/
      manifest.json         -- 批次元信息
      equipment.json        -- 设备台账原始数据
      personnel.json        -- 人员档案原始数据
      ...（每模块独立文件）
      conflict_report.html  -- 冲突报告（注入后生成）
    latest/                 -- 软链接指向最新批次
"""
import hashlib
import json
import logging
import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from django.utils import timezone

logger = logging.getLogger('cn_kis.lims.exporter')

# JSON 备份根目录（相对 backend/ 的路径）
BACKUP_ROOT = Path(__file__).resolve().parent.parent.parent / 'data' / 'lims_backup'


def _compute_checksum(raw_data: dict) -> str:
    """计算数据指纹（SHA256）"""
    data_str = json.dumps(raw_data, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(data_str.encode('utf-8')).hexdigest()


def _make_batch_no() -> str:
    """生成批次号，格式: YYYYMMDD_HHMMSS"""
    return datetime.now().strftime('%Y%m%d_%H%M%S')


class LimsExporter:
    """
    LIMS 数据备份导出器

    两步操作：
      1. save_to_files()    — 写 JSON 文件
      2. save_to_database() — 写 PostgreSQL RawLimsRecord

    两步分离设计，确保即使数据库写入失败，JSON 文件依然安全保留。
    """

    def __init__(self, batch_no: Optional[str] = None):
        self.batch_no = batch_no or _make_batch_no()
        self.backup_dir = BACKUP_ROOT / self.batch_no
        self._db_batch: Optional[Any] = None  # LimsImportBatch 实例

    def get_backup_dir(self) -> Path:
        return self.backup_dir

    def get_relative_backup_path(self) -> str:
        """返回相对 backend/ 的备份路径"""
        try:
            backend_root = Path(__file__).resolve().parent.parent.parent
            return str(self.backup_dir.relative_to(backend_root))
        except ValueError:
            return str(self.backup_dir)

    # ------------------------------------------------------------------
    # JSON 文件备份
    # ------------------------------------------------------------------

    def save_to_files(
        self,
        all_data: Dict[str, Tuple[List[Dict], Dict]],
        operator: str = 'system',
    ) -> Dict[str, Any]:
        """
        将采集数据保存为 JSON 文件。

        参数:
            all_data: {module: (records, meta)} 格式
            operator: 操作人（用于 manifest）

        返回: manifest 信息
        """
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        logger.info('JSON 备份目录: %s', self.backup_dir)

        module_stats = {}
        total_records = 0

        for module, (records, meta) in all_data.items():
            module_file = self.backup_dir / f'{module}.json'
            payload = {
                'module': module,
                'label': meta.get('label', module),
                'pgid': meta.get('pgid', ''),
                'total': len(records),
                'parse_method': meta.get('parse_method', 'unknown'),
                'errors': meta.get('errors', []),
                'exported_at': datetime.now().isoformat(),
                'records': records,
            }
            with open(module_file, 'w', encoding='utf-8') as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
            module_stats[module] = len(records)
            total_records += len(records)
            logger.info('[%s] 写入 JSON: %d 条 -> %s', module, len(records), module_file.name)

        # 写 manifest
        manifest = {
            'batch_no': self.batch_no,
            'operator': operator,
            'lims_url': 'http://lims.china-norm.com',
            'lims_account': 'malm',
            'created_at': datetime.now().isoformat(),
            'total_records': total_records,
            'modules': module_stats,
            'backup_dir': str(self.backup_dir),
            'files': [f'{m}.json' for m in all_data.keys()] + ['manifest.json'],
        }
        manifest_file = self.backup_dir / 'manifest.json'
        with open(manifest_file, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)

        # 更新 latest 软链接
        latest_link = BACKUP_ROOT / 'latest'
        if latest_link.exists() or latest_link.is_symlink():
            latest_link.unlink()
        try:
            latest_link.symlink_to(self.backup_dir)
        except (OSError, NotImplementedError):
            # Windows 不支持符号链接，跳过
            pass

        logger.info('JSON 备份完成: %d 条记录，目录: %s', total_records, self.backup_dir)
        return manifest

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
        """创建 LimsImportBatch 记录"""
        from apps.lims_integration.models import LimsImportBatch, BatchStatus
        self._db_batch = LimsImportBatch.objects.create(
            batch_no=self.batch_no,
            status=BatchStatus.COLLECTED,
            modules=modules,
            module_stats=module_stats,
            backup_path=self.get_relative_backup_path(),
            total_records=total_records,
            operator=operator,
            notes=notes,
            collected_at=timezone.now(),
        )
        logger.info('创建批次记录: batch_no=%s, id=%d', self.batch_no, self._db_batch.id)
        return self._db_batch

    def save_to_database(
        self,
        all_data: Dict[str, Tuple[List[Dict], Dict]],
        batch=None,
        batch_size: int = 200,
    ) -> Dict[str, int]:
        """
        将原始数据写入 PostgreSQL t_raw_lims_record。

        使用 bulk_create 批量写入提升性能。
        已存在相同 (module, lims_id, checksum) 的记录自动跳过。
        返回: {module: inserted_count}
        """
        from apps.lims_integration.models import RawLimsRecord

        if batch is None:
            batch = self._db_batch
        if batch is None:
            raise ValueError('需要先调用 create_batch() 或传入 batch 参数')

        insert_stats = {}

        for module, (records, meta) in all_data.items():
            if not records:
                insert_stats[module] = 0
                continue

            new_records = []
            existing_checksums = set(
                RawLimsRecord.objects.filter(
                    module=module
                ).values_list('checksum', flat=True)
            )

            for rec in records:
                raw_data = rec.get('raw_data', {})
                checksum = _compute_checksum(raw_data)
                if checksum in existing_checksums:
                    continue  # 完全相同的数据跳过
                new_records.append(RawLimsRecord(
                    batch=batch,
                    module=module,
                    lims_id=rec.get('lims_id', ''),
                    lims_page_url=rec.get('source_url', ''),
                    raw_data=raw_data,
                    scraped_at=timezone.now(),
                    checksum=checksum,
                    injection_status='pending',
                ))

            # 批量插入
            inserted = 0
            for i in range(0, len(new_records), batch_size):
                chunk = new_records[i:i + batch_size]
                RawLimsRecord.objects.bulk_create(chunk, ignore_conflicts=True)
                inserted += len(chunk)

            insert_stats[module] = inserted
            logger.info('[%s] 数据库入库: %d 条（跳过 %d 条重复）',
                        module, inserted, len(records) - inserted)

        return insert_stats

    # ------------------------------------------------------------------
    # 读取已有备份
    # ------------------------------------------------------------------

    @classmethod
    def load_from_files(cls, batch_no: str) -> Dict[str, List[Dict]]:
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

        logger.info('从文件加载批次 %s: %d 个模块，%d 条记录',
                    batch_no, len(all_data),
                    sum(len(v) for v in all_data.values()))
        return all_data

    @classmethod
    def list_batches(cls) -> List[Dict]:
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
        """获取最新备份批次号"""
        batches = cls.list_batches()
        return batches[0]['batch_no'] if batches else None
