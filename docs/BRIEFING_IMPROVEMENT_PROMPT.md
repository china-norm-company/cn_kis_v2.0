# CN KIS 早晚报改进完整提示词

> **用途**：在新对话中引用此文档，继续完成 `backend/apps/secretary/briefing_tasks.py` 的数据采集层修复与功能增强。
>
> **分支**：`feature/common/4-ops-briefing`
> **服务器**：`root@118.196.64.48`，SSH密钥 `~/.ssh/openclaw1.1.pem`，V2目录 `/opt/cn-kis-v2/backend`

---

## 一、背景与目的

### 系统定位

CN KIS 是一家**临床研究机构（CRO/SMO）**的全业务数字化操作系统，覆盖从项目立项到结题的完整生命周期。系统当前处于 **V2.0 推广落地阶段**，核心挑战是：代码已就绪，但业务迁移和用户使用习惯培养尚在进行。

### 早晚报的核心定位

早晚报不是"数据播报"，而是 **AI 扮演系统上线作战室的运营总经理**：

| 价值 | 说明 |
|------|------|
| 防代码分叉 | 每天提醒开发团队同步 main，减少合并冲突（替代 V1 的 `make rebase-develop`）|
| 透明化进展 | 不懂 GitHub 的人也能在飞书群看到整体开发状态 |
| 推广进度追踪 | 哪些工作台已有人用、哪些还是空表，一目了然 |
| 合规预警 | 质量台逾期 CAPA、伦理台长期零数据等合规风险即时提示 |
| 数据治理监控 | 知识库向量化进度、外部数据接入积压、飞书采集健康状态 |

**推送目标群**：CN_KIS_PLATFORM开发小组（`chat_id = oc_cdfad80d9deb950414e8b4033f5ac1ff`）

---

## 二、19 个工作台完整清单

### 核心业务层（临床研究主链路，7 个）

| key | 名称 | 核心价值 |
|-----|------|---------|
| `secretary` | 子衿·秘书台 | 总控门户 + 19台入口 + 飞书信息聚合（邮件/IM/日历/任务）+ 统一待办 |
| `research` | 采苓·研究台 | 研究者视角：方案管理/访视计划/受试者/可行性评估 |
| `execution` | 维周·执行台 | 全局执行调度：排程/工单/访视/EDC/LIMS/项目变更 |
| `recruitment` | 招招·招募台 | 受试者全链路：招募计划→注册→预筛→入组→依从性→支付 |
| `quality` | 怀瑾·质量台 | GCP合规核心：偏差/CAPA/变更控制/SOP库/质量审计 |
| `ethics` | 御史·伦理台 | 伦理合规：申请/审批/审查/监督/法规库（监管硬红线）|
| `reception` | 和序·接待台 | 受试者当日接待：叫号/签到/导览/Kiosk自助 |

### 资源支撑层（运营保障，8 个）

| key | 名称 | 核心价值 |
|-----|------|---------|
| `lab-personnel` | 共济·人员台 | 实验室人员排班/工时/资质/调度（≠ HR）|
| `equipment` | 器衡·设备台 | 设备台账/校准/维护（GCP必检项）|
| `material` | 度支·物料台 | 药品/耗材/样本库存/效期预警（影响试验安全）|
| `facility` | 坤元·设施台 | 场地/实验室预约/环境监控（GCP合规）|
| `evaluator` | 衡技·评估台 | 评估人员面板：工单扫描/排班/知识库 |
| `hr` | 时雨·人事台 | 公司人力：员工档案/资质/培训/绩效 |
| `finance` | 管仲·财务台 | 报价/合同/发票/应收账款/预算分析 |
| `crm` | 进思·客户台 | 客户档案/商务管线/合作关系管理 |

### 平台智能层（4 个）

| key | 名称 | 核心价值 |
|-----|------|---------|
| `digital-workforce` | 中书·智能台 | AI智能中枢：多智能体/Kimi Claw任务委派/动作执行/研究洞察 |
| `data-platform` | 洞明·数据台 | **数据治理中台**：知识域注册/数据清洗入库/外部数据接入/生命周期管理（独立飞书授权：`cli_a93753da2c381cef`）|
| `admin` | 鹿鸣·治理台 | RBAC权限/审计日志/AI智能体状态/飞书集成监控（独立飞书授权：`cli_a937515668b99cc9`）|
| `control-plane` | 天工·统管台 | IT运维：资源健康/今日运维/依赖拓扑/工单中心 |

