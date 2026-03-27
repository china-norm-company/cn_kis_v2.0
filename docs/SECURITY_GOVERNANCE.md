# CN KIS V2.0 代码库与服务器安全管理制度

> 版本：v1.0 | 生效日期：2026-03-26 | 制定人：技术总监  
> 适用范围：CN KIS V2.0 全体 19 个工作台、GitHub 代码仓库、火山云生产服务器  
> 审查周期：每季度一次，由技术总监主导

---

## 一、总则

### 1.1 制度目标

本制度规范 CN KIS V2.0 系统在代码库管理、服务器访问和密钥使用三个层面的安全行为，确保：

- **最小权限**：每个人只持有完成其工作所必需的最低权限
- **可追溯**：所有高权限操作均有操作人记录，不可抹除
- **纵深防御**：密钥、访问权、代码合并各自独立守护，不依赖单一环节
- **合规就绪**：满足 GCP / 21 CFR Part 11 对访问控制与审计的基本要求

### 1.2 适用人员与角色定义

| 安全角色 | 对应人员类型 | 权限级别 |
|---|---|---|
| **系统安全负责人** | 技术总监 | 最高，可执行所有操作 |
| **仓库管理员** | 技术负责人（1–2 人）| GitHub Admin，服务器 root |
| **后端开发者** | 后端工程师 | GitHub Write，无服务器直接 root |
| **前端开发者** | 前端工程师 | GitHub Write，无服务器访问 |
| **IT 运维专员** | IT专员 | 只读仓库 / 受限服务器操作 |
| **外部协作者** | 合作方/实习生 | GitHub Read（特定仓库），无服务器访问 |

---

## 二、GitHub 代码仓库权限管理

### 2.1 成员权限分级

```
仓库：github.com/china-norm-company/cn_kis_v2.0（私有）

Admin（仓库管理员）
  ├── 管理分支保护规则
  ├── 邀请/移除协作者
  ├── 管理 GitHub Secrets
  └── 合并紧急 hotfix（需同时满足 CI 通过）

Write（开发者）
  ├── 创建/推送 feature/* fix/* wave/* 等任务分支
  ├── 创建 Pull Request
  └── 禁止直接推送 main / staging

Read（只读协作者）
  ├── 查看代码、Issue、PR
  └── 禁止推送任何分支
```

**操作路径**：`仓库 → Settings → Collaborators`

**规则**：
- 新成员加入时，默认赋予 **Write** 权限，**不得直接赋予 Admin**
- Admin 权限最多保留 **2 人**（技术总监 + 备份管理员），以飞书消息记录授权决策
- 外部合作方（如实习生、合作公司）一律赋予 **Read**，完成合作后立即移除
- 每季度由仓库管理员在 GitHub Collaborators 页面执行一次成员清单核查，移除无效账号

### 2.2 分支保护规则（已启用）

以下保护已通过 `.github/` 配置启用，**不得随意修改**：

| 规则 | main | staging |
|---|---|---|
| 禁止直接 push | ✅ | ✅ |
| 合并前必须 PR | ✅ | ✅ |
| 至少 1 人 Review 通过 | ✅ | ✅ |
| Code Owner Review（敏感路径）| ✅ | ✅ |
| CI 状态检查通过 | ✅ | ✅ |
| 禁止 Force Push | ✅ | ✅ |
| 管理员也不得绕过 | ✅ | ✅ |

**变更分支保护规则**的操作需在飞书开发小组群（`CN_KIS_PLATFORM开发小组`）公告，并经系统安全负责人口头或消息确认。

### 2.3 Code Owner 敏感路径保护

以下路径的 PR **必须由对应 Code Owner 审核通过**才能合并：

```
backend/apps/identity/          → 认证/权限/Token 核心域
backend/apps/secretary/feishu_fetcher.py
backend/apps/secretary/models.py
backend/apps/knowledge/         → 知识资产域
backend/apps/ekuaibao_integration/models.py
backend/apps/lims_integration/models.py
docs/V2_MIGRATION_CHARTER.md
backend/configs/workstations.yaml
ops/                            → 运维脚本
.github/workflows/              → CI/CD 流水线
```

