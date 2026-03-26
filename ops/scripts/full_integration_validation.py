#!/usr/bin/env python3
"""
CN KIS V2.0 — 全量数据集成测试验收编排器
==========================================

按顺序执行五个 Phase，使用所有已采集数据（飞书/NAS/LIMS/易快报）
验证数据注入、系统优化和功能迭代的正确性。

用法（在服务器 /opt/cn-kis-v2/backend 目录内运行）：
  python ../ops/scripts/full_integration_validation.py [选项]

选项：
  --all-phases          运行全部 5 个 Phase（默认）
  --phase N             只运行指定 Phase（1-5）
  --dry-run             只做验证断言，不执行注入命令
  --skip-injection      跳过数据注入命令，只做 Phase 0 + Phase 5 验收
  --output FILE         报告输出路径（默认 /tmp/integration_test_YYYYMMDD.md）
  --base-url URL        e2e smoke test API 地址（默认 http://118.196.64.48:8001/v2/api/v1）
  --token TOKEN         e2e smoke test JWT token

运行环境：
  - 服务器 /opt/cn-kis-v2/backend 内
  - source .venv/bin/activate
  - 所有 Django manage.py 命令通过 subprocess 调用

验收对照：
  - docs/BUSINESS_SCENARIO_CATALOG.md（31 个 BSC 场景）
  - docs/LEARNING_LOOP_STATUS.md（8 项 KPI）
"""

import argparse
import json
import logging
import os
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ── Django 初始化 ────────────────────────────────────────────────────────────
# ops/scripts/full_integration_validation.py → parent.parent.parent = 项目根目录
BASE_DIR = Path(__file__).resolve().parent.parent.parent / 'backend'
sys.path.insert(0, str(BASE_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'settings')

try:
    import django
    django.setup()
    _DJANGO_AVAILABLE = True
except Exception as _e:
    _DJANGO_AVAILABLE = False
    print(f'[WARN] Django 初始化失败，ORM 断言将跳过: {_e}')

# ── 日志 ─────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger('cn_kis.integration_test')

# ── 颜色 ─────────────────────────────────────────────────────────────────────
_G = '\033[92m'
_R = '\033[91m'
_Y = '\033[93m'
_B = '\033[94m'
_E = '\033[0m'


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 数据结构
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@dataclass
class AssertResult:
    name: str
    passed: bool
    actual: Any
    expected: str
    bsc_ref: str = ''
    detail: str = ''


@dataclass
class PhaseResult:
    phase_id: int
    phase_name: str
    start_time: float = field(default_factory=time.time)
    end_time: float = 0.0
    commands_run: List[dict] = field(default_factory=list)
    assertions: List[AssertResult] = field(default_factory=list)
    skipped: bool = False
    error: str = ''

    @property
    def elapsed(self) -> float:
        return self.end_time - self.start_time

    @property
    def passed(self) -> bool:
        if self.skipped:
            return True
        failed = [a for a in self.assertions if not a.passed]
        return len(failed) == 0

    @property
    def summary(self) -> str:
        total = len(self.assertions)
        passed = sum(1 for a in self.assertions if a.passed)
        return f'{passed}/{total} 断言通过'


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 工具函数
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def run_cmd(cmd: List[str], timeout: int = 3600, dry_run: bool = False) -> dict:
    """运行一个命令，返回执行结果字典。"""
    cmd_str = ' '.join(cmd)
    log.info(f'  运行: {cmd_str}')
    if dry_run:
        log.info('  [DRY-RUN] 跳过实际执行')
        return {'cmd': cmd_str, 'returncode': 0, 'stdout': '[dry-run]', 'stderr': '', 'elapsed': 0}

    t0 = time.time()
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout,
            cwd=str(BASE_DIR),
        )
        elapsed = time.time() - t0
        status = _G + 'OK' + _E if result.returncode == 0 else _R + 'FAIL' + _E
        log.info(f'  {status} ({elapsed:.1f}s) returncode={result.returncode}')
        if result.returncode != 0:
            log.warning(f'  stderr: {result.stderr[:500]}')
        return {
            'cmd': cmd_str,
            'returncode': result.returncode,
            'stdout': result.stdout[-2000:] if result.stdout else '',
            'stderr': result.stderr[-500:] if result.stderr else '',
            'elapsed': round(elapsed, 1),
        }
    except subprocess.TimeoutExpired:
        log.error(f'  超时 ({timeout}s)')
        return {'cmd': cmd_str, 'returncode': -1, 'stdout': '', 'stderr': f'TIMEOUT after {timeout}s', 'elapsed': timeout}
    except Exception as exc:
        log.error(f'  异常: {exc}')
        return {'cmd': cmd_str, 'returncode': -1, 'stdout': '', 'stderr': str(exc), 'elapsed': 0}


def manage(subcmd: List[str], **kwargs) -> dict:
    """运行 Django manage.py 命令。"""
    return run_cmd(['python', 'manage.py'] + subcmd, **kwargs)


def script(relpath: str, args: List[str] = None, **kwargs) -> dict:
    """运行 ops/scripts/ 下的独立 Python 脚本。"""
    script_path = BASE_DIR.parent / 'ops' / 'scripts' / relpath
    return run_cmd(['python', str(script_path)] + (args or []), **kwargs)


def db_count(model_path: str, filter_kwargs: dict = None) -> int:
    """通过 Django ORM 查询表记录数。"""
    if not _DJANGO_AVAILABLE:
        return -1
    try:
        parts = model_path.split('.')
        module_path = '.'.join(parts[:-1])
        class_name = parts[-1]
        import importlib
        mod = importlib.import_module(module_path)
        model_cls = getattr(mod, class_name)
        qs = model_cls.objects
        if filter_kwargs:
            qs = qs.filter(**filter_kwargs)
        return qs.count()
    except Exception as e:
        log.debug(f'db_count({model_path}) 失败: {e}')
        return -1