---

## 三、持续增量采集的飞书数据资产

### PersonalContext 表（`t_personal_context`）
来源类型：`mail | im | calendar | task | approval | doc | wiki | sheet | slide | file | group_msg | contact`

- `group_msg`：已采集 **1,542 个有效群**的消息（含项目群、部门群等）
- `im`：个人私聊消息
- `task`：飞书任务（含系统上线相关任务）
- `approval`：飞书审批（HR/财务/项目变更）
- `doc/wiki`：操作手册、培训文档等

### KnowledgeEntry 表（`t_knowledge_entry`）
**390,418+ 条知识条目**，已通过向量化索引，来源包括：`feishu_chat`（群聊知识）、`feishu_meeting`（会议纪要）、`protocol`（方案）、`sop`、`document` 等。

### IM群聊的特殊价值（`build_im_group_knowledge`）
从1,542个群中自动提取：
- **项目编号**（正则：`M/C/W/A/S/R/O/F+数字`，如 M20240001）
- **里程碑信号**：立项、入组、DBL、数据锁定、出报告、伦理通过、合同签署、SAE
- **话题分类**：质量/偏差/招募/样品/财务/培训/设备
- **`CN_KIS_PLATFORM开发小组`群本身**也是采集对象（chat_id: `oc_cdfad80d9deb950414e8b4033f5ac1ff`）

---

## 四、内容架构设计

### 早报（09:00，`send_morning_briefing`）
```
🌅 CN KIS 早报 · 日期（周X）  🟢/🟡/🔴 状态
├── 🧠 AI 运营总经理批注（Kimi LLM，150字，基于真实数据）
├── 📊 核心数据看板（三列）
│     昨日登录用户 N 人 | 新增业务数据（工单+受试者）| 磁盘 X%
├── 💻 开发进展（GitHub）
│     开放PR: N | 昨日提交: N 次 | Bug数: N
├── 🏥 飞书业务信号（昨日群聊IM关键词）
│     项目里程碑动态 | 开发群讨论焦点
├── 📦 数据资产健康（洞明·数据台）
│     知识库 N 条 · 向量化 X% · 待处理 N 条
├── 📋 工作台推广状态（前6核心台，🟢🟡🟠🔴）
├── 🚨 合规预警（有则显示）
│     逾期CAPA / 伦理台零数据 / 数据接入积压
└── 🔗 快捷操作：同步代码 | 查看PR | Issue列表
```

### 晚报（18:00，`send_evening_briefing`）
```
🌙 CN KIS 收工晚报 · 日期
├── 📌 今日复盘（AI生成：今日亮点+问题+明日TOP3）
├── 📈 今日业务数据（活跃用户 | 工单完成率 | 用户反馈）
├── 💻 今日代码活动（提交N次 | 合并PR N | 新开Issue N）
├── 💬 今日飞书系统讨论摘要
│     开发群 N 条消息，讨论焦点：[关键词...]
│     项目里程碑：项目X—入组完成，项目Y—合同签署
├── 🔄 今日数据台流水
│     新增知识条目 +N | 新增飞书上下文 +N | 待接入 N 条
├── 📊 全部19个工作台推广面板（两列完整状态）
└── ⚠️ 待处理事项：逾期CAPA N 条 | 待审核数据接入 N 条
```

### 周报（周一 08:30，`send_weekly_briefing`）
```
📋 CN KIS 周报 · 推广进度 X%（活跃/19台）
├── AI周度战略简报（上周总结三维：技术/用户/业务）
├── 本周推广快照（活跃台N/19 | 新登录用户N | 合并PR N）
├── 飞书知识沉淀（本周新增知识N条 | 向量化N条）
├── 本周系统讨论热点（开发群高频词）
└── 本周战略TOP3 + 期望结果
```

---

## 五、需要修复的 4 处代码错误

