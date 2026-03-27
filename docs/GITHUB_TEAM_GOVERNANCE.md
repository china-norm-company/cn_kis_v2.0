# GitHub 团队治理操作手册

> 适用人员：仓库 Owner / 技术负责人  
> 最后更新：2026-03-26

---

## 一、GitHub Teams 创建（必须先做，CODEOWNERS 才能生效）

CODEOWNERS 里引用的 `@china-norm-company/core-dev` 等 Team，必须在 GitHub 组织后台手动创建后才会生效。

### 第 1 步：打开 Teams 管理页面

```
https://github.com/orgs/china-norm-company/teams
```

### 第 2 步：依次创建以下 4 个 Team

| Team 名称 | 权限级别 | 描述 | 适合成员 |
|---|---|---|---|
| `core-dev` | **Maintain** | 架构师 / 技术负责人，有权 approve 高风险域 PR | 1-2 名核心工程师 |
| `wave-a-dev` | **Write** | Wave A 工作台开发者（secretary/research/recruitment/admin） | Wave A 工作台负责人 |
| `wave-b-dev` | **Write** | Wave B 工作台开发者（execution/quality/finance/dw） | Wave B 工作台负责人 |
| `business-team` | **Write** | 所有开发成员兜底 Team | 全体开发成员 |

**创建步骤**（每个 Team 重复以下操作）：
1. 点击 `New team`
2. Team name 填写 Team 名称（如 `core-dev`）
3. Description 填写描述
4. Visibility 选 `Secret`（内部可见即可）
5. 点击 `Create team`
6. 进入 Team 页面 → Members → Add a member → 输入 GitHub 用户名添加成员

### 第 3 步：给 Team 授予仓库权限

进入每个 Team → Repositories → Add repository → `cn_kis_v2.0` → 选择对应权限级别

---

## 二、Branch Protection Rules（main 分支）

### 打开设置页面

```
https://github.com/china-norm-company/cn_kis_v2.0/settings/branches
```

### 点击 `Add branch ruleset` 或 `Add rule`

**Branch name pattern**：`main`

勾选以下规则：

| 规则 | 设置值 | 说明 |
|---|---|---|
| ✅ Require a pull request before merging | 开启 | 禁止直接 push 到 main |
| — Required approvals | `1` | 至少 1 人 approve（初期），稳定后改为 2 |
| — Dismiss stale pull request approvals | ✅ 开启 | 有新 push 时旧 approve 自动作废 |
| — Require review from Code Owners | ✅ 开启 | **CODEOWNERS 必须审查才能合并** |
| ✅ Require status checks to pass | 开启 | 必须通过 CI 才能合并 |
| — Status checks：`lint-and-test` | 搜索并选中 | CI workflow 的 job 名 |
| — Require branches to be up to date | ✅ 开启 | 必须先 rebase/merge 最新 main |
| ✅ Restrict who can push to matching branches | 开启 | 只允许 Admins 直接 push（紧急修复用） |
| ✅ Do not allow bypassing the above settings | 开启 | 连 Admin 也不能绕过规则 |

点击 `Create` 保存。

---

## 三、Branch Protection Rules（staging 分支）

**Branch name pattern**：`staging`

| 规则 | 设置值 |
|---|---|
| Require a pull request before merging | ✅ 开启 |
| Required approvals | `1` |
| Require status checks：`lint-and-test` | ✅ 开启 |

---

## 四、GitHub Environments（部署保护）

```
https://github.com/china-norm-company/cn_kis_v2.0/settings/environments
```

### 创建 `aliyun-test` 环境

1. 点击 `New environment` → 名称 `aliyun-test`
2. **Protection rules**：
   - Required reviewers：添加 `core-dev` Team（部署前需 1 人确认）
3. **Deployment branches**：只允许 `staging` 分支
4. 点击 `Save protection rules`

### 创建 `volcengine-prod` 环境

1. 点击 `New environment` → 名称 `volcengine-prod`
2. **Protection rules**：
   - Required reviewers：添加 `core-dev` Team（需要 **2 人** 确认）
   - Wait timer：`5` 分钟（给团队反应时间）
