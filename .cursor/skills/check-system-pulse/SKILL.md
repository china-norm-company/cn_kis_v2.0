# Skill: check-system-pulse（检查系统脉搏）

## 用途

一键输出系统完整健康状态 + KPI 达标情况 + 今日推荐行动。
这是每天开始工作时的标准晨检仪式，也是复盘时的状态快照工具。

## 使用时机

- 用户说「检查系统脉搏」或「系统状态怎么样」
- 新的 Cursor 窗口打开后，用户询问「现在在做什么」「下一步做什么」
- 每周一复盘开始时
- 里程碑 Gate 验收前

## 执行步骤

### Step 1：Git 状态检查

```bash
git branch --show-current
git log --oneline -5
git status --short
git diff --stat origin/main 2>/dev/null | tail -5
```

输出：当前任务分支、最近提交、未提交改动摘要。

### Step 2：读取 KPI 追踪文档

读取 `docs/LEARNING_LOOP_STATUS.md`，提取最新一行的实际值，与目标值对比。

### Step 3：扫描 data-insight Issues

```bash
gh issue list --label data-insight --state open --json number,title,createdAt,labels \
  | python3 -c "import sys,json; issues=json.load(sys.stdin); [print(f'#{i[\"number\"]} {i[\"title\"]} ({i[\"createdAt\"][:10]})') for i in issues]" 2>/dev/null \
  || echo "（需要 gh CLI 登录）"
```

### Step 4：服务器知识库快照（可选，需 SSH 隧道）

```bash
# 如果已有 SSH 隧道（本地 25432 → 服务器 5432）：
ssh -i ~/.ssh/openclaw1.1.pem root@118.196.64.48 \
  "cd /opt/cn-kis-v2/backend && python manage.py evaluate_knowledge_health --skip-retrieval --json 2>/dev/null | python3 -c \"import sys,json; r=json.load(sys.stdin); print(f'知识条目: {r[\\\"scale\\\"][\\\"entry_count\\\"]:,} 总 / {r[\\\"scale\\\"][\\\"published_count\\\"]:,} 已发布 | 向量化: {r[\\\"integrity\\\"][\\\"vector_rate\\\"]}% | 图谱关系: {r[\\\"scale\\\"][\\\"relation_count\\\"]:,}')\"" 2>/dev/null \
  || echo "（服务器快照不可用，请查看 LEARNING_LOOP_STATUS.md）"
```

### Step 5：输出结构化报告

按如下格式输出（根据 Step 1-4 的真实数据填写）：

```
═══════════════════════════════════════════════
  系统脉搏报告 — [当前日期]
═══════════════════════════════════════════════

📌 当前任务分支：[分支名]
📝 最近提交：[最近 1-2 条]

📊 KPI 达标情况（对照第 8 周目标）：
  [✅/⚠️/🔴] collaborates_with 关系：[实际值] / 目标 10,000+
  [✅/⚠️/🔴] IM KnowledgeEntry published：[实际值] / 目标 200K+
  [✅/⚠️/🔴] 邮件信号 unknown%：[实际值] / 目标 <15%
  [✅/⚠️/🔴] 导入脚本接入 LearningRunner：[x]/6
  [✅/⚠️/🔴] WorkerPolicyUpdate 累计：[实际值] / 目标 20+

📋 待处理数据洞察（data-insight Issues）：
  [Issue 列表，含编号和创建日期]

🎯 今日推荐行动（按优先级）：
  1. [最高优先级任务，来源：未达标 KPI / 待处理 Issue / Track 进度]
  2. [次优先级]
  3. [可选]

📌 需要你决策的事项：
  - [data-insight Issue 中需人工判断的具体问题]

═══════════════════════════════════════════════
```

## 优先级判断规则

状态图标：✅ 已达标 | ⚠️ 进行中未达标 | 🔴 严重滞后（实际值 < 目标的 50%）

推荐行动优先级排序：
1. 🔴 严重滞后的 KPI → 立即运行对应激活命令
2. data-insight Issue 超 3 天未处理 → 决策（纳入开发 or 关闭）
3. Track B 导入脚本未接入 → 改造下一个脚本
4. ⚠️ 进行中的 KPI → 继续推进对应 Track

## 示例对话

```
用户：检查系统脉搏

AI：[执行 Step 1-5，输出完整报告]

═══════════════════════════════════════════════
  系统脉搏报告 — 2026-03-25 (周三)
═══════════════════════════════════════════════

📌 当前任务分支：feature/common/4-ops-briefing
📝 最近提交：feat(common): 导入脚本支持 --db-host/port/name/user 参数

📊 KPI 达标情况：
  🔴 collaborates_with 关系：251 / 目标 10,000+
  🔴 IM KnowledgeEntry published：0 / 目标 200K+
  🔴 邮件信号 unknown%：85% / 目标 <15%
  🔴 导入脚本接入 LearningRunner：0/6
  🔴 WorkerPolicyUpdate 累计：0 / 目标 20+

📋 待处理数据洞察：（暂无，B1 完成后自动生成）

🎯 今日推荐行动：
  1. [立即] 在服务器运行 activate_im_data.sh 启动 IM 激活流程
  2. [本周] 完成 LearningImportRunner 基类（B1）
  3. [本周] 新建 reconcile_mail_signals 命令（A2）

📌 需要你决策的事项：
  - B1 完成后检查自动生成的 data-insight Issues，决定哪些进入开发
═══════════════════════════════════════════════
```