> 文件：`backend/apps/secretary/briefing_tasks.py`
> **修改原则**：只能 `StrReplace` 精确修改，不允许重写全文件。每次修改前先 `Read` 确认当前代码。

### 修复 1：`_collect_user_metrics()` 字段名错误（约 L92-L117）

**错误原因**：`Account` 模型不继承 `AbstractUser`，没有 `last_login` 和 `date_joined` 字段。

| 错误字段 | 正确字段 | 依据 |
|---------|---------|------|
| `last_login__gte=yesterday` | `last_login_time__gte=yesterday` | `Account.last_login_time = DateTimeField` |
| `last_login__isnull=True` | `last_login_time__isnull=True` | 同上 |
| `date_joined__gte=yesterday` | `create_time__gte=yesterday` | `Account.create_time = DateTimeField auto_now_add` |
| `exclude(last_login__gte=week_ago)` | `exclude(last_login_time__gte=week_ago)` | 同上 |

### 修复 2：`_collect_business_metrics()` Subject/Protocol 字段名错误（约 L133-L144）

| 错误代码 | 正确代码 |
|---------|---------|
| `Subject.objects.filter(created_at__gte=yesterday)` | `Subject.objects.filter(create_time__gte=yesterday)` |
| `Protocol.objects.filter(created_at__gte=yesterday)` | `Protocol.objects.filter(create_time__gte=yesterday)` |

> Deviation/CAPA/WorkOrder 已正确使用 `create_time`，不需要改。

### 修复 3：`_check_workstation_active_users()` 关联查询错误（约 L302-L318）

**错误原因**：`Account` 没有 `workstation` 字段，永远走到 `return -1`。

**正确实现**：通过 `AccountWorkstationConfig` 关联表查询：

```python
def _check_workstation_active_users(ws_key: str) -> int:
    try:
        from apps.identity.models import AccountWorkstationConfig
        from django.utils import timezone
        week_ago = timezone.now() - timedelta(days=7)
        return AccountWorkstationConfig.objects.filter(
            workstation=ws_key,
            account__last_login_time__gte=week_ago,
            account__is_active=True,
            account__is_deleted=False,
        ).values('account_id').distinct().count()
    except Exception:
        return -1
```

### 修复 4：`_collect_workstation_status()` 工作台列表从 15 台更新为 19 台（约 L232-L248）

```python
ws_list = [
    # 核心业务台（临床主链路）
    {'key': 'secretary',         'name': '子衿·秘书台',    'priority': 'core'},
    {'key': 'research',          'name': '采苓·研究台',    'priority': 'core'},
    {'key': 'execution',         'name': '维周·执行台',    'priority': 'core'},
    {'key': 'recruitment',       'name': '招招·招募台',    'priority': 'core'},
    {'key': 'quality',           'name': '怀瑾·质量台',    'priority': 'core'},
    {'key': 'ethics',            'name': '御史·伦理台',    'priority': 'core'},
    {'key': 'reception',         'name': '和序·接待台',    'priority': 'core'},
    # 资源支撑台
    {'key': 'lab-personnel',     'name': '共济·人员台',    'priority': 'high'},
    {'key': 'equipment',         'name': '器衡·设备台',    'priority': 'high'},
    {'key': 'material',          'name': '度支·物料台',    'priority': 'high'},
    {'key': 'finance',           'name': '管仲·财务台',    'priority': 'high'},
    {'key': 'facility',          'name': '坤元·设施台',    'priority': 'medium'},
    {'key': 'evaluator',         'name': '衡技·评估台',    'priority': 'medium'},
    {'key': 'hr',                'name': '时雨·人事台',    'priority': 'medium'},
    {'key': 'crm',               'name': '进思·客户台',    'priority': 'medium'},
    # 平台智能台
    {'key': 'digital-workforce', 'name': '中书·智能台',    'priority': 'platform'},
    {'key': 'data-platform',     'name': '洞明·数据台',    'priority': 'platform'},
    {'key': 'admin',             'name': '鹿鸣·治理台',    'priority': 'platform'},
    {'key': 'control-plane',     'name': '天工·统管台',    'priority': 'platform'},
]
```

---

## 六、新增 3 个数据采集函数

### 函数 1：`_collect_github_metrics()` — GitHub 开发进展

