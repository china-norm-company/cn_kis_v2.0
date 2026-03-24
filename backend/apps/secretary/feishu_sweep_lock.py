"""
飞书采集全局互斥 — 防止多进程/cron 叠跑（V1/V2 合并后运营）

两类独立锁（默认可并行：长全量 + 定时增量）：
- **增量** `sweep_feishu_incremental`
- **全量历史** `sweep_feishu_full_history`（防多台机器/多个 cron 同时全量）

可选 **全局串行**（大版本全量窗口内建议开启，避免与增量争用 token / DB）：
  FEISHU_SWEEP_SERIALIZE_ALL=true
  此时增量与全量共用同一 flock + Redis key（见下方全局项）。

环境变量（共用）：
  FEISHU_SWEEP_SKIP_LOCK=1           跳过全部锁（仅本地调试）
  FEISHU_SWEEP_DISTRIBUTED_LOCK=0     仅本机 flock，不用 Cache

增量：
  FEISHU_SWEEP_LOCK_FILE             默认 /tmp/cn_kis_feishu_sweep_incremental.lock
  FEISHU_SWEEP_LOCK_TTL              默认 14400（秒）

全量：
  FEISHU_SWEEP_FULL_LOCK_FILE        默认 /tmp/cn_kis_feishu_sweep_full_history.lock
  FEISHU_SWEEP_FULL_LOCK_TTL         默认 86400（全量可能持续很久，避免锁提前过期叠跑）

全局串行：
  FEISHU_SWEEP_GLOBAL_LOCK_FILE      默认 /tmp/cn_kis_feishu_sweep_global.lock
  FEISHU_SWEEP_GLOBAL_LOCK_TTL        默认 86400
"""
from __future__ import annotations

import logging
import os
import socket
import time
from typing import Optional

logger = logging.getLogger(__name__)


def _truthy_env(name: str) -> bool:
    return os.getenv(name, '').lower() in ('1', 'true', 'yes')


class FeishuSweepLock:
    """单类采集互斥（本机 flock + Django cache.add）。"""

    def __init__(
        self,
        *,
        cache_key: str,
        default_lock_file: str,
        env_lock_file: str,
        env_ttl: str,
        default_ttl: int,
    ) -> None:
        self.cache_key = cache_key
        self.default_lock_file = default_lock_file
        self.env_lock_file = env_lock_file
        self.env_ttl = env_ttl
        self.default_ttl = default_ttl
        self._file_fp = None
        self._cache_token: Optional[str] = None
        self._file_locked = False

    def try_begin(self) -> bool:
        if _truthy_env('FEISHU_SWEEP_SKIP_LOCK'):
            logger.info('feishu_sweep_lock: skipped (FEISHU_SWEEP_SKIP_LOCK) key=%s', self.cache_key)
            return True

        use_dist = os.getenv('FEISHU_SWEEP_DISTRIBUTED_LOCK', 'true').lower() not in ('0', 'false', 'no')
        lock_path = os.getenv(self.env_lock_file, self.default_lock_file)
        ttl = int(os.getenv(self.env_ttl, str(self.default_ttl)))

        try:
            import fcntl
        except ImportError:
            fcntl = None  # type: ignore

        if fcntl:
            try:
                self._file_fp = open(lock_path, 'a+', encoding='utf-8')
                fcntl.flock(self._file_fp.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                self._file_locked = True
            except BlockingIOError:
                logger.warning('feishu_sweep_lock: 本机锁已被占用 (%s) key=%s', lock_path, self.cache_key)
                return False
            except OSError as exc:
                logger.warning('feishu_sweep_lock: 本机锁异常 %s，继续尝试分布式锁 key=%s', exc, self.cache_key)
                self._file_fp = None
                self._file_locked = False

        if use_dist:
            from django.core.cache import cache

            token = f'{os.getpid()}@{socket.gethostname()}:{time.time()}'
            if not cache.add(self.cache_key, token, ttl):
                logger.warning('feishu_sweep_lock: 分布式锁已被占用 (key=%s)', self.cache_key)
                self._release_file_only()
                return False
            self._cache_token = token

        return True

    def _release_file_only(self) -> None:
        if not self._file_locked or self._file_fp is None:
            self._file_fp = None
            self._file_locked = False
            return
        try:
            import fcntl

            fcntl.flock(self._file_fp.fileno(), fcntl.LOCK_UN)
        except Exception as exc:
            logger.debug('feishu_sweep_lock: flock unlock: %s', exc)
        try:
            self._file_fp.close()
        except Exception:
            pass
        self._file_fp = None
        self._file_locked = False

    def end(self) -> None:
        if _truthy_env('FEISHU_SWEEP_SKIP_LOCK'):
            return

        if self._cache_token is not None:
            from django.core.cache import cache

            try:
                cur = cache.get(self.cache_key)
                if cur == self._cache_token:
                    cache.delete(self.cache_key)
            except Exception as exc:
                logger.warning('feishu_sweep_lock: 释放分布式锁失败 key=%s err=%s', self.cache_key, exc)
            self._cache_token = None

        self._release_file_only()


_INCREMENTAL = FeishuSweepLock(
    cache_key='feishu:sweep_incremental:lock',
    default_lock_file='/tmp/cn_kis_feishu_sweep_incremental.lock',
    env_lock_file='FEISHU_SWEEP_LOCK_FILE',
    env_ttl='FEISHU_SWEEP_LOCK_TTL',
    default_ttl=4 * 3600,
)
_FULL_HISTORY = FeishuSweepLock(
    cache_key='feishu:sweep_full_history:lock',
    default_lock_file='/tmp/cn_kis_feishu_sweep_full_history.lock',
    env_lock_file='FEISHU_SWEEP_FULL_LOCK_FILE',
    env_ttl='FEISHU_SWEEP_FULL_LOCK_TTL',
    default_ttl=86400,
)
_GLOBAL = FeishuSweepLock(
    cache_key='feishu:sweep_global:lock',
    default_lock_file='/tmp/cn_kis_feishu_sweep_global.lock',
    env_lock_file='FEISHU_SWEEP_GLOBAL_LOCK_FILE',
    env_ttl='FEISHU_SWEEP_GLOBAL_LOCK_TTL',
    default_ttl=86400,
)


def _serialize_all() -> bool:
    return _truthy_env('FEISHU_SWEEP_SERIALIZE_ALL')


def _lock_for_incremental() -> FeishuSweepLock:
    return _GLOBAL if _serialize_all() else _INCREMENTAL


def _lock_for_full_history() -> FeishuSweepLock:
    return _GLOBAL if _serialize_all() else _FULL_HISTORY


def try_begin_incremental_sweep() -> bool:
    """增量采集入口锁。"""
    return _lock_for_incremental().try_begin()


def end_incremental_sweep() -> None:
    _lock_for_incremental().end()


def try_begin_full_history_sweep() -> bool:
    """全量历史迁移入口锁（防多全量叠跑；可与增量并行，除非 FEISHU_SWEEP_SERIALIZE_ALL）。"""
    return _lock_for_full_history().try_begin()


def end_full_history_sweep() -> None:
    _lock_for_full_history().end()