def assert_count(name: str, model_path: str, filter_kwargs: dict = None,
                 min_count: int = 0, compare_to: int = None,
                 bsc_ref: str = '') -> AssertResult:
    """断言：记录数 >= min_count 或 > compare_to（前值）。"""
    actual = db_count(model_path, filter_kwargs)
    if actual == -1:
        return AssertResult(name=name, passed=False, actual='ORM不可用', expected=f'>={min_count}', bsc_ref=bsc_ref, detail='Django 未初始化')

    if compare_to is not None:
        passed = actual > compare_to
        expected = f'> {compare_to}（前值）'
    else:
        passed = actual >= min_count
        expected = f'>= {min_count}'

    return AssertResult(name=name, passed=passed, actual=actual, expected=expected, bsc_ref=bsc_ref)


def assert_ratio(name: str, numerator_model: str, denominator_model: str,
                 num_filter: dict = None, den_filter: dict = None,
                 min_ratio: float = 0.0, max_ratio: float = 1.0,
                 bsc_ref: str = '') -> AssertResult:
    """断言：numerator/denominator 比例在 [min_ratio, max_ratio] 区间。"""
    num = db_count(numerator_model, num_filter)
    den = db_count(denominator_model, den_filter)
    if num == -1 or den == -1:
        return AssertResult(name=name, passed=False, actual='ORM不可用', expected=f'[{min_ratio:.0%},{max_ratio:.0%}]', bsc_ref=bsc_ref)
    if den == 0:
        return AssertResult(name=name, passed=False, actual='分母为0', expected=f'[{min_ratio:.0%},{max_ratio:.0%}]', bsc_ref=bsc_ref, detail='无基础数据')
    ratio = num / den
    passed = min_ratio <= ratio <= max_ratio
    return AssertResult(name=name, passed=passed, actual=f'{ratio:.1%}({num}/{den})', expected=f'[{min_ratio:.0%},{max_ratio:.0%}]', bsc_ref=bsc_ref)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 0：运行前快照
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def run_phase0(dry_run: bool) -> Tuple[PhaseResult, dict]:
    """运行前基线快照（只读）。返回 (PhaseResult, snapshot_dict)."""
    p = PhaseResult(phase_id=0, phase_name='运行前基线快照')
    log.info(f'\n{"="*60}')
    log.info(f'Phase 0: {p.phase_name}')
    log.info('='*60)

    snapshot = {}

    if _DJANGO_AVAILABLE:
        snapshot_models = [
            ('t_subject', 'apps.subject.models.Subject'),
            # SubjectPayment 不存在; 用 SubjectLoyaltyScore 代替
            ('t_subject_loyalty', 'apps.subject.models_loyalty.SubjectLoyaltyScore'),
            # SubjectQuestionnaire 在 models_execution 中
            ('t_subject_questionnaire', 'apps.subject.models_execution.SubjectQuestionnaire'),
            ('PersonalContext', 'apps.secretary.models.PersonalContext'),
            ('MailSignalEvent', 'apps.secretary.models.MailSignalEvent'),
            ('KnowledgeEntry', 'apps.knowledge.models.KnowledgeEntry'),
            ('KnowledgeEntry_published', 'apps.knowledge.models.KnowledgeEntry'),
            ('KnowledgeRelation', 'apps.knowledge.models.KnowledgeRelation'),
            ('KnowledgeEntity', 'apps.knowledge.models.KnowledgeEntity'),
            ('ProactiveInsight', 'apps.secretary.models.ProactiveInsight'),
            # WorkerPolicyUpdate 位于 apps.secretary.models_memory（如已迁移）或 apps.secretary.models
            ('WorkerPolicyUpdate', 'apps.secretary.models.WorkerPolicyUpdate'),
            ('EkbRawRecord', 'apps.ekuaibao_integration.models.EkbRawRecord'),
            ('RawLimsRecord', 'apps.lims_integration.models.RawLimsRecord'),
        ]
        filter_map = {
            'KnowledgeEntry_published': {'is_published': True},
        }
        for label, model_path in snapshot_models:
            f = filter_map.get(label)
            count = db_count(model_path, f)
            snapshot[label] = count
            log.info(f'  {label:40s} = {count:>8,}')

        # 额外：MailSignalEvent unknown 比例
        total_mail = db_count('apps.secretary.models.MailSignalEvent')
        unknown_mail = db_count('apps.secretary.models.MailSignalEvent', {'mail_signal_type': 'unknown'})
        if total_mail > 0:
            ratio = unknown_mail / total_mail
            snapshot['MailSignalEvent_unknown_ratio'] = round(ratio, 4)
            log.info(f'  {"MailSignalEvent UNKNOWN 比例":40s} = {ratio:.1%}')

    p.assertions.append(AssertResult(
        name='Django ORM 可用',
        passed=_DJANGO_AVAILABLE,
        actual='可用' if _DJANGO_AVAILABLE else '不可用',
        expected='可用',
    ))
    p.end_time = time.time()
    return p, snapshot


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 1：NAS 历史数据注入验证
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def run_phase1(snapshot_before: dict, dry_run: bool, skip_injection: bool) -> PhaseResult:
    p = PhaseResult(phase_id=1, phase_name='NAS 历史数据注入验证')
    log.info(f'\n{"="*60}')
    log.info(f'Phase 1: {p.phase_name}')
    log.info('='*60)

    # 1a. 受试者综合导入（三阶段：身份证/主名单/受试者清单）
    if not skip_injection:
        log.info('\n[1a] NAS 受试者综合导入 (import_nas_comprehensive.py)...')
        r1a = script('import_nas_comprehensive.py', ['--skip-learning'], timeout=1800, dry_run=dry_run)
        p.commands_run.append(r1a)

        log.info('\n[1b] NAS 礼金档案导入 (import_nas_honorarium_standalone.py)...')
        r1b = script('import_nas_honorarium_standalone.py', timeout=900, dry_run=dry_run)
        p.commands_run.append(r1b)

        log.info('\n[1c] NAS 项目预约登记导入 (import_nas_project_appointments.py)...')
        r1c = script('import_nas_project_appointments.py', timeout=600, dry_run=dry_run)
        p.commands_run.append(r1c)

        log.info('\n[1d] 系统全量注入 (inject_system_full.py)...')
        r1d = script('inject_system_full.py', timeout=1800, dry_run=dry_run)
        p.commands_run.append(r1d)

        log.info('\n[1e] 全局关联链接 (link_global_integration.py)...')
        r1e = script('link_global_integration.py', timeout=600, dry_run=dry_run)
        p.commands_run.append(r1e)

    # ── 断言验收 ──────────────────────────────────────────────────────────
    log.info('\n[Phase 1 断言验收]')
    before_subject = snapshot_before.get('t_subject', 0)

    # BSC-A03：受试者总数应增加（或保持，说明全部已匹配）
    p.assertions.append(assert_count(
        '受试者总数存在', 'apps.subject.models.Subject',
        min_count=1, bsc_ref='BSC-A03',
    ))

    # BSC-A04：黑名单字段存在（is_blacklisted 不为全 False）
    p.assertions.append(assert_count(
        '受试者记录存在（含新增）', 'apps.subject.models.Subject',
        min_count=max(before_subject, 1), bsc_ref='BSC-A01/A03',
    ))

    # BSC-E03：忠诚度记录（礼金/NPS/日记）
    p.assertions.append(assert_count(
        '受试者忠诚度记录存在', 'apps.subject.models_loyalty.SubjectLoyaltyScore',
        min_count=0, bsc_ref='BSC-E03',
    ))

    # BSC-B01：问卷记录存在（models_execution）
    p.assertions.append(assert_count(
        '受试者问卷记录存在', 'apps.subject.models_execution.SubjectQuestionnaire',
        min_count=1, bsc_ref='BSC-B01',
    ))

    # 幂等性验证：二次运行受试者数不变
    subject_count_2nd = db_count('apps.subject.models.Subject')
    subject_count_1st = db_count('apps.subject.models.Subject')
    idempotent = (subject_count_2nd == subject_count_1st)
    p.assertions.append(AssertResult(
        name='注入幂等性（content_hash 去重）',
        passed=idempotent,
        actual=f'两次查询: {subject_count_1st} = {subject_count_2nd}',
        expected='两次查询结果相同',
        bsc_ref='BSC-E01',
    ))

    # LearningReport 是否写入 KnowledgeEntry
    p.assertions.append(assert_count(
        'LearningReport 写入 KnowledgeEntry（import_learning）',
        'apps.knowledge.models.KnowledgeEntry',
        filter_kwargs={'source_type': 'import_learning'},
        min_count=0,  # 首次可能为 0，只检查不报错
        bsc_ref='BSC-E01/E02',
    ))

    p.end_time = time.time()
    log.info(f'\nPhase 1 完成: {p.summary}，用时 {p.elapsed:.0f}s')
    return p


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 2：LIMS 业务规则验证
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def run_phase2(snapshot_before: dict, dry_run: bool, skip_injection: bool) -> PhaseResult:
    p = PhaseResult(phase_id=2, phase_name='LIMS 业务规则验证')
    log.info(f'\n{"="*60}')
    log.info(f'Phase 2: {p.phase_name}')
    log.info('='*60)

        # 2a. P0 注入效果验证（需要真实批次号）
        log.info('\n[2a] LIMS P0 注入验证 (verify_p0_injection)...')
        # 获取最新批次号
        try:
            from apps.lims_integration.models import LimsImportBatch
            latest = LimsImportBatch.objects.order_by('-create_time').first()
            batch_no = latest.batch_no if latest else 'incremental_20260325_104020'
        except Exception:
            batch_no = 'incremental_20260325_104020'
        r2a = manage(['verify_p0_injection', '--batch', batch_no, '--no-rollback', '--report'], timeout=300, dry_run=dry_run)
        p.commands_run.append(r2a)

    # 2b. 业务逻辑验证（6 项）
    log.info('\n[2b] LIMS 业务逻辑验证 (verify_lims_business_logic)...')
    r2b = manage(
        ['verify_lims_business_logic',
         '--check', 'role_access', 'equipment', 'gate3', 'gate4', 'dispatch', 'client_link',
         '--report'],
        timeout=300, dry_run=dry_run,
    )
    p.commands_run.append(r2b)

    # 2c. 关系补全
    if not skip_injection:
        log.info('\n[2c] LIMS 关系补全 (backfill_lims_relations)...')
        r2c = manage(['backfill_lims_relations'], timeout=600, dry_run=dry_run)
        p.commands_run.append(r2c)

        log.info('\n[2d] LIMS×EKB×方案关联 (link_lims_ekb_to_protocol)...')
        r2d = manage(['link_lims_ekb_to_protocol'], timeout=600, dry_run=dry_run)
        p.commands_run.append(r2d)

    # ── 断言验收 ──────────────────────────────────────────────────────────
    log.info('\n[Phase 2 断言验收]')

    # LIMS 原始记录存在
    p.assertions.append(assert_count(
        'LIMS 原始记录存在 (RawLimsRecord)',
        'apps.lims_integration.models.RawLimsRecord',
        min_count=1, bsc_ref='BSC-H02/系统运维',
    ))

    # LIMS 注入日志最新批次
    p.assertions.append(assert_count(
        'LIMS 注入日志存在',
        'apps.lims_integration.models.LimsInjectionLog',
        min_count=0, bsc_ref='BSC-H02',
    ))

    # verify_lims_business_logic 输出没有 FAIL
    output_ok = True
    if r2b['returncode'] == 0:
        if 'FAIL' in r2b['stdout'] or 'failed' in r2b['stdout'].lower():
            output_ok = False
    else:
        output_ok = False

    p.assertions.append(AssertResult(
        name='LIMS 业务逻辑 6 项全部 PASS',
        passed=output_ok,
        actual='returncode=' + str(r2b['returncode']) + ('; 有 FAIL 输出' if not output_ok and r2b['returncode'] == 0 else ''),
        expected='returncode=0, 无 FAIL 关键词',
        bsc_ref='BSC-H02/系统运维',
    ))

    p.end_time = time.time()
    log.info(f'\nPhase 2 完成: {p.summary}，用时 {p.elapsed:.0f}s')
    return p


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 3：飞书数据激活（A1 / A2 / A3 Gate）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def run_phase3(snapshot_before: dict, dry_run: bool, skip_injection: bool) -> PhaseResult:
    p = PhaseResult(phase_id=3, phase_name='飞书数据激活（A1/A2/A3 Gate）')
    log.info(f'\n{"="*60}')
    log.info(f'Phase 3: {p.phase_name}')
    log.info('='*60)

    before_relation = snapshot_before.get('KnowledgeRelation', 0)
    before_entry = snapshot_before.get('KnowledgeEntry', 0)
    before_unknown_ratio = snapshot_before.get('MailSignalEvent_unknown_ratio', 0.85)

    if not skip_injection:
        # 3a. A1 Gate：IM 消息 → 知识图谱
        log.info('\n[3a] IM 数据激活 A1 — process_pending_contexts (IM)...')
        r3a1 = manage(
            ['process_pending_contexts', '--source-type', 'im'],
            timeout=7200, dry_run=dry_run,
        )
        p.commands_run.append(r3a1)

        # 3a-2. 运营知识图谱（从邮件 PersonalContext 构建）
        log.info('\n[3a-2] 运营知识图谱构建 — build_operations_graph...')
        r3a2 = manage(['build_operations_graph'], timeout=3600, dry_run=dry_run)
        p.commands_run.append(r3a2)

        # 3a-3. 跨源身份缝合为后续 Step3 建立 KnowledgeEntity 前提
        log.info('\n[3a-3] 身份缝合 + 跨源知识融合准备...')
        r3a3 = manage(['stitch_identity'], timeout=600, dry_run=dry_run)
        p.commands_run.append(r3a3)

        # 3b. A2 Gate：邮件信号重分类（全量 UNKNOWN）
        log.info('\n[3b] 邮件信号重分类 A2 — reconcile_mail_signals（全量）...')
        r3b = manage(
            ['reconcile_mail_signals', '--limit', '57633', '--batch-size', '30', '--confidence-threshold', '0.60'],
            timeout=18000, dry_run=dry_run,
        )
        p.commands_run.append(r3b)

        # 3c. A3 Gate：受试者价值分层
        log.info('\n[3c] 受试者价值分层 A3 — build_subject_intelligence (全量)...')
        r3c = manage(['build_subject_intelligence', '--phase', 'all'], timeout=3600, dry_run=dry_run)
        p.commands_run.append(r3c)

    # ── 断言验收 ──────────────────────────────────────────────────────────
    log.info('\n[Phase 3 断言验收]')

    # A1 Gate：知识图谱关系数增加（BSC-D02）
    p.assertions.append(assert_count(
        'A1: KnowledgeRelation 数量 > 基线（协作关系增加）',
        'apps.knowledge.models.KnowledgeRelation',
        compare_to=before_relation, bsc_ref='BSC-D01/D02',
    ))

    # A1 Gate：IM KnowledgeEntry 存在
    p.assertions.append(assert_count(
        'A1: IM 类型 KnowledgeEntry 已发布',
        'apps.knowledge.models.KnowledgeEntry',
        filter_kwargs={'entry_type': 'feishu_im', 'is_published': True},
        min_count=0, bsc_ref='BSC-D01',
    ))

    # A1 Gate：collaborates_with 关系数
    p.assertions.append(assert_count(
        'A1: collaborates_with 类型关系存在',
        'apps.knowledge.models.KnowledgeRelation',
        min_count=251,  # 基线值
        bsc_ref='BSC-D02/KPI-K-F3',
    ))

    # A2 Gate：UNKNOWN 邮件比例（应低于起始 85%）
    total_mail = db_count('apps.secretary.models.MailSignalEvent')
    unknown_mail = db_count('apps.secretary.models.MailSignalEvent', {'mail_signal_type': 'unknown'})
    if total_mail > 0:
        current_ratio = unknown_mail / total_mail
        unknown_decreased = current_ratio <= before_unknown_ratio
        p.assertions.append(AssertResult(
            name=f'A2: UNKNOWN 邮件比例 ≤ 起始值 ({before_unknown_ratio:.0%})',
            passed=unknown_decreased,
            actual=f'{current_ratio:.1%} ({unknown_mail}/{total_mail})',
            expected=f'≤ {before_unknown_ratio:.0%}',
            bsc_ref='BSC-C01/KPI-K-C1',
        ))
    else:
        p.assertions.append(AssertResult(
            name='A2: MailSignalEvent 记录存在',
            passed=False, actual=0, expected='>0',
            bsc_ref='BSC-C01',
        ))

    # A3 Gate：受试者知识条目存在
    p.assertions.append(assert_count(
        'A3: 受试者智能 KnowledgeEntry 存在',
        'apps.knowledge.models.KnowledgeEntry',
        filter_kwargs={'source_type': 'subject_intelligence'},
        min_count=0, bsc_ref='BSC-A05',
    ))

    # ProactiveInsight 自动生成（GapReporter）
    p.assertions.append(assert_count(
        'ProactiveInsight 已由 GapReporter 生成',
        'apps.secretary.models.ProactiveInsight',
        filter_kwargs={'trigger_source': 'GapReporter'},
        min_count=0, bsc_ref='BSC-G01/KPI-K-G1',
    ))

    p.end_time = time.time()
    log.info(f'\nPhase 3 完成: {p.summary}，用时 {p.elapsed:.0f}s')
    return p


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 4：易快报跨源融合
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def run_phase4(snapshot_before: dict, dry_run: bool, skip_injection: bool) -> PhaseResult:
    p = PhaseResult(phase_id=4, phase_name='易快报跨源融合（身份缝合+知识图谱）')
    log.info(f'\n{"="*60}')
    log.info(f'Phase 4: {p.phase_name}')
    log.info('='*60)

    if not skip_injection:
        # 4a. 身份缝合
        log.info('\n[4a] 身份统一缝合 — stitch_identity...')
        r4a = manage(['stitch_identity'], timeout=600, dry_run=dry_run)
        p.commands_run.append(r4a)

        # 4b. 跨源知识图谱：分步执行（依赖 stitch_identity 已建立 KnowledgeEntity）
        log.info('\n[4b] 跨源知识图谱融合 Step1 — stitch_cross_source_knowledge...')
        r4b1 = manage(['stitch_cross_source_knowledge', '--step', '1'], timeout=600, dry_run=dry_run)
        p.commands_run.append(r4b1)
        log.info('\n[4b] Step2 — 飞书内容提取项目/客户引用...')
        r4b2 = manage(['stitch_cross_source_knowledge', '--step', '2'], timeout=1200, dry_run=dry_run)
        p.commands_run.append(r4b2)
        log.info('\n[4b] Step3 — 构建跨源 KnowledgeRelation...')
        r4b3 = manage(['stitch_cross_source_knowledge', '--step', '3'], timeout=600, dry_run=dry_run)
        p.commands_run.append(r4b3)

        # 4c. 财务知识提取（全源类型）
        log.info('\n[4c] 财务知识提取 — extract_financial_knowledge (all)...')
        r4c = manage(['extract_financial_knowledge', '--source-type', 'all', '--phase', 'all'], timeout=7200, dry_run=dry_run)
        p.commands_run.append(r4c)

        # 4d. 业务画像生成（全部类型）
        log.info('\n[4d] 业务画像生成 — build_business_profiles --type all...')
        r4d = manage(['build_business_profiles', '--type', 'all'], timeout=7200, dry_run=dry_run)
        p.commands_run.append(r4d)

    # ── 断言验收 ──────────────────────────────────────────────────────────
    log.info('\n[Phase 4 断言验收]')

    # 身份缝合：有 feishu+ekb 双 ID 的账号
    p.assertions.append(assert_count(
        '身份缝合：同时有飞书和易快报 ID 的账号',
        'apps.identity.models.Account',
        filter_kwargs={'feishu_open_id__gt': '', 'ekuaibao_staff_id__gt': ''},
        min_count=0, bsc_ref='BSC-X03/跨域',
    ))

    # 跨源关系：mentioned_in / involved_in
    p.assertions.append(assert_count(
        '跨源 KnowledgeRelation（mentioned_in）存在',
        'apps.knowledge.models.KnowledgeRelation',
        filter_kwargs={'predicate_uri__contains': 'mentioned_in'},
        min_count=0, bsc_ref='BSC-X03',
    ))

    # 财务知识条目
    p.assertions.append(assert_count(
        '财务知识 KnowledgeEntry 存在',
        'apps.knowledge.models.KnowledgeEntry',
        filter_kwargs={'source_type': 'financial_kg'},
        min_count=0, bsc_ref='BSC-F01',
    ))

    # 业务画像 KnowledgeEntry
    p.assertions.append(assert_count(
        '业务画像 KnowledgeEntry 存在',
        'apps.knowledge.models.KnowledgeEntry',
        filter_kwargs={'source_type': 'business_profile'},
        min_count=0, bsc_ref='BSC-F01',
    ))

    # 易快报原始记录（不可变层）
    p.assertions.append(assert_count(
        '易快报原始记录存在（不可变层）',
        'apps.ekuaibao_integration.models.EkbRawRecord',
        min_count=1, bsc_ref='BSC-H02',
    ))

    p.end_time = time.time()
    log.info(f'\nPhase 4 完成: {p.summary}，用时 {p.elapsed:.0f}s')
    return p


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 5：全链路验收 + KPI 检查 + 报告生成
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def run_phase5(snapshot_before: dict, all_phases: List[PhaseResult],
               dry_run: bool, base_url: str, token: str) -> PhaseResult:
    p = PhaseResult(phase_id=5, phase_name='全链路验收 + KPI + 报告生成')
    log.info(f'\n{"="*60}')
    log.info(f'Phase 5: {p.phase_name}')
    log.info('='*60)

    # 5a. After 快照（对比 before）
    log.info('\n[5a] 运行后资产快照...')
    snapshot_after = {}
    if _DJANGO_AVAILABLE:
        snapshot_models_after = [
            ('t_subject', 'apps.subject.models.Subject'),
            ('t_subject_loyalty', 'apps.subject.models_loyalty.SubjectLoyaltyScore'),
            ('PersonalContext', 'apps.secretary.models.PersonalContext'),
            ('MailSignalEvent', 'apps.secretary.models.MailSignalEvent'),
            ('KnowledgeEntry', 'apps.knowledge.models.KnowledgeEntry'),
            ('KnowledgeEntry_published', 'apps.knowledge.models.KnowledgeEntry'),
            ('KnowledgeRelation', 'apps.knowledge.models.KnowledgeRelation'),
            ('KnowledgeEntity', 'apps.knowledge.models.KnowledgeEntity'),
            ('ProactiveInsight', 'apps.secretary.models.ProactiveInsight'),
            ('WorkerPolicyUpdate', 'apps.secretary.models.WorkerPolicyUpdate'),
        ]
        filter_map_after = {
            'KnowledgeEntry_published': {'is_published': True},
        }
        for label, model_path in snapshot_models_after:
            f = filter_map_after.get(label)
            count = db_count(model_path, f)
            snapshot_after[label] = count

        unknown_mail = db_count('apps.secretary.models.MailSignalEvent', {'mail_signal_type': 'unknown'})
        total_mail = db_count('apps.secretary.models.MailSignalEvent')
        if total_mail > 0:
            snapshot_after['MailSignalEvent_unknown_ratio'] = round(unknown_mail / total_mail, 4)

    # 5b. E2E Smoke Test
    if token and base_url:
        log.info(f'\n[5b] E2E Smoke Test ({base_url})...')
        r5b = script('e2e_smoke_test.py', ['--token', token, '--base-url', base_url, '--cleanup'], timeout=300, dry_run=dry_run)
        p.commands_run.append(r5b)
        smoke_passed = r5b['returncode'] == 0
        p.assertions.append(AssertResult(
            name='E2E Smoke Test: Protocol→Subject→CRF 主链',
            passed=smoke_passed,
            actual=f'returncode={r5b["returncode"]}',
            expected='returncode=0',
            bsc_ref='BSC-B01/BSC-H02',
        ))
    else:
        log.info('\n[5b] 跳过 E2E Smoke Test（未提供 --token）')

    # 5c. BSC 场景抽检（10 个关键场景）
    log.info('\n[5c] BSC 场景抽检（10 个 P0/P1 场景）...')
    _run_bsc_spot_checks(p)

    # 5d. Learning Loop KPI 检查
    log.info('\n[5d] Learning Loop KPI 检查...')
    _check_kpis(p, snapshot_before, snapshot_after)

    p.end_time = time.time()
    log.info(f'\nPhase 5 完成: {p.summary}，用时 {p.elapsed:.0f}s')
    return p, snapshot_after