```python
def _collect_github_metrics() -> dict:
    """从 GitHub REST API 采集开发进展数据（使用 GITHUB_TOKEN 环境变量）"""
    result = {'open_prs': 0, 'commits_24h': 0, 'open_bugs': 0,
              'open_issues': 0, 'error': None}
    token = os.environ.get('GITHUB_TOKEN', '')
    if not token:
        result['error'] = 'GITHUB_TOKEN 未配置'
        return result
    headers = {
        'Authorization': f'token {token}',
        'Accept': 'application/vnd.github.v3+json',
    }
    base = 'https://api.github.com/repos/china-norm-company/cn_kis_v2.0'
    since_iso = (datetime.now(timezone.utc) - timedelta(hours=24)).strftime('%Y-%m-%dT%H:%M:%SZ')
    try:
        import urllib.request
        import json as _json

        def _get(url):
            req = urllib.request.Request(url, headers=headers)
            return _json.loads(urllib.request.urlopen(req, timeout=10).read())

        prs = _get(f'{base}/pulls?state=open&per_page=100')
        result['open_prs'] = len(prs) if isinstance(prs, list) else 0

        commits = _get(f'{base}/commits?since={since_iso}&per_page=100')
        result['commits_24h'] = len(commits) if isinstance(commits, list) else 0

        issues = _get(f'{base}/issues?state=open&per_page=100')
        result['open_issues'] = sum(1 for i in issues if 'pull_request' not in i)
        result['open_bugs'] = sum(
            1 for i in issues
            if 'pull_request' not in i
            and any(l['name'] == 'bug' for l in i.get('labels', []))
        )
    except Exception as e:
        result['error'] = str(e)
        logger.warning('GitHub 指标采集失败: %s', e)
    return result
```

### 函数 2：`_collect_feishu_im_signals()` — 飞书 IM 业务信号

```python
def _collect_feishu_im_signals(hours: int = 24) -> dict:
    """
    从 PersonalContext 中提取过去 N 小时的飞书 IM 群聊业务信号。
    数据来源：source_type='group_msg'，含里程碑信号和系统开发讨论。
    """
    result = {
        'dev_group_messages': 0,
        'dev_group_keywords': [],
        'project_milestones': [],
        'im_active_groups': 0,
        'total_im_24h': 0,
    }
    try:
        from django.utils import timezone
        from apps.secretary.models import PersonalContext

        since = timezone.now() - timedelta(hours=hours)
        DEV_GROUP_CHAT_ID = os.environ.get('FEISHU_DEV_GROUP_CHAT_ID', '')

        qs = PersonalContext.objects.filter(
            source_type='group_msg',
            created_at__gte=since,
        )
        result['total_im_24h'] = qs.count()
        result['im_active_groups'] = qs.values('source_id').distinct().count()

        # 开发小组群专项分析
        if DEV_GROUP_CHAT_ID:
            dev_msgs = qs.filter(source_id=DEV_GROUP_CHAT_ID)
            result['dev_group_messages'] = dev_msgs.count()
            all_text = ' '.join(
                m.raw_content or m.summary
                for m in dev_msgs[:200]
            )
            KEYWORDS = ['PR', '合并', '部署', '测试', '修复', 'bug', '功能',
                        '验收', '上线', '回滚', '迁移', '性能', '权限', '登录']
            result['dev_group_keywords'] = [
                kw for kw in KEYWORDS if kw.lower() in all_text.lower()
            ]

        # 项目里程碑信号（从 raw_content/summary 中提取）
        MILESTONE_SIGNALS = ['立项', '入组', 'DBL', '数据锁定', '出报告',
                              '伦理通过', '合同签署', '项目关闭', 'SAE']
        milestones = []
        for msg in qs.exclude(source_id=DEV_GROUP_CHAT_ID)[:500]:
            content = msg.raw_content or msg.summary or ''
            for signal in MILESTONE_SIGNALS:
                if signal in content:
                    meta = msg.metadata or {}
                    chat_name = meta.get('chat_name', '某项目群')
                    if len(milestones) < 5:
                        milestones.append(f'{chat_name}：{signal}')
                    break
        result['project_milestones'] = milestones

    except Exception as e:
        logger.warning('飞书 IM 信号采集失败: %s', e)
    return result
```

