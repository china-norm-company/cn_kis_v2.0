# TEAM WORKFLOW — CN KIS V2.0

本文件定义 `cn_kis_v2.0` 的团队协作标准流程，适用于日常迭代、优化与 V2 迁移工作。

> **必读前置**：请先阅读 [`docs/V2_MIGRATION_CHARTER.md`](V2_MIGRATION_CHARTER.md)。
> 所有开发工作必须遵守其中四条红线。

## 1. 协作原则

- 仓库为私有资产，禁止对外公开与传播
- 所有代码改动优先通过 PR 合并，不直接推送 `main`
- 每次变更必须可追溯：有 Issue、有 PR、有测试说明
- V2 迁移红线判定优先于任何单个 PR 的局部决策

## 2. 标准开发流程

1. 创建或认领 Issue（需求/缺陷/迁移任务/优化）
2. 从 `main` 拉最新后创建分支（见下方分支命名规范）
3. 开发并本地自测
4. 提交 PR，完整填写模板（含 V2 波次标记与红线检查项）
5. 至少 1 位团队成员评审通过后合并

## 3. 分支命名规范

```
feature/<workstation>-<描述>     新功能
fix/<workstation>-<描述>         Bug 修复
wave/<wave-number>-<描述>        迁移波次工作
chore/<描述>                     构建/配置/文档
hotfix/<描述>                    紧急修复
```

示例：
- `feature/secretary-inbox-filter`
- `wave/1-identity-migration`
- `fix/finance-invoice-null-check`

## 4. 质量门禁（已启用）

工作流：`.github/workflows/pr-quality-gate.yml`

PR 非草稿状态下会自动检查：

- 是否关联 Issue
- 是否勾选"已完成本地自测"
- 是否填写可执行的测试步骤
- 是否填写风险点与回滚方案
- **认证权限域**（涉及 identity/ 或 feishu_fetcher）：额外检查红线合规声明
- **知识资产域**（涉及 knowledge/ 或 ekb/lims models）：额外检查无保护写保护声明

## 5. 部署流程

### 测试部署（阿里云）

```
develop 分支 push → GitHub Actions → Aliyun test-guide.data-infact.com
```

工作流：`.github/workflows/backend-deploy-aliyun.yml`

- 自动校验测试 .env 中 `CELERY_PRODUCTION_TASKS_DISABLED=true`
- 自动执行迁移并重启服务
- 自动执行健康检查

### 生产部署（火山云）

生产部署为**受控手动操作**，须由系统负责人执行，不自动触发。

见：[`ops/deploy/volcengine-prod-runbook.md`](../ops/deploy/volcengine-prod-runbook.md)

## 6. 直推保护

`main` 分支已启用 Branch Protection：

- Require a pull request before merging
- Require at least 1 approval
- Require review from Code Owners（见 `.github/CODEOWNERS`）
- Require status checks: `PR Quality Gate / validate-pr-template`

## 7. 紧急修复（Hotfix）流程

若必须先修复再补流程：

1. 记录紧急原因与影响范围
2. 修复后 24 小时内补建 PR
3. PR 中补齐测试、风险、回滚与评审记录

## 8. 新成员入组清单

- [ ] 阅读 `README.md`
- [ ] 阅读 `docs/V2_MIGRATION_CHARTER.md`（必读，四条红线）
- [ ] 阅读本文件 `docs/TEAM_WORKFLOW.md`
- [ ] 阅读 `docs/CURSOR_COLLABORATION_ONBOARDING.md`
- [ ] 完成一次标准 PR 演练（含 Issue 关联与测试说明）
- [ ] 确认已加入 GitHub 仓库协作者

## 9. 看板与 Issue 管理

- Issue 关闭时看板自动更新为 `Done`
- Issue 重开时看板自动回退为 `Todo`
- 迁移波次任务使用标签 `wave-0` ~ `wave-5` 标记

## 10. 敏感信息约定

- 禁止提交 `.env`、密钥、`secrets.env`、`*.pem` 到版本库
- 测试 `.env` 通过 GitHub Secrets 注入（`BACKEND_DOT_ENV`）
- 生产 `.env` 存储在 `deploy/secrets.env`（已 .gitignore）
- 生产凭证轮换前，禁止执行正式对外分发