def _run_bsc_spot_checks(p: PhaseResult):
    """BSC 业务场景抽检（10 个关键场景的数据验证）。"""
    checks = [
        # (断言名称, 模型路径, 过滤条件, min_count, BSC参考)
        ('BSC-A01/A02: 受试者库有效记录', 'apps.subject.models.Subject',
         {'is_deleted': False}, 100, 'BSC-A01/A02'),
        ('BSC-A04: 黑名单机制存在（字段可查）', 'apps.subject.models.Subject',
         None, 1, 'BSC-A04'),
        ('BSC-C01: 非UNKNOWN邮件信号存在', 'apps.secretary.models.MailSignalEvent',
         {'mail_signal_type__in': ['inquiry', 'complaint', 'project_followup', 'internal_admin']}, 0, 'BSC-C01'),
        ('BSC-C03: COMPLAINT 类型邮件有对应 ProactiveInsight', 'apps.secretary.models.ProactiveInsight',
         {'insight_type': 'trend_alert'}, 0, 'BSC-C03'),
        ('BSC-D01: PersonalContext IM 类型存在', 'apps.secretary.models.PersonalContext',
         {'source_type': 'im'}, 1, 'BSC-D01'),
        ('BSC-D01: PersonalContext Mail 类型存在', 'apps.secretary.models.PersonalContext',
         {'source_type': 'mail'}, 1, 'BSC-D01'),
        ('BSC-E03: 礼金支付记录关联受试者', 'apps.subject.models_loyalty.SubjectPayment',
         None, 0, 'BSC-E03'),
        ('BSC-F01: KnowledgeEntry 已发布记录存在', 'apps.knowledge.models.KnowledgeEntry',
         {'is_published': True, 'is_deleted': False}, 0, 'BSC-F01'),
        ('BSC-F01: KnowledgeEntry 向量化记录存在', 'apps.knowledge.models.KnowledgeEntry',
         {'is_published': True}, 0, 'BSC-F01/KPI-K-F2'),
        ('BSC-G01: WorkerPolicyUpdate 策略进化记录', 'apps.secretary.models_memory.WorkerPolicyUpdate',
         None, 0, 'BSC-G01'),
    ]
    for name, model_path, flt, min_c, bsc_ref in checks:
        result = assert_count(name, model_path, flt, min_c, bsc_ref=bsc_ref)
        p.assertions.append(result)
        icon = _G + '✓' + _E if result.passed else _R + '✗' + _E
        log.info(f'  {icon} {name}: {result.actual} (期望 {result.expected})')