### 函数 3：`_collect_data_platform_metrics()` — 洞明·数据台健康

```python
def _collect_data_platform_metrics() -> dict:
    """
    采集洞明·数据台的数据治理健康指标。
    数据来源：KnowledgeEntry / PersonalContext / ExternalDataIngestCandidate / RawLimsRecord
    """
    result = {
        'knowledge_total': 0,
        'knowledge_indexed': 0,
        'knowledge_pending': 0,
        'knowledge_failed': 0,
        'knowledge_new_24h': 0,
        'personal_context_total': 0,
        'personal_context_new_24h': 0,
        'ingest_pending': 0,
        'ingest_approved_24h': 0,
        'lims_pending': 0,
        'vectorization_pct': 0,
    }
    try:
        from django.utils import timezone
        yesterday = timezone.now() - timedelta(hours=24)

        from apps.knowledge.models import KnowledgeEntry
        result['knowledge_total']   = KnowledgeEntry.objects.count()
        result['knowledge_indexed'] = KnowledgeEntry.objects.filter(index_status='indexed').count()
        result['knowledge_pending'] = KnowledgeEntry.objects.filter(index_status='pending').count()
        result['knowledge_failed']  = KnowledgeEntry.objects.filter(index_status='failed').count()
        result['knowledge_new_24h'] = KnowledgeEntry.objects.filter(
            create_time__gte=yesterday, is_deleted=False
        ).count()
        if result['knowledge_total'] > 0:
            result['vectorization_pct'] = round(
                result['knowledge_indexed'] / result['knowledge_total'] * 100, 1
            )
    except Exception as e:
        logger.warning('知识库指标采集失败: %s', e)

    try:
        from django.utils import timezone
        yesterday = timezone.now() - timedelta(hours=24)
        from apps.secretary.models import PersonalContext
        result['personal_context_total']   = PersonalContext.objects.count()
        result['personal_context_new_24h'] = PersonalContext.objects.filter(
            created_at__gte=yesterday
        ).count()
    except Exception: pass

    try:
        from django.utils import timezone
        yesterday = timezone.now() - timedelta(hours=24)
        from apps.data_intake.models import ExternalDataIngestCandidate, ReviewStatus
        result['ingest_pending'] = ExternalDataIngestCandidate.objects.filter(
            review_status=ReviewStatus.PENDING
        ).count()
        result['ingest_approved_24h'] = ExternalDataIngestCandidate.objects.filter(
            review_status__in=[ReviewStatus.APPROVED, ReviewStatus.AUTO_INGESTED],
            updated_at__gte=yesterday
        ).count()
    except Exception: pass

    try:
        from apps.lims_integration.models import RawLimsRecord
        result['lims_pending'] = RawLimsRecord.objects.filter(
            injection_status='pending'
        ).count()
    except Exception: pass

    return result
```

---

## 七、`_collect_all_metrics()` 最终版本

将原有函数中的 `metrics` 赋值块替换为：

```python
def _collect_all_metrics(brief_type: str) -> dict:
    """采集全域运营指标，汇总为结构化字典供 LLM 分析。"""
    metrics = {
        'brief_type': brief_type,
        'date': datetime.now(timezone(timedelta(hours=8))).strftime('%Y-%m-%d'),
        'weekday': '一二三四五六日'[datetime.now(timezone(timedelta(hours=8))).weekday()],
    }
    # ── 原有（字段名已修复）────────────────────────────────
    metrics['users']         = _collect_user_metrics()          # 修复：last_login_time
    metrics['business']      = _collect_business_metrics()      # 修复：create_time
    metrics['feedback']      = _collect_feedback_metrics()      # ✅ 已正常
    metrics['system']        = _collect_system_metrics()        # ✅ 已正常
    metrics['workstations']  = _collect_workstation_status()    # 修复：19台 + 关联查询
    # ── 新增数据来源 ──────────────────────────────────────
    metrics['github']        = _collect_github_metrics()        # GitHub PR/提交/Bug
    metrics['im_signals']    = _collect_feishu_im_signals()     # 飞书IM群聊业务信号
    metrics['data_platform'] = _collect_data_platform_metrics() # 洞明·数据台健康
    return metrics
```