Code Owner 配置文件：`.github/CODEOWNERS`，修改此文件本身也需通过 PR + 安全负责人审核。

### 2.4 禁止提交到版本库的内容

以下文件或内容**严禁出现在任何 commit 中**：

| 禁止内容 | 说明 |
|---|---|
| `.env`、`secrets.env` | 包含所有服务密码的环境变量文件 |
| `*.pem`、`*.key`、`id_rsa` | SSH 私钥、TLS 证书私钥 |
| `feishu_user_tokens.json` | 飞书用户 token 持久化文件 |
| 数据库连接字符串（含密码）| 不得硬编码在代码中 |
| 飞书 App Secret 明文 | 必须通过 GitHub Secrets / .env 注入 |
| 火山云 AccessKey / SecretKey | 同上 |

**技术保障**：`.gitignore` 已配置屏蔽上述文件，GitHub Actions 的 `pr-quality-gate.yml` 对敏感路径有额外检查。

**泄露应急**：如发现任何密钥被误提交，立即执行第七章"安全事件响应"流程。

---

## 三、服务器访问权限管理

### 3.1 服务器基本信息

| 属性 | 值 |
|---|---|
| 云服务商 | 火山云（ByteDance Volcengine）|
| 公网 IP | `118.196.64.48` |
| SSH 端口 | 默认（22）|
| 操作系统 | Linux |
| SSH 密钥 | `~/.ssh/openclaw1.1.pem` |
| 后端部署路径 | `/opt/cn-kis-v2/` |
| 前端部署路径 | `/var/www/cn-kis/` |

### 3.2 服务器访问权限分级

```
root 账户（最高权限）
  ├── 适用：正式部署操作（gunicorn 重载、nginx 配置、迁移）
  ├── 持有人：仓库管理员（最多 2 人持有 .pem 密钥）
  └── 所有 root 操作必须在飞书开发小组群中记录「操作人 + 时间 + 操作内容」

受限运维账户（未来规划，当前暂无）
  ├── 适用：日常日志查看、服务重启
  └── 不持有 root shell 权限
```

**当前阶段**（Wave 1–3）：仅系统安全负责人和仓库管理员持有 `.pem` 私钥。其他开发者通过 GitHub Actions 自动化部署，不需要直接 SSH 访问生产服务器。

### 3.3 SSH 密钥管理规范

| 规范项 | 要求 |
|---|---|
| 密钥格式 | PEM 格式（`openclaw1.1.pem`），权限设为 `chmod 400` |
| 存储位置 | 仅存储在持有人本地机器 `~/.ssh/`，禁止上传至任何云盘、IM 工具 |
| 传递方式 | 新增持有人时，通过飞书「文件传输」点对点传送，禁止邮件附件或群发 |
| 持有人记录 | 系统安全负责人维护「密钥持有人台账」（见本章 3.6）|
| 轮换周期 | 每 **6 个月**一次主动轮换，或在持有人离职后 **24 小时内**立即轮换 |
| 已离职人员 | 立即在火山云控制台删除该密钥对，生成新密钥对并分发给现有持有人 |

### 3.4 服务器操作规范

**部署操作**（涉及代码更新）

```bash
# ✅ 标准部署流程（所有步骤必须记录到飞书开发小组群）
# Step 1：确认 main 分支 CI 通过
# Step 2：拉取代码到服务器
# Step 3：执行迁移（如有）
# Step 4：优雅重载服务（kill -HUP 或 gunicorn reload）
# Step 5：健康检查确认服务正常
```

**禁止的服务器操作**：

- ❌ `rm -rf` 任何生产数据目录（`/opt/cn-kis-v2/`、`/var/www/`）
- ❌ `kill -9` 生产进程（应使用 `kill -HUP` 优雅重载）
- ❌ 在服务器上直接编辑生产代码（应通过 Git 部署）
- ❌ 在服务器上明文 `echo` 或 `cat` 包含密码的环境变量
- ❌ 未经确认修改 `.env` 文件中的飞书凭证或数据库密码

### 3.5 防火墙与网络安全