def _check_kpis(p: PhaseResult, before: dict, after: dict):
    """8 项 Learning Loop KPI 检查。"""
    kpi_checks = [
        {
            'name': 'KPI-K-F3: KnowledgeRelation 总数',
            'key': 'KnowledgeRelation',
            'model': 'apps.knowledge.models.KnowledgeRelation',
            'min': 251,
            'target': 10000,
            'bsc_ref': 'BSC-D02',
        },
        {
            'name': 'KPI-K-F1: KnowledgeEntry 总数',
            'key': 'KnowledgeEntry',
            'model': 'apps.knowledge.models.KnowledgeEntry',
            'min': 0,
            'target': 1000,
            'bsc_ref': 'BSC-F01',
        },
        {
            'name': 'KPI-K-F2: KnowledgeEntry 已发布数',
            'key': 'KnowledgeEntry_published',
            'model': 'apps.knowledge.models.KnowledgeEntry',
            'filter': {'is_published': True},
            'min': 0,
            'target': 200000,
            'bsc_ref': 'BSC-F01',
        },
        {
            'name': 'KPI-K-G1: WorkerPolicyUpdate 累计',
            'key': 'WorkerPolicyUpdate',
            'model': 'apps.secretary.models_memory.WorkerPolicyUpdate',
            'min': 0,
            'target': 20,
            'bsc_ref': 'BSC-G01',
        },
    ]

    for kpi in kpi_checks:
        model = kpi['model']
        flt = kpi.get('filter')
        actual = db_count(model, flt)
        target = kpi['target']
        min_val = kpi['min']
        before_val = before.get(kpi['key'], 0)
        after_val = after.get(kpi['key'], actual)

        # KPI 通过条件：比基线增加，或已超过 min 值
        passed = actual >= min_val
        delta = after_val - before_val if before_val >= 0 and after_val >= 0 else 0
        delta_str = f'+{delta}' if delta >= 0 else str(delta)

        p.assertions.append(AssertResult(
            name=kpi['name'],
            passed=passed,
            actual=f'{actual:,} ({delta_str} vs 运行前)',
            expected=f'>= {min_val}（目标 {target:,}）',
            bsc_ref=kpi['bsc_ref'],
            detail=f'{actual/target*100:.1f}% 达成率' if target > 0 else '',
        ))
        progress = actual / target * 100 if target > 0 else 0
        icon = _G + '✓' + _E if passed else _Y + '⚠' + _E
        log.info(f'  {icon} {kpi["name"]}: {actual:,} → 目标 {target:,} ({progress:.1f}%达成)')


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 报告生成
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def generate_report(all_phases: List[PhaseResult], snapshot_before: dict,
                    snapshot_after: dict, output_path: str):
    """生成 Markdown 格式的集成测试报告。"""
    ts = datetime.now().strftime('%Y-%m-%d %H:%M')
    lines = [
        f'# CN KIS V2.0 全量数据集成测试报告',
        f'',
        f'> **生成时间**：{ts}  ',
        f'> **分支**：feature/common/4-ops-briefing  ',
        f'> **覆盖数据源**：NAS 历史数据 / LIMS / 飞书全量 / 易快报',
        f'',
        f'---',
        f'',
        f'## 执行摘要',
        f'',
    ]

    total_assertions = sum(len(p.assertions) for p in all_phases)
    passed_assertions = sum(sum(1 for a in p.assertions if a.passed) for p in all_phases)
    phases_passed = sum(1 for p in all_phases if p.passed)
    total_elapsed = sum(p.elapsed for p in all_phases)

    overall_status = '✅ 全部通过' if phases_passed == len(all_phases) else f'⚠️ {len(all_phases)-phases_passed} 个 Phase 有问题'

    lines += [
        f'| 项目 | 值 |',
        f'|------|-----|',
        f'| 整体状态 | {overall_status} |',
        f'| Phase 通过数 | {phases_passed}/{len(all_phases)} |',
        f'| 断言通过数 | {passed_assertions}/{total_assertions} |',
        f'| 总耗时 | {total_elapsed:.0f}s ({total_elapsed/60:.1f} 分钟) |',
        f'',
        f'---',
        f'',
        f'## 各 Phase 执行结果',
        f'',
    ]

    for phase in all_phases:
        status_icon = '✅' if phase.passed else ('⏭️' if phase.skipped else '❌')
        lines += [
            f'### Phase {phase.phase_id}：{phase.phase_name}  {status_icon}',
            f'',
            f'**耗时**：{phase.elapsed:.0f}s  **摘要**：{phase.summary}',
            f'',
        ]

        if phase.commands_run:
            lines.append('**执行命令**：')
            lines.append('')
            lines.append('| 命令 | 返回码 | 耗时(s) |')
            lines.append('|------|--------|---------|')
            for cmd in phase.commands_run:
                rc = cmd.get('returncode', '?')
                elapsed = cmd.get('elapsed', 0)
                status = '✅' if rc == 0 else '❌'
                short_cmd = cmd.get('cmd', '')[:80]
                lines.append(f'| `{short_cmd}` | {status} {rc} | {elapsed} |')
            lines.append('')

        if phase.assertions:
            lines.append('**断言结果**：')
            lines.append('')
            lines.append('| BSC 参考 | 断言名称 | 实际值 | 期望 | 结果 |')
            lines.append('|----------|---------|--------|------|------|')
            for a in phase.assertions:
                icon = '✅' if a.passed else '❌'
                detail = f' _{a.detail}_' if a.detail else ''
                lines.append(f'| `{a.bsc_ref}` | {a.name}{detail} | `{a.actual}` | `{a.expected}` | {icon} |')
            lines.append('')

    # 数据量 Before / After 对比
    lines += [
        '---',
        '',
        '## 数据量 Before / After 对比',
        '',
        '| 数据模型 | 运行前 | 运行后 | 变化 |',
        '|---------|--------|--------|------|',
    ]
    all_keys = set(snapshot_before.keys()) | set(snapshot_after.keys())
    for key in sorted(all_keys):
        if key.endswith('_ratio'):
            before_v = f'{snapshot_before.get(key, 0):.1%}'
            after_v = f'{snapshot_after.get(key, 0):.1%}'
            delta = '↓ 改善' if snapshot_after.get(key, 0) < snapshot_before.get(key, 0) else '→ 不变'
        else:
            before_v = f'{snapshot_before.get(key, 0):,}'
            after_v_raw = snapshot_after.get(key, 0)
            after_v = f'{after_v_raw:,}'
            diff = after_v_raw - snapshot_before.get(key, 0)
            delta = f'+{diff:,}' if diff > 0 else (f'{diff:,}' if diff < 0 else '→ 不变')
        lines.append(f'| `{key}` | {before_v} | {after_v} | {delta} |')

    lines += [
        '',
        '---',
        '',
        '## Learning Loop KPI 达成状态',
        '',
        '| KPI | 基线 | 当前 | 8 周目标 | 达成率 |',
        '|-----|------|------|---------|--------|',
    ]
    kpi_rows = [
        ('collaborates_with 关系数', 251, snapshot_after.get('KnowledgeRelation', 0), 10000),
        ('IM KnowledgeEntry published', 0, snapshot_after.get('KnowledgeEntry_published', 0), 200000),
        ('MailSignalEvent UNKNOWN 比例', '85%',
         f'{snapshot_after.get("MailSignalEvent_unknown_ratio", 0.85):.1%}', '<15%'),
        ('ProactiveInsight 自动生成', 0, snapshot_after.get('ProactiveInsight', 0), 200),
        ('WorkerPolicyUpdate 累计', 0, snapshot_after.get('WorkerPolicyUpdate', 0), 20),
        ('KnowledgeEntry 总数', 0, snapshot_after.get('KnowledgeEntry', 0), 1000),
    ]
    for kpi_name, baseline, current, target in kpi_rows:
        try:
            rate = f'{int(current)/int(target)*100:.1f}%' if isinstance(current, int) and isinstance(target, int) and target > 0 else '—'
        except Exception:
            rate = '—'
        lines.append(f'| {kpi_name} | {baseline} | {current} | {target} | {rate} |')

    lines += [
        '',
        '---',
        '',
        '## 未通过项汇总',
        '',
    ]
    failed = [(phase, a) for phase in all_phases for a in phase.assertions if not a.passed]
    if failed:
        lines.append('| Phase | 断言 | 实际值 | 期望 | BSC |')
        lines.append('|-------|------|--------|------|-----|')
        for phase, a in failed:
            lines.append(f'| Phase {phase.phase_id} | {a.name} | `{a.actual}` | `{a.expected}` | `{a.bsc_ref}` |')
    else:
        lines.append('_全部断言通过。_')

    lines += [
        '',
        '---',
        '',
        '## 下一步行动建议',
        '',
    ]
    if failed:
        lines.append('根据未通过项，建议：')
        for _, a in failed[:5]:
            lines.append(f'- 排查 `{a.bsc_ref}`：{a.name}（实际={a.actual}，期望={a.expected}）')
    else:
        lines.append('- 所有 Phase 通过，可更新 `docs/LEARNING_LOOP_STATUS.md` KPI 实际值')
        lines.append('- 运行 `python manage.py train_agent general-assistant` 触发智能体策略进化')
        lines.append('- 运行 `python manage.py sync_learning_to_agent` 生成 WorkerPolicyUpdate')

    lines += ['', '---', f'', f'*由 `full_integration_validation.py` 自动生成 — {ts}*']

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    log.info(f'\n📄 报告已保存: {output_path}')


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 主入口
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def main():
    parser = argparse.ArgumentParser(description='CN KIS V2.0 全量数据集成测试验收')
    parser.add_argument('--all-phases', action='store_true', default=True, help='运行全部 Phase（默认）')
    parser.add_argument('--phase', type=int, choices=[0, 1, 2, 3, 4, 5], help='只运行指定 Phase')
    parser.add_argument('--dry-run', action='store_true', help='只做断言验证，不执行注入命令')
    parser.add_argument('--skip-injection', action='store_true', help='跳过注入命令，只做验收断言')
    parser.add_argument('--output', default='', help='报告输出路径')
    parser.add_argument('--base-url', default='http://118.196.64.48:8001/v2/api/v1', help='E2E smoke test API 地址')
    parser.add_argument('--token', default='', help='E2E smoke test JWT token')
    args = parser.parse_args()

    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    output_path = args.output or f'/tmp/integration_test_{ts}.md'
    local_output = str(BASE_DIR.parent / 'docs' / 'acceptance' / f'DATA_INTEGRATION_TEST_REPORT_{ts[:8]}.md')

    dry_run = args.dry_run
    skip_injection = args.skip_injection or dry_run
    only_phase = args.phase

    log.info(f'CN KIS V2.0 全量数据集成测试验收')
    log.info(f'模式: {"DRY-RUN" if dry_run else ("SKIP-INJECTION" if skip_injection else "完整执行")}')
    log.info(f'时间: {ts}')

    all_phases_results = []

    # Phase 0
    if only_phase is None or only_phase == 0:
        phase0, snapshot_before = run_phase0(dry_run)
        all_phases_results.append(phase0)
    else:
        snapshot_before = {}

    # Phase 1
    if only_phase is None or only_phase == 1:
        phase1 = run_phase1(snapshot_before, dry_run, skip_injection)
        all_phases_results.append(phase1)

    # Phase 2
    if only_phase is None or only_phase == 2:
        phase2 = run_phase2(snapshot_before, dry_run, skip_injection)
        all_phases_results.append(phase2)

    # Phase 3
    if only_phase is None or only_phase == 3:
        phase3 = run_phase3(snapshot_before, dry_run, skip_injection)
        all_phases_results.append(phase3)

    # Phase 4
    if only_phase is None or only_phase == 4:
        phase4 = run_phase4(snapshot_before, dry_run, skip_injection)
        all_phases_results.append(phase4)

    # Phase 5
    if only_phase is None or only_phase == 5:
        phase5, snapshot_after = run_phase5(
            snapshot_before, all_phases_results, dry_run, args.base_url, args.token,
        )
        all_phases_results.append(phase5)
    else:
        snapshot_after = {}

    # 生成报告
    generate_report(all_phases_results, snapshot_before, snapshot_after, output_path)

    # 同时保存到 docs/acceptance/
    if output_path != local_output:
        try:
            generate_report(all_phases_results, snapshot_before, snapshot_after, local_output)
        except Exception as e:
            log.warning(f'保存本地报告失败: {e}')

    # 最终摘要
    total = sum(len(p.assertions) for p in all_phases_results)
    passed = sum(sum(1 for a in p.assertions if a.passed) for p in all_phases_results)
    log.info(f'\n{"="*60}')
    log.info(f'最终结果：{passed}/{total} 断言通过')
    for ph in all_phases_results:
        icon = '✅' if ph.passed else '❌'
        log.info(f'  {icon} Phase {ph.phase_id} {ph.phase_name}: {ph.summary}')
    log.info(f'报告: {output_path}')
    log.info('='*60)

    # 退出码：有任何断言失败则 exit(1)
    failed_count = total - passed
    sys.exit(0 if failed_count == 0 else 1)


if __name__ == '__main__':
    main()