---

## 八、LLM Prompt 升级（`_build_morning_prompt`）

将 `_build_morning_prompt()` 函数中的 prompt 字符串替换为以下版本，融入 IM 信号和数据台指标：

```python
def _build_morning_prompt(m: dict) -> str:
    biz      = m.get('business', {})
    users    = m.get('users', {})
    feedback = m.get('feedback', {})
    system   = m.get('system', {})
    gh       = m.get('github', {})
    im       = m.get('im_signals', {})
    dp       = m.get('data_platform', {})
    ws_list  = m.get('workstations', [])

    inactive_ws  = [ws['name'] for ws in ws_list if ws['status'] == 'inactive']
    active_ws    = [ws['name'] for ws in ws_list if ws['status'] == 'active']
    milestones   = im.get('project_milestones', [])
    dev_keywords = im.get('dev_group_keywords', [])

    return f"""你是 CN KIS 系统的智能运营总经理助理。请根据以下数据生成今日开工早报的"总经理批注"板块。

【系统推广（{len(ws_list)}个工作台）】
- 昨日活跃用户：{users.get('dau_total', 0)} 人，从未登录：{users.get('zero_login_users', 0)} 人
- 活跃推广中：{', '.join(active_ws) or '无'}
- 零数据（推广停滞）：{', '.join(inactive_ws) or '无'}

【开发进展（GitHub）】
- 开放PR：{gh.get('open_prs', 0)} 个，昨日提交：{gh.get('commits_24h', 0)} 次，Bug Issue：{gh.get('open_bugs', 0)} 个

【飞书业务信号（昨日群聊）】
- 开发群消息：{im.get('dev_group_messages', 0)} 条，讨论焦点：{', '.join(dev_keywords) or '无'}
- 项目里程碑：{'; '.join(milestones) or '无重要里程碑'}

【数据治理健康（洞明·数据台）】
- 知识库：{dp.get('knowledge_total', 0)} 条，向量化 {dp.get('vectorization_pct', 0)}%
- 待处理：向量化积压 {dp.get('knowledge_pending', 0)} 条，失败 {dp.get('knowledge_failed', 0)} 条，数据接入待审 {dp.get('ingest_pending', 0)} 条

【业务与合规】
- 新增：受试者+{biz.get('subjects_new_24h',0)} 工单+{biz.get('workorders_new_24h',0)} 偏差+{biz.get('deviations_new_24h',0)}
- 逾期CAPA：{biz.get('capas_overdue', 0)} 条
- 磁盘：{system.get('disk_usage_pct', '?')}%，用户反馈：{feedback.get('total', 0)} 条（未处理 {feedback.get('unresolved', 0)}）

【你的任务】
用2-3段写"总经理批注"，要求：
1. 第一句整体状态判断（好/需关注/告警），结合开发和业务两条线
2. 从飞书讨论信号或项目里程碑中提炼今日1个最重要的行动指向
3. 识别TOP2推进事项，点名具体工作台或责任方向
4. 若数据治理有严重积压（向量化<95%或接入积压>50），单独提醒
5. 语气：直接、有判断力，像总经理备忘录，150字以内"""
```

---

## 九、卡片更新要点

### 早报卡片新增板块（在"工作台推广状态"之前插入）

```python
# 数据资产健康板块（在 _build_morning_card 中添加）
dp = m.get('data_platform', {})
vect_pct = dp.get('vectorization_pct', 0)
dp_status = '🔴 需关注' if (vect_pct < 95 or dp.get('knowledge_failed', 0) > 100
                            or dp.get('ingest_pending', 0) > 50) else '🟢 正常'
elements.append({
    'tag': 'div',
    'text': {'tag': 'lark_md', 'content': (
        f'**📦 数据资产健康  {dp_status}**\n'
        f'知识库 {dp.get("knowledge_total", 0):,} 条 · '
        f'向量化 {vect_pct}% · '
        f'昨日新增 +{dp.get("knowledge_new_24h", 0)}\n'
        f'待处理：积压 {dp.get("knowledge_pending", 0)} 条 / '
        f'失败 {dp.get("knowledge_failed", 0)} 条 / '
        f'接入待审 {dp.get("ingest_pending", 0)} 条'
    )},
})
elements.append({'tag': 'hr'})
```

