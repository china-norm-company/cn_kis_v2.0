# GitHub Branch Protection 配置手册

本文档描述 `cn_kis_v2.0` 仓库在 GitHub 上需要手动启用的分支保护规则。  
**这些规则无法通过代码提交自动生效，必须由仓库管理员在 GitHub 网页端操作一次。**

> 操作路径：仓库 → **Settings → Branches → Add branch protection rule**

---

## 一、保护 `main` 分支（生产主干）

在「Branch name pattern」填写 `main`，然后勾选以下选项：

| 选项 | 必须勾选 | 说明 |
|------|----------|------|
| Require a pull request before merging | ✅ | 禁止直接 push |
| Required approvals | ✅ 设为 **1** | 至少 1 人评审通过 |
| Dismiss stale pull request approvals when new commits are pushed | ✅ | 新提交后重新评审 |
| Require review from Code Owners | ✅ | 触及认证/知识域时 Code Owner 必须评审 |
| Require status checks to pass before merging | ✅ | CI 未通过不能合并 |
| → Status check: `PR Quality Gate / validate-pr-template` | ✅ | 必须通过 PR 描述门禁 |
| → Status check: `CI / lint-and-test` | ✅ | 必须通过 lint/test（见 `.github/workflows/ci.yml`） |
| Require branches to be up to date before merging | ✅ | 防止过时分支合入 |
| Require conversation resolution before merging | ✅ | 所有评审意见须处理 |
| Do not allow bypassing the above settings | ✅ | 管理员也不得绕过 |
| Restrict who can push to matching branches | ✅ | 只允许 PR 合并 |
| Block force pushes | ✅ | 禁止强推 |
| Allow deletions | ❌ | 禁止删除 main |
| Automatically delete head branches | ✅ | PR 合并后自动删分支 |

---

## 二、保护 `staging` 分支（测试集成环境）

在「Branch name pattern」填写 `staging`，勾选与 `main` 相同的选项，但：

- Required approvals 可设为 **1**（与 main 相同）
- 测试集成分支主要从 feature/* 合入，拒绝直推即可

---

## 三、用 Rulesets 替代（推荐）

GitHub 提供了更现代的 **Rulesets** 功能，可以同时保护多个分支，并支持更细粒度的权限控制。

操作路径：仓库 → **Settings → Rules → Rulesets → New ruleset**

建议创建一条规则集「Protected Branches」，Target branches 填写：
```
main
staging
```

并在该规则集中勾选与上方相同的选项。  
Rulesets 支持在组织层面复用，适合未来仓库扩展。

---

## 四、验证配置是否生效

配置完成后，执行以下验证：

```bash
# 1. 尝试直接推送 main（应该被拒绝）
git checkout main
echo "test" >> README.md
git add README.md
git commit -m "test direct push"
git push origin main
# 期望：报错 remote: error: GH006: Protected branch update failed

# 2. 检查 API 返回的分支保护状态
# 浏览器访问：https://github.com/china-norm-company/cn_kis_v2.0/settings/branches
# 确认 main 和 staging 行显示 "Protected" 标签
```

---

## 五、CODEOWNERS 当前配置

当前 `.github/CODEOWNERS` 已配置以下敏感路径的所有者：

```
# 认证与身份域 — 需要 Code Owner Review
backend/apps/identity/
backend/apps/secretary/feishu_fetcher.py
backend/apps/secretary/models.py

# 知识资产域 — 需要 Code Owner Review
backend/apps/knowledge/
backend/apps/ekuaibao_integration/models.py
backend/apps/lims_integration/models.py

# 迁移章程 — 需要 Code Owner Review
docs/V2_MIGRATION_CHARTER.md
backend/configs/workstations.yaml
ops/
.github/workflows/
```

如需调整 Code Owner（如更换人员），修改 `.github/CODEOWNERS` 并通过 PR 更新。

---

## 六、每次新成员加入时

1. 进入仓库 → Settings → Collaborators → Add people
2. 输入对方 GitHub 用户名，赋予 **Write** 权限
3. 对方接受邀请后，才能向仓库推送分支和创建 PR
4. 不要赋予 **Admin** 权限，除非是仓库维护者