| 端口 | 用途 | 开放策略 |
|---|---|---|
| 22（SSH）| 服务器登录 | **仅限指定 IP 白名单**（开发者办公网络），禁止 `0.0.0.0/0` |
| 80（HTTP）| Nginx 反向代理 | 对外开放 |
| 443（HTTPS）| Nginx TLS | 对外开放（待配置 SSL 证书后启用）|
| 8001（Gunicorn）| 后端内部 | 仅 `127.0.0.1`，禁止对外暴露 |
| 5432（PostgreSQL）| 数据库 | 仅服务器本机，禁止对外暴露 |

**规范**：每次修改安全组规则，必须在飞书开发小组群记录「修改人 + 时间 + 变更内容 + 原因」。

### 3.6 密钥持有人台账

由系统安全负责人（技术总监）在飞书文档维护以下台账，并在每次变更后 24 小时内更新：

```
台账名称：CN KIS V2.0 - SSH 密钥持有人台账（飞书文档，仅管理员可见）

字段：
  持有人姓名 | 飞书账号 | 获取日期 | 密钥版本 | 状态（在职/离职）| 备注
```

---

## 四、密钥与凭证管理

### 4.1 凭证分类与存储规范

| 凭证类型 | 凭证内容 | 生产存储位置 | 开发/测试注入方式 |
|---|---|---|---|
| **飞书应用凭证** | App ID + App Secret（3 套）| 服务器 `/opt/cn-kis-v2/backend/.env` | GitHub Secrets → Actions |
| **数据库密码** | PostgreSQL 用户密码 | 同上 `.env` | GitHub Secrets |
| **Django Secret Key** | `SECRET_KEY` | 同上 `.env` | GitHub Secrets |
| **服务器 SSH 密钥** | `openclaw1.1.pem` | 本地 `~/.ssh/`（持有人） | 点对点传送 |
| **GitHub PAT** | `GH_TOKEN_ISSUES` | GitHub Secrets（仅 Actions 使用）| 不注入本地开发环境 |
| **Qwen3 Embedding 内网地址** | GPU 算力中心 URL | `.env` `EMBEDDING_API_URL` | GitHub Secrets |
| **火山云 ARK API Key** | AI 推理凭证 | `.env` | GitHub Secrets |
| **飞书用户 Token** | 持久化用户 OAuth Token | `backend/data/feishu_user_tokens.json` | 本地采集，不进版本库 |

### 4.2 飞书应用凭证体系

系统共有 **3 套独立飞书应用凭证**，分别管理、分别轮换，禁止混用：

| 应用 | App ID | 用途 | 负责人 |
|---|---|---|---|
| 子衿（主授权）| `cli_a98b0babd020500e` | 17 个业务工作台统一 OAuth | 技术总监 |
| 鹿鸣·治理台 | `cli_a937515668b99cc9` | 治理台独立 OAuth | 技术总监 |
| 洞明·数据台 | `cli_a93753da2c381cef` | 数据台独立 OAuth | 技术总监 |

**轮换规则**：
- App Secret 轮换周期：**每年一次**（或在可疑泄露后立即轮换）
- 轮换步骤：① 飞书开放平台生成新 Secret → ② 更新服务器 `.env` → ③ 更新 GitHub Secrets → ④ kill -HUP gunicorn → ⑤ 验证登录正常 → ⑥ 销毁旧 Secret

### 4.3 环境变量管理规范

**生产环境（火山云）**：

```bash
# 文件路径（服务器上）
/opt/cn-kis-v2/backend/.env

# 文件权限（必须严格设置）
chmod 600 /opt/cn-kis-v2/backend/.env
chown root:root /opt/cn-kis-v2/backend/.env

# 查看内容时禁止截图或粘贴到 IM（临时查看用 sudo -E 命令行）
```

**开发环境（本地）**：

```bash
# 从 .env.example 复制后填写，不提交到版本库
cp .env.example .env
# .env 已在 .gitignore 中
```

**GitHub Actions（CI/CD 环境）**：