### 周报 LLM Prompt 和卡片中涉及工作台总数的地方

```python
# _build_weekly_prompt 中：
f'- 系统共 19 个工作台（15 业务台 + 4 平台台）\n'

# _build_weekly_card 中：
f'推进目标：本月末达到 **65% 工作台活跃推广**（≥12/19 台有真实用户）'
```

---

## 十、实施步骤与验收

### 实施步骤

1. **修改代码**（只改 `backend/apps/secretary/briefing_tasks.py`，按修复 1~4 + 新增函数 1~3 逐步 StrReplace）
2. **同步到服务器**：
   ```bash
   rsync -avz -e "ssh -i ~/.ssh/openclaw1.1.pem" \
     backend/apps/secretary/briefing_tasks.py \
     root@118.196.64.48:/opt/cn-kis-v2/backend/apps/secretary/briefing_tasks.py
   ```
3. **验收数据采集**（Django shell）：
   ```bash
   ssh -i ~/.ssh/openclaw1.1.pem root@118.196.64.48 \
   "cd /opt/cn-kis-v2/backend && /opt/cn-kis-v2/backend/venv/bin/python manage.py shell -c \"
   from apps.secretary.briefing_tasks import _collect_all_metrics
   import json
   m = _collect_all_metrics('morning')
   print('users:', m['users'])
   print('github:', m['github'])
   print('im_signals:', m['im_signals'])
   print('data_platform:', m['data_platform'])
   print('workstations sample:', [(w['name'], w['active_users_7d']) for w in m['workstations'][:3]])
   \""
   ```
   **验收标准**：`users.dau_total` 不为 0，`github.open_prs` 有数值，`data_platform.knowledge_total` ≈ 390000+，`workstations[0].active_users_7d` 不为 -1

4. **推送第一份完整报告**：
   ```bash
   ssh -i ~/.ssh/openclaw1.1.pem root@118.196.64.48 \
   "cd /opt/cn-kis-v2/backend && /opt/cn-kis-v2/backend/venv/bin/python manage.py shell -c \"
   from apps.secretary.briefing_tasks import _run_briefing
   _run_briefing('morning')
   \""
   ```

5. **确认群内收到报告**，检查 LLM 批注是否引用了具体数据（如工作台名称、GitHub PR 数、项目里程碑等）

### 合规预警触发条件（自动变红）

| 条件 | 告警文案 |
|------|---------|
| `capas_overdue > 0` | 🚨 逾期 CAPA N 条，GCP 检查期间必查项 |
| `ethics` 工作台 `status == 'inactive'` | 🚨 伦理台零数据，合规风险 |
| `vectorization_pct < 95` | ⚠️ 向量化积压，AI检索能力下降 |
| `knowledge_failed > 100` | ⚠️ 知识索引失败堆积 |
| `ingest_pending > 50` | ⚠️ 外部数据接入长期积压 |
| `disk_usage_pct > 80` | ⚠️ 磁盘使用率告警 |

---

## 十一、环境信息速查

| 项目 | 值 |
|------|---|
| 当前分支 | `feature/common/4-ops-briefing` |
| V2 服务器 | `118.196.64.48` |
| SSH 密钥 | `~/.ssh/openclaw1.1.pem` |
| V2 部署目录 | `/opt/cn-kis-v2/backend` |
| V2 Python | `/opt/cn-kis-v2/backend/venv/bin/python` |
| 飞书应用（主） | 子衿 `cli_a98b0babd020500e` |
| 飞书应用（数据台）| 洞明 `cli_a93753da2c381cef` |
| 飞书应用（治理台）| 鹿鸣 `cli_a937515668b99cc9` |
| 开发群 chat_id | `oc_cdfad80d9deb950414e8b4033f5ac1ff` |
| GitHub 仓库 | `china-norm-company/cn_kis_v2.0` |
| LLM | Kimi（`KIMI_API_KEY` 已配置），通过 `apps.agent_gateway.services.quick_chat()` 调用 |
| GITHUB_TOKEN | 已在 V2 `.env` 配置 |
