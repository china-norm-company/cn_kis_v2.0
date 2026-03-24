# Skill: start-task（启动任务分支）

## 用途

帮助用户从 GitHub Issue 启动一个规范的任务分支。适合在接到新需求时使用。

## 使用时机

- 用户说「我要开始做 Issue #xxx」
- 用户说「帮我创建一个分支做 xxx 功能」
- 用户说「我要开发某工作台的某功能」

## 执行步骤

### 第 1 步：收集信息

向用户确认以下信息（如对话中已有则直接使用）：

1. **Issue 编号**：GitHub 上的 Issue 编号（纯数字，如 231）
2. **工作台**：从 18 个工作台中选一个（secretary/finance/research/execution/quality/hr/crm/recruitment/equipment/material/facility/evaluator/lab-personnel/ethics/reception/control-plane/governance/digital-workforce/common）
3. **任务简述**：3-5 个英文单词，用连字符分隔（如 `sample-rule-editor`）
4. **变更类型**：feature（新功能）/ fix（修复）/ chore（配置/文档）/ wave（迁移波次）/ hotfix（紧急修复）

### 第 2 步：生成命令

根据收集的信息，生成并向用户展示以下命令：

```bash
./ops/scripts/dev-task.sh start-task <workstation> <issue-id> <slug>
```

例如：

```bash
./ops/scripts/dev-task.sh start-task quality 231 sample-rule-editor
```

### 第 3 步：确认后执行

告知用户预期结果：
- 脚本会自动同步最新 main
- 自动创建分支 `feature/<workstation>/<issue-id>-<slug>`
- 切换到新分支

询问用户「是否现在执行？」，用户确认后执行命令。

### 第 4 步：执行后确认

执行完成后：

```bash
git branch --show-current  # 确认已在新分支
```

告知用户：
- 已创建并切换到任务分支
- 下一步：在 Cursor 里开发
- 完成后运行 `./ops/scripts/dev-task.sh push-task`

## 示例对话

```
用户：我要开始做 Issue #231，是质量台的样品规则编辑器功能

AI 执行 start-task 技能：
1. 确认：Issue #231、工作台：quality、描述：sample-rule-editor、类型：feature
2. 展示命令：./ops/scripts/dev-task.sh start-task quality 231 sample-rule-editor
3. 执行后确认：分支 feature/quality/231-sample-rule-editor 已创建
4. 可以开始开发了，我来帮你分析需要改哪些文件
```
