# Skill: sync-main（同步最新主干到当前分支）

## 用途

安全地把最新 `main` 分支的内容合并到当前任务分支，避免分支过度落后导致合并冲突积累。

## 使用时机

- 用户说「我要同步最新代码」
- 用户说「main 有更新了，帮我同步」
- 当前任务分支落后 main 超过 3 个提交时，AI 应主动建议同步
- 在 push-task 前建议先同步

## 执行步骤

### 第 1 步：检查当前状态

```bash
git branch --show-current          # 确认不在 main/staging
git status                         # 确认工作区干净
git fetch origin                   # 获取远程最新状态
git rev-list --count HEAD..origin/main  # 落后 main 几个提交
```

### 第 2 步：判断是否有未提交改动

- **有未提交改动**：告知用户先提交或暂存（`git stash`），再同步
- **工作区干净**：继续执行同步

### 第 3 步：执行同步

```bash
./ops/scripts/dev-task.sh sync-task
```

等价于：

```bash
git fetch origin
git merge origin/main --no-edit
```

### 第 4 步：处理结果

**无冲突**：
- 告知用户同步成功
- 显示合并了哪些提交（`git log --oneline origin/main -5`）

**有冲突**：
- 转入 `resolve-conflict` 技能处理
- 不要让用户独自面对冲突输出

## 示例对话

```
用户：main 有更新了，帮我同步一下

AI：
当前分支：feature/quality/231-sample-rule-editor
工作区状态：干净
落后 main：5 个提交

正在同步...
执行：./ops/scripts/dev-task.sh sync-task

同步成功！已合并以下更新：
- fix(secretary)/245-login-loop
- chore/common/248-update-deps
- feat(research)/250-protocol-filter
```