- 所有密钥通过 `Settings → Secrets and variables → Actions` 注入
- Secret 名称规范：`FEISHU_APP_SECRET_ZIJIN`、`DB_PASSWORD`、`SECRET_KEY` 等
- 每次新增 Secret 在飞书开发小组群记录「Secret 名称（不记录值）+ 添加人 + 用途」

### 4.4 密钥轮换计划

| 凭证 | 主动轮换周期 | 触发立即轮换的条件 |
|---|---|---|
| 飞书 App Secret（3 套）| 每年 | 代码泄露、离职人员曾接触、可疑 API 调用 |
| Django SECRET_KEY | 每年 | 泄露嫌疑 |
| 数据库密码 | 每 6 个月 | 泄露嫌疑、相关人员离职 |
| SSH 密钥（.pem）| 每 6 个月 | 持有人离职后 24 小时内 |
| GitHub PAT | 每 6 个月 | 泄露嫌疑 |
| 飞书用户 refresh_token | 自动滚动续期（Celery Beat 每 6h）| 无需手动，见 token 持久化规范 |

---

## 五、应用层身份与访问管理（IAM）

### 5.1 19 个工作台权限体系概览

CN KIS V2.0 包含以下 19 个工作台，权限由 `t_role` + `t_permission` + RBAC 中间件统一管控：

```
业务工作台（15 个）
  子衿·秘书台（secretary）    采苓·招募台（recruitment）
  维周·研究台（research）     怀瑾·质量台（quality）
  管仲·财务台（finance）      时雨·人事台（hr）
  进思·执行台（execution）    招招·受试者（subject）
  器衡·仪器台（equipment）    度支·物料台（material）
  坤元·设施台（facility）     衡技·评估台（evaluator）
  共济·伦理台（ethics）       御史·CRM台（crm）
  和序·接待台（reception）

平台工作台（4 个）
  鹿鸣·治理台（governance）   天工·统管台（control_plane）
  中书·智能台（agent_gateway）洞明·数据台（data_platform）
```

### 5.2 高权限角色管控规则

L8 及以上角色属于**高权限角色**，适用以下额外规则：

| 角色 | 级别 | 管控要求 |
|---|---|---|
| `superadmin` | L10 | 最多 **2 人**持有，必须是公司正式员工，由总经理/技术总监联合授权 |
| `admin` | L10 | 最多 **5 人**，由技术总监在鹿鸣·治理台分配，每季度复核 |
| `general_manager` / `tech_director` | L8 | 按实际岗位分配，不得超员分配 |
| `project_director` / `research_director` | L8 | 按项目实际负责人分配 |

**操作要求**：
- 高权限角色的分配/撤销由 `admin` 以上角色在**鹿鸣·治理台 → 用户管理页**操作
- 所有变更自动写入 `t_audit_log`（action=UPDATE）
- L8+ 角色变更需在飞书开发小组群公告

### 5.3 账号生命周期管理

```
入职 → 飞书 OAuth 首次登录 → 自动创建账号（默认 viewer，L1）
     │
     ▼ IT专员在鹿鸣治理台操作
分配角色 → 员工获得对应工作台访问权限
     │
     ▼ 转岗
旧角色撤销 → 新角色分配 → 记录到 t_audit_log
     │
     ▼ 离职
     ├── 立即：IT专员在鹿鸣治理台吊销会话（SessionsPage）
     ├── 24h内：移除 GitHub 仓库协作者权限
     ├── 24h内：若该员工持有 .pem 密钥，立即轮换 SSH 密钥
     └── 7天内：账号设为禁用状态（保留数据用于审计，不删除）
```

### 5.4 最小权限原则执行

- 新员工**默认 viewer（L1）**，由 IT专员逐项核实后分配实际角色
- **禁止批量赋予高权限**：不得以"先给 admin 用着"为由超级授权
- 项目结束后，项目相关的临时角色（如 `crc`）在项目关闭后 **30 天内**撤销
- 定期审查：每季度 IT专员核查所有 L5+ 账号是否仍在职且角色匹配

---

## 六、CI/CD 流水线安全

### 6.1 流水线访问控制

