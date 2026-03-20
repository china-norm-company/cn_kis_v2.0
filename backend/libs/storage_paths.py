from __future__ import annotations

import os
import shutil
from dataclasses import dataclass
from pathlib import Path


def _to_path(value: str | os.PathLike[str] | None) -> Path | None:
    if not value:
        return None
    return Path(value).expanduser().resolve()


def _is_server_layout(base_dir: Path) -> bool:
    return str(base_dir.resolve()).startswith('/opt/')


def _can_use_explicit_path(path: Path, base_dir: Path) -> bool:
    if _is_server_layout(base_dir):
        return True
    parent = path if path.exists() else path.parent
    return parent.exists() and os.access(parent, os.W_OK)


def default_storage_root(base_dir: Path) -> Path:
    explicit = _to_path(os.getenv('STORAGE_ROOT'))
    if explicit and _can_use_explicit_path(explicit, base_dir):
        return explicit
    data_root = Path('/data')
    if _is_server_layout(base_dir) and data_root.exists() and os.access(data_root, os.W_OK):
        return data_root
    return base_dir


def resolve_media_root(base_dir: Path) -> Path:
    explicit = _to_path(os.getenv('MEDIA_ROOT'))
    if explicit and _can_use_explicit_path(explicit, base_dir):
        return explicit
    return default_storage_root(base_dir) / 'media'


def resolve_log_dir(base_dir: Path) -> Path:
    explicit = _to_path(os.getenv('LOG_DIR'))
    if explicit and _can_use_explicit_path(explicit, base_dir):
        return explicit
    return default_storage_root(base_dir) / 'logs'


@dataclass(frozen=True)
class DiskUsageSnapshot:
    label: str
    path: str
    total_bytes: int
    used_bytes: int
    free_bytes: int
    used_pct: int

    @property
    def free_gb(self) -> int:
        return int(self.free_bytes / 1024 / 1024 / 1024)


def get_disk_usage(label: str, path: Path) -> DiskUsageSnapshot:
    usage = shutil.disk_usage(path)
    used_pct = int((usage.used / usage.total) * 100) if usage.total else 0
    return DiskUsageSnapshot(
        label=label,
        path=str(path),
        total_bytes=usage.total,
        used_bytes=usage.used,
        free_bytes=usage.free,
        used_pct=used_pct,
    )


def ensure_directory(path: Path) -> Path:
    try:
        path.mkdir(parents=True, exist_ok=True)
    except OSError:
        # settings 导入阶段不应因只读文件系统或尚未挂载的数据盘而失败；
        # 运行期由采集命令的资源预检负责兜底。
        pass
    return path