3. **Deployment branches**：只允许 `main` 分支
4. 点击 `Save protection rules`

---

## 五、GitHub Secrets 完整检查清单

```
https://github.com/china-norm-company/cn_kis_v2.0/settings/secrets/actions
```

验证以下所有 Secrets 是否存在（登录 GitHub CLI 后也可运行命令验证）：

```bash
gh secret list --repo china-norm-company/cn_kis_v2.0
```

| Secret 名称 | 用途 | 是否必须 |
|---|---|---|
| `FEISHU_APP_ID` | 子衿应用 App ID（`cli_a98b0babd020500e`） | ✅ 必须 |
| `FEISHU_APP_SECRET` | 子衿应用 App Secret | ✅ 必须 |
| `FEISHU_BOT_WEBHOOK_URL` | 飞书开发群 Webhook（早晚报推送） | ✅ 必须（和下面二选一） |
| `FEISHU_DEV_GROUP_CHAT_ID` | 开发群 chat_id（`oc_cdfad80d9deb950414e8b4033f5ac1ff`） | ✅ 必须（和上面二选一） |
| `BACKEND_DOT_ENV` | 生产 `.env` 完整内容（部署时写入服务器） | ✅ 必须（自托管部署） |
| `GH_TOKEN_ISSUES` | GitHub PAT（Actions 内操作 Issues/PR 用） | ✅ 必须 |
| `ALIYUN_SSH_KEY` | 阿里云 SSH 私钥（aliyun 部署用） | 按需 |

> ⚠️ **注意**：Secret 名称不能以 `GITHUB_` 开头（GitHub 保留前缀），本项目已用 `GH_TOKEN_ISSUES`，正确。

---

## 六、账号安全加固（组织 Owner 必做）

```
https://github.com/organizations/china-norm-company/settings/authentication_security
```

| 安全措施 | 操作 |
|---|---|
| **强制所有成员开启 2FA** | Require two-factor authentication → 勾选 → Save |
| **PAT 有效期限制** | Fine-grained personal access tokens → 设置最长 90 天 |
| **Secret Scanning** | Settings → Code security → Secret scanning → Enable |
| **Push Protection** | 同上 → Push protection → Enable（防止密钥被意外 push） |

---

## 七、登录 GitHub CLI（本地开发必备）

```bash
# 安装（macOS）
brew install gh

# 登录（选择浏览器授权）
gh auth login
# → GitHub.com
# → HTTPS
# → Login with a web browser

# 验证登录成功
gh auth status

# 验证仓库访问
gh repo view china-norm-company/cn_kis_v2.0
```

---

## 八、CODEOWNERS 说明（已更新）

当前 `.github/CODEOWNERS` 按以下层级管理代码审查权：

| 层级 | 路径 | 必须审查的 Team |
|---|---|---|
| 🔴 最高风险 | `identity/`、`knowledge/`、`workflows/`、`migrations/` | `core-dev` |
| 🟡 Wave A（已推广） | `workstations/secretary/` 等 | `wave-a-dev` + `core-dev` |
| 🟢 Wave B（试点） | `workstations/execution/` 等 | `wave-b-dev` |
| ⚪ 其余所有 | `*` | `business-team` |

> **重要**：CODEOWNERS 只有在 Branch Protection 中开启了 `Require review from Code Owners` 后才会强制执行，否则只是提示性的。

---

## 九、推荐的完整操作顺序

```
1. 登录 GitHub CLI                       ← gh auth login
2. 创建 4 个 Teams，添加成员             ← github.com/orgs/china-norm-company/teams
3. 开启 main 分支保护规则                ← 参考第二节
4. 开启 staging 分支保护规则             ← 参考第三节
5. 创建 aliyun-test / volcengine-prod 环境 ← 参考第四节
6. 验证 Secrets 是否完整                 ← gh secret list
7. 开启组织 2FA 强制要求                 ← 参考第六节
```

完成以上步骤后，团队的 GitHub 协作体系即达到生产级别安全标准。