| 流水线文件 | 触发条件 | 涉及 Secret |
|---|---|---|
| `pr-quality-gate.yml` | PR 非草稿状态 | 无（只检查 PR 描述）|
| `ci.yml` | PR 创建/更新 | 无（只执行 lint/test）|
| `backend-deploy-aliyun.yml` | `develop` 分支 push | 测试服 .env、SSH 密钥 |

**安全原则**：

- GitHub Actions 中禁止使用 `${{ github.event.pull_request.body }}` 等不可信输入执行 shell
- 所有部署脚本使用 `set -euo pipefail` 失败即终止
- 生产部署**不通过 CI/CD 自动触发**，由运维人员手动执行，防止误操作

### 6.2 GitHub Actions Secret 管理

```
Settings → Secrets and variables → Actions

当前已配置的 Secrets（只记录名称，不记录值）：
  BACKEND_DOT_ENV          → 测试环境完整 .env 内容
  GH_TOKEN_ISSUES          → GitHub PAT（Issue 操作权限）
  （其他按需添加，每次在飞书群记录变更）
```

**规则**：
- Secret 值只有 GitHub 内部可见，任何人（包括 Admin）**不能在 UI 读取值**，只能覆盖
- 定期检查是否存在已废弃的 Secret（如旧凭证），及时删除

---

## 七、安全事件响应

### 7.1 事件分级

| 级别 | 描述 | 响应时限 |
|---|---|---|
| **P0 - 紧急** | 生产数据库泄露、SSH 密钥泄露、飞书 App Secret 泄露 | **立即（< 1 小时）** |
| **P1 - 严重** | GitHub 仓库被非授权访问、服务器被异常登录 | **< 4 小时** |
| **P2 - 重要** | 内部账号越权操作、高权限账号异常登录 | **< 24 小时** |
| **P3 - 一般** | 开发分支包含测试密钥、配置错误 | **< 72 小时** |

### 7.2 P0/P1 事件响应流程

```
发现事件
   │
   ▼
立即通知系统安全负责人（飞书电话/消息）
   │
   ▼
隔离受影响凭证/访问路径
   ├── SSH 密钥泄露 → 火山云控制台禁用密钥对 → 生成新密钥对
   ├── App Secret 泄露 → 飞书开放平台立即重置 App Secret
   ├── 数据库密码泄露 → 立即修改密码 + 断开现有连接
   └── GitHub 账号被盗 → 联系 GitHub Support + 撤销所有 Session
   │
   ▼
评估影响范围（哪些数据/系统受影响）
   │
   ▼
恢复服务（使用新凭证重新部署）
   │
   ▼
事后：在 24 小时内提交《安全事件复盘报告》到飞书开发小组群
```

### 7.3 密钥误提交处理

如发现密钥（任何类型）被提交到 Git 历史：

```bash
# Step 1：立即轮换被泄露的凭证（不要等待历史清理）
# Step 2：在飞书开发小组群告知全体成员
# Step 3：使用 git-filter-repo 清除历史（由仓库管理员执行）
pip install git-filter-repo
git filter-repo --path path/to/secret-file --invert-paths
# Step 4：强制推送清理后的历史（仅此情况允许 force push main）
# Step 5：通知所有协作者重新克隆仓库
```

**注意**：历史清理是亡羊补牢，**凭证轮换才是真正的止血措施**，必须优先执行。

---

## 八、审计与合规

### 8.1 审计日志不可篡改规则

`t_audit_log` 表适用以下强制约束：

- **禁止 DELETE 操作**（无论通过代码、Django admin 还是数据库直连）
- **禁止 UPDATE 操作**（审计日志一旦写入不可修改）
- 数据库层面建议设置 PostgreSQL Row-Level Security 阻止非 audit writer 角色的写删操作
- 审计日志保留期：**至少 5 年**（满足 GCP 监管要求）

### 8.2 定期安全审查计划

#### 月度审查（每月最后一个工作日，IT专员执行）

- [ ] 鹿鸣·治理台 SessionsPage：确认无 `requires_reauth=True` 红色告警长期未处理
- [ ] 检查 Celery Beat 飞书 Token 健康检查任务是否正常运行（每 6 小时）
- [ ] 检查服务器 `/opt/cn-kis-v2/` 是否有异常文件或进程
- [ ] GitHub Audit Log：查看是否有非预期的仓库设置变更

