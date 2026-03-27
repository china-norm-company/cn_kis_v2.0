# Skill: prepare-pr（准备 Pull Request 描述）

## 用途

根据当前分支的改动，自动生成符合 PR 模板要求的完整 PR 描述，包括业务目标、影响范围、测试步骤、风险点和回滚方案。

## 使用时机

- 用户说「帮我准备 PR」
- 用户说「我要提 PR 了」
- 执行 `push-task` 后，提示用户创建 PR 时

## 执行步骤

### 第 1 步：收集当前分支信息

```bash
git branch --show-current          # 分支名（含工作台和 Issue 编号）
git log --oneline main..HEAD       # 本分支的所有提交
git diff --stat main..HEAD         # 改动文件清单
git diff main..HEAD -- '*.py' '*.ts' '*.tsx'  # 关键改动内容摘要
```

### 第 2 步：判断触及的域

根据改动文件判断：

| 改动路径 | 特殊门禁 |
|---------|---------|
| `backend/apps/identity/` 或 `feishu_fetcher.py` | 认证权限域 — 需勾选额外声明 |
| `backend/apps/knowledge/` 或 `ekb/lims models` | 知识资产域 — 需勾选额外声明 |
| `docs/V2_MIGRATION_CHARTER.md` | 迁移章程 — PR 标题需加 `[CHARTER]` |
| `.github/workflows/` 或 `CODEOWNERS` | CI/CD 配置 — 需系统负责人审阅 |

### 第 3 步：生成 PR 描述草稿

按照 `.github/PULL_REQUEST_TEMPLATE.md` 格式，填写：

```markdown
## 关联 Issue
Closes #<issue-id>

## 变更说明

### 业务目标
<从提交记录和改动摘要中提炼，一句话说清解决了什么问题>

### 影响范围
- 涉及工作台：<从分支名提取>
- 涉及接口：<从改动文件推断>
- 涉及数据库迁移：[ ] 是  [ ] 否

### V2 迁移波次
[x] <从分支类型推断，若 wave 则标注对应波次，否则勾选"非迁移任务">

---

## 检查清单
- [x] 已完成本地自测
- [ ] 代码已通过 lint 检查   ← 提醒用户确认
- [x] 无敏感信息（密钥、.env、token）被提交

### 认证权限域（若涉及）
- [x/空] 本 PR 不破坏飞书主授权链路
- [x/空] refresh_token 防覆盖逻辑已保留

### 知识资产域（若涉及）
- [x/空] 本 PR 不向生产知识资产执行无保护写操作

---

## 测试步骤与结果
1. <从改动内容推断，列出 3 条具体操作步骤>
2. 
3. 

---

## 风险点与回滚方案
风险点：<根据改动类型评估，如"前端渲染改动可能影响其他 tab 的展示">
回滚方案：git revert <最新 commit hash> 或 git revert HEAD
```

### 第 4 步：呈现给用户并确认

向用户展示草稿，说明：
- 哪些字段是基于代码改动自动推断的
- 哪些字段（如测试步骤细节）需要用户补充
- 若有特殊门禁域，提醒用户确认对应的勾选项

### 第 5 步：输出 PR 创建链接

```
创建 PR：
https://github.com/china-norm-company/cn_kis_v2.0/compare/<branch-name>
```

## 注意事项

- **不要替用户勾选他们还未验证的项目**（如"代码已通过 lint 检查"，需用户实际运行后再勾）
- **测试步骤必须具体可执行**，不接受"运行程序查看效果"这类无法复现的描述
- **回滚方案必须包含具体命令**，不接受"联系运维"
