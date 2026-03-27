"""
feishu_sweep_watchdog — 飞书采集进程守护 / 防僵死监控

职责（每次运行都执行全部）：
1. 扫描服务器上所有 sweep_feishu_* 进程，超过 --max-hours（默认 6）视为僵死 → kill
2. 将数据库中超时 running checkpoint 重置为 pending（可续跑）
3. 清理 Redis 里残留的分布式互斥锁（锁的 token 对应已死进程则删）
4. 输出简报；--feishu-notify 时推送飞书机器人（可选）

推荐 crontab 频率：每 30 分钟一次
  */30 * * * * cd /data/cn-kis-app && /data/cn-kis-app/venv/bin/python3 manage.py feishu_sweep_watchdog >> /data/logs/feishu_watchdog.log 2>&1

注意：
- kill 信号默认 SIGTERM（--signal 15），进程优雅退出；必要时用 --signal 9
- 仅 kill 本机进程；多机环境只能靠 Redis TTL 自动过期
- 此命令本身应运行极快（< 5s），不持有任何采集锁
"""
import logging
import os
import time
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

logger = logging.getLogger(__name__)

# 所有需要守护的进程名关键字（grep 匹配）
WATCHED_PATTERNS = [
    'sweep_feishu_incremental',
    'sweep_feishu_full_history',
    'sweep_feishu_all',
]

# 各进程类型的独立超时阈值（小时）：
# - incremental：通常 30 分钟内完成，2h 是合理的上限
# - full_history：单用户 IM 可达 600s，197 人全量可能跑 12h+，给 24h 宽裕
# - 若 cmdline 匹配多个 key，取最大值
PATTERN_MAX_HOURS: dict = {
    'sweep_feishu_incremental': 2.0,
    'sweep_feishu_full_history': 24.0,
    'sweep_feishu_all': 24.0,
}

# Redis 互斥锁 key（与 feishu_sweep_lock.py 保持一致）
LOCK_KEYS = [
    'feishu:sweep_incremental:lock',
    'feishu:sweep_full_history:lock',
    'feishu:sweep_global:lock',
]


def _get_sweep_processes():
    """返回所有 sweep_feishu_* 进程列表，每项为 {'pid': int, 'cmd': str, 'age_seconds': float}"""
    procs = []
    now = time.time()
    try:
        for pid_str in os.listdir('/proc'):
            if not pid_str.isdigit():
                continue
            pid = int(pid_str)
            try:
                with open(f'/proc/{pid}/cmdline', 'rb') as f:
                    cmd = f.read().replace(b'\x00', b' ').decode('utf-8', errors='replace').strip()
            except (FileNotFoundError, PermissionError):
                continue

            if not any(p in cmd for p in WATCHED_PATTERNS):
                continue

            # 进程年龄：读 /proc/<pid>/stat 第 22 字段 starttime（jiffies）
            try:
                with open(f'/proc/{pid}/stat', 'r') as f:
                    stat = f.read().split(')')[-1].split()
                # stat 字段 22 是 starttime，单位 jiffies；通常 HZ=100
                hz = os.sysconf(os.sysconf_names['SC_CLK_TCK'])
                starttime_jiffies = int(stat[19])  # 0-indexed: field 22 = index 21 after splitting
                with open('/proc/uptime', 'r') as f:
                    uptime_sec = float(f.read().split()[0])
                proc_start_sec = uptime_sec - (time.process_time() - starttime_jiffies / hz)
                age_sec = (starttime_jiffies / hz)
                # 更可靠方式：直接用 /proc/<pid>/stat 中的 starttime 相对于系统启动时间
                with open('/proc/stat', 'r') as f:
                    for line in f:
                        if line.startswith('btime'):
                            boot_time = float(line.split()[1])
                            break
                    else:
                        boot_time = now - uptime_sec
                proc_start_epoch = boot_time + starttime_jiffies / hz
                age_sec = now - proc_start_epoch
            except Exception:
                age_sec = 0.0

            procs.append({'pid': pid, 'cmd': cmd[:120], 'age_seconds': age_sec})
    except Exception as exc:
        logger.warning('feishu_watchdog: 读取 /proc 失败: %s', exc)
    return procs


def _clean_redis_lock(key: str, valid_pids: set, log_lines: list):
    """若 Redis 锁的 token 对应的 PID 已不存在，则删除该锁。"""
    try:
        from django.core.cache import cache
        token = cache.get(key)
        if not token:
            return
        # token 格式: "<pid>@<hostname>:<time>"（见 feishu_sweep_lock.py）
        pid_str = str(token).split('@')[0]
        if not pid_str.isdigit():
            return
        pid = int(pid_str)
        if pid not in valid_pids:
            cache.delete(key)
            msg = f'  [LOCK-CLEARED] key={key} dead-pid={pid}'
            log_lines.append(msg)
            logger.warning(msg)
    except Exception as exc:
        logger.debug('feishu_watchdog: Redis 锁清理异常 key=%s: %s', key, exc)