#### 季度审查（每季度末，技术总监主导）

- [ ] **GitHub 成员清单核查**：Collaborators 列表与实际在职人员对比，移除无效账号
- [ ] **服务器密钥持有人台账核查**：确认 .pem 持有人均在职且需要访问权限
- [ ] **高权限角色核查**：鹿鸣·治理台检查所有 L8+ 账号是否仍合理
- [ ] **GitHub Secrets 核查**：删除已废弃的 Secret
- [ ] **SSH 密钥轮换评估**：距上次轮换是否已超 6 个月
- [ ] **飞书 App Secret 有效性验证**：API 调用测试确认 3 套凭证均正常

#### 年度审查（每年 1 月，系统安全负责人主导）

- [ ] 全面权限矩阵审查（所有 35 种角色的权限覆盖是否仍与岗位匹配）
- [ ] 飞书 App Secret 主动轮换（3 套全部轮换）
- [ ] Django SECRET_KEY 轮换
- [ ] 更新本制度（版本号递增，记录变更历史）

---

## 九、开发者安全操作手册

### 9.1 日常开发安全规范

```bash
# ✅ 正确：使用 .env 注入密钥，不硬编码
FEISHU_APP_SECRET = os.environ.get('FEISHU_APP_SECRET_ZIJIN')

# ❌ 错误：硬编码 Secret
FEISHU_APP_SECRET = "vaNxAjUG5qyL4q5z3lkbtdfPCAyDK1gP"
```

```bash
# ✅ 正确：提交前检查
git status       # 确认 .env 未被 git add
git diff --cached | grep -i "secret\|password\|key"  # 检查暂存区是否含密钥关键词

# ✅ 正确：仅从 main 创建任务分支
git checkout main && git pull
git checkout -b feature/quality/231-rule-editor
```

### 9.2 本地 .env 安全

- 本地 `.env` 应与生产环境保持**不同密码**（测试数据库用独立密码）
- 本地 `.env` 只存放在工作电脑，不同步到任何个人云存储
- 离职时需自行删除本地 `.env` 并告知技术总监确认

### 9.3 生产服务器操作记录模板

每次 SSH 登录生产服务器执行操作后，在飞书开发小组群发送：

```
【服务器操作记录】
操作人：[姓名]
时间：[YYYY-MM-DD HH:MM]
操作内容：[简要描述，如 "部署 main 分支 abc123，执行数据库迁移 0015"]
影响服务：[如 gunicorn 重载 / nginx 重载 / 无影响]
操作结果：✅ 成功 / ❌ 失败（原因：）
```

---

## 十、制度变更记录

| 版本 | 日期 | 变更内容 | 变更人 |
|---|---|---|---|
| v1.0 | 2026-03-26 | 初版制定，覆盖代码库、服务器、密钥管理全域 | 技术总监 |

---

## 附录：快速参考卡

### 权限申请流程

```
需要 GitHub 仓库访问 → 向技术总监申请 → 通过飞书确认 → 仓库管理员在 GitHub 添加
需要 .pem 密钥 → 向系统安全负责人申请（必须说明必要性）→ 点对点传送
需要高权限角色（L5+）→ 直属上级在飞书确认 → IT专员在鹿鸣台分配
```

### 紧急联系

```
系统安全负责人（技术总监）：飞书直接@
仓库管理员：飞书直接@
安全事件上报群：CN_KIS_PLATFORM开发小组（chat_id: oc_cdfad80d9deb950414e8b4033f5ac1ff）
```

### 密钥轮换检查表

```
□ 已在飞书 开放平台 / 火山云 / GitHub 生成新凭证
□ 已更新服务器 .env（chmod 600 验证）
□ 已更新 GitHub Secrets
□ 已重载生产服务（kill -HUP gunicorn）
□ 已验证服务功能正常（健康检查接口 + 飞书登录测试）
□ 已在飞书开发小组群记录轮换完成（只记录时间和凭证名称，不记录值）
□ 已销毁旧凭证（飞书后台确认旧 Secret 已无效）
```
