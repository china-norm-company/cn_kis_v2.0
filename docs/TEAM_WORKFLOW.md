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
- [ ] 运行 `python3 ops/scripts/workstation_consistency_check.py` 确认本地代码工作台注册表一致
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

## 11. 工作台注册表变更规范

**系统共有 19 个工作台。唯一真相源：`backend/configs/workstations.yaml`**

### 任何涉及工作台列表的变更，必须同时完成以下四步：

| 步骤 | 操作 | 文件 |
|------|------|------|
| 1 | 修改注册表 | `backend/configs/workstations.yaml` |
| 2 | 同步后端合法标识 | `backend/apps/identity/api.py` → `VALID_WORKSTATION_KEYS` |
| 3 | 同步超管角色权限 | `backend/apps/identity/management/commands/seed_roles.py` |
| 4 | 同步 nginx 路由 | 服务器 `/etc/nginx/sites-enabled/cn-kis-v2` |

### 验收命令（每次变更后必须运行，全部通过才能提交）：

```bash
python3 ops/scripts/workstation_consistency_check.py
```

期望输出：`✅ 所有检查通过！工作台注册表一致性验收成功。当前工作台数量：19 个`

### CI 自动检查

每次 PR 和推送到 main/staging 时，CI 会自动运行此检查（见 `.github/workflows/ci.yml` → `workstation-check` 步骤）。检查失败则 PR 无法合并。

### 废弃标识（绝对禁止用作工作台标识）

| 废弃词 | 原因 | 正确替代 |
|--------|------|---------|
| `governance` | 旧名，已重命名 | `admin`（鹿鸣·治理台） |
| `iam` | 已合并入鹿鸣·治理台 | `admin` |