class Command(BaseCommand):
    help = '飞书采集进程守护：检测僵死进程并自动 kill；重置超时 running checkpoint；清理孤立 Redis 锁'

    def add_arguments(self, parser):
        parser.add_argument(
            '--max-hours', type=float, default=2.0,
            help='进程存活超过该小时数视为僵死（默认 2）。'
                 'sweep_feishu_incremental（增量）修复后应在 30 分钟内完成；'
                 'sweep_feishu_full_history（全量）建议手动传 --max-hours 12 运行',
        )
        parser.add_argument(
            '--checkpoint-stale-hours', type=float, default=2.0,
            help='checkpoint 卡在 running 超过该小时数则重置为 pending（默认 2）',
        )
        parser.add_argument(
            '--signal', type=int, default=15,
            help='kill 信号（默认 15=SIGTERM；-9=SIGKILL 强制）',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='预演：只打印，不实际 kill / 重置',
        )
        parser.add_argument(
            '--feishu-notify', action='store_true',
            help='发现并处理僵死进程时，通过飞书机器人推送通知（需配置 FEISHU_WATCHDOG_WEBHOOK）',
        )

    def handle(self, *args, **options):
        max_hours = options['max_hours']
        stale_hours = options['checkpoint_stale_hours']
        sig = options['signal']
        dry_run = options['dry_run']
        notify = options['feishu_notify']

        ts = timezone.now().strftime('%Y-%m-%d %H:%M:%S')
        self.stdout.write(f'[feishu_watchdog] {ts}  max_hours={max_hours}  dry_run={dry_run}')

        log_lines = []
        killed_pids = []
        killed_cmds = []

        # ── 1. 扫描进程 ──────────────────────────────────────────────
        procs = _get_sweep_processes()
        alive_pids = {p['pid'] for p in procs}

        for proc in procs:
            age_h = proc['age_seconds'] / 3600
            # 按进程类型取各自的超时上限；--max-hours 只覆盖 incremental 的默认值
            effective_max = max(
                PATTERN_MAX_HOURS.get(p, max_hours)
                for p in PATTERN_MAX_HOURS
                if p in proc['cmd']
            ) if any(p in proc['cmd'] for p in PATTERN_MAX_HOURS) else max_hours
            status = '正常' if age_h < effective_max else '⚠️ 僵死'
            line = f'  PID={proc["pid"]:>7}  age={age_h:.1f}h  limit={effective_max:.0f}h  {status}  {proc["cmd"][:80]}'
            self.stdout.write(line)
            log_lines.append(line)

            if age_h >= effective_max:
                if dry_run:
                    self.stdout.write(self.style.WARNING(f'    [DRY-RUN] 应 kill PID {proc["pid"]}'))
                else:
                    try:
                        os.kill(proc['pid'], sig)
                        msg = f'    [KILLED] PID={proc["pid"]} signal={sig}'
                        self.stdout.write(self.style.ERROR(msg))
                        log_lines.append(msg)
                        killed_pids.append(proc['pid'])
                        killed_cmds.append(proc['cmd'][:60])
                        alive_pids.discard(proc['pid'])
                    except ProcessLookupError:
                        pass  # 进程已自行退出
                    except PermissionError as exc:
                        msg = f'    [KILL-FAILED] PID={proc["pid"]}: {exc}'
                        self.stdout.write(self.style.ERROR(msg))
                        log_lines.append(msg)

        if not procs:
            self.stdout.write('  无 sweep_feishu_* 进程在运行')

        # ── 2. 重置僵死 running checkpoint ────────────────────────────
        try:
            from apps.secretary.models import FeishuMigrationCheckpoint
            cutoff = timezone.now() - timedelta(hours=stale_hours)
            stale_q = FeishuMigrationCheckpoint.objects.filter(status='running').filter(
                Q(running_since__lt=cutoff)
                | Q(running_since__isnull=True, updated_at__lt=cutoff),
            )
            n_stale = stale_q.count()
            if n_stale > 0:
                if dry_run:
                    msg = f'  [DRY-RUN] 发现 {n_stale} 条 stale running checkpoint（>{stale_hours}h）'
                    self.stdout.write(self.style.WARNING(msg))
                else:
                    stale_q.update(
                        status='pending',
                        page_token='',
                        error_log='',
                        running_since=None,
                    )
                    msg = f'  [CHECKPOINT-RESET] {n_stale} 条 stale running → pending'
                    self.stdout.write(msg)
                log_lines.append(msg)
            else:
                self.stdout.write('  无超时 running checkpoint')
        except Exception as exc:
            msg = f'  [CHECKPOINT-ERR] {exc}'
            self.stdout.write(msg)
            log_lines.append(msg)

        # ── 3. 清理孤立 Redis 锁 ──────────────────────────────────────
        for key in LOCK_KEYS:
            _clean_redis_lock(key, alive_pids, log_lines)

        # ── 4. 飞书通知 ───────────────────────────────────────────────
        if notify and killed_pids and not dry_run:
            _send_feishu_notify(killed_pids, killed_cmds, n_stale if 'n_stale' in dir() else 0)

        summary = (
            f'[feishu_watchdog] 完成  killed={len(killed_pids)}  '
            f'checkpoint_reset={n_stale if "n_stale" in dir() else 0}  '
            f'dry_run={dry_run}'
        )
        self.stdout.write(summary)
        logger.info(summary)


def _send_feishu_notify(killed_pids: list, killed_cmds: list, reset_count: int):
    """推送飞书机器人（FEISHU_WATCHDOG_WEBHOOK 环境变量）"""
    webhook = os.getenv('FEISHU_WATCHDOG_WEBHOOK', '')
    if not webhook:
        return
    try:
        import json
        import urllib.request

        lines = ['⚠️ feishu_sweep_watchdog 自动处理僵死进程']
        for pid, cmd in zip(killed_pids, killed_cmds):
            lines.append(f'• kill PID={pid}: {cmd}')
        if reset_count:
            lines.append(f'• 重置 {reset_count} 条 stale running checkpoint → pending')
        body = json.dumps({'msg_type': 'text', 'content': {'text': '\n'.join(lines)}}).encode()
        req = urllib.request.Request(webhook, data=body, headers={'Content-Type': 'application/json'})
        urllib.request.urlopen(req, timeout=5)
    except Exception as exc:
        logger.warning('feishu_watchdog: 飞书通知失败: %s', exc)
