# 鹿鸣·治理台 业务全景分析

> 版本：v2.0 | 生成日期：2026-03-22 | 状态：正式
>
> 飞书 App ID：`cli_a937515668b99cc9`（独立网页应用，与子衿完全解耦）
> 访问地址：`https://[域名]/governance`
>
> **历史说明**：本文档原为「鹿鸣·治理台（iam）」全景分析。V2.0 重构将
> `鹿鸣·治理台（admin）` 与 `旧权控台（iam）` 合并为唯一治理工作台
> `governance`（对外名称：鹿鸣·治理台），沿用 IAM 的独立飞书应用与安全能力。

---

## 一、工作台定位

### 1.1 存在意义

**鹿鸣·治理台**是 CN KIS V2.0 系统中**最高优先级的安全基础设施工作台**。

在 V1.0 中，用户权限管理被内置于子衿·秘书台，导致两个根本性问题：

| 问题 | 影响 |
|---|---|
| 安全依附：身份认证与业务功能耦合 | 子衿故障时，整个账号体系无法维护 |
| 权限不透明：权限码散落在代码中 | 无法对"谁能做什么"进行可视化审查 |
| 监控缺失：Token 失效无预警 | 飞书 Token 过期导致多人被迫重新登录 |
| 合规盲区：无结构化操作审计 | 无法满足 GCP / 21 CFR Part 11 审计要求 |

**鹿鸣·治理台的核心使命**：作为独立的身份与访问管理（IAM）中枢，为 CN KIS 的 20 个工作台、35 种角色、100+ 个权限码，以及所有飞书 Token 提供**统一的可视化治理与持续监控**能力。

### 1.2 在系统生态中的位置

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CN KIS V2.0 系统生态                          │
│                                                                       │
│  业务工作台层（15 台）                                                 │
│  子衿 | 采苓 | 维周 | 怀瑾 | 管仲 | 时雨 | 进思 | 招招               │
│  器衡 | 度支 | 坤元 | 衡技 | 共济 | 御史 | 和序                       │
│                         ▼ 依赖                                        │
├──────────────────────────────────────────────────┬──────────────────┤
│           平台工作台层                            │   平台工作台层    │
│   天工·统管台（IT运维）                           │ 中书·智能台(AI)  │
│   鹿鸣·治理台（系统管理员专用）                   │                  │
├──────────────────────────────────────────────────┴──────────────────┤
│                                                                       │
│   ┌─────────────────────────┐   ┌──────────────────────────────┐   │
│   │    鹿鸣·治理台（IAM）    │   │      洞明·数据台              │   │
│   │  独立飞书 App 认证        │   │     独立飞书 App 认证          │   │
│   │  用户·角色·权限·会话治理  │   │   数据资产·血缘·质量治理       │   │
│   └──────────┬──────────────┘   └──────────────────────────────┘   │
│              │ 为全体工作台提供安全基础                               │
├──────────────▼───────────────────────────────────────────────────── ┤
│          认证底座（identity / audit / FeishuUserToken）               │
└─────────────────────────────────────────────────────────────────────┘
```

> **关键区别**：  
> - **鹿鸣·治理台**（admin，端口 3008）：面向系统管理员的低频高权限操作面板，含直接的账号创建/删除  
> - **鹿鸣·治理台**（iam，端口 3019）：面向 IT 专员、数据经理的日常**持续监控**工作台，聚焦于可观测性、健康诊断、使用分析

---

## 二、服务对象与角色

### 2.1 主要用户角色

| 角色 | 级别 | 主要诉求 |
|---|---|---|
| `superadmin`（超级管理员）| L10 | 全局角色授权、系统级配置变更 |
| `admin`（系统管理员）| L10 | 用户生命周期管理、角色分配、权限审查 |
| `it_specialist`（IT专员）| L4 | 日常 Token 健康巡检、会话异常处理 |
| `data_manager`（数据经理）| L6 | 了解系统内哪些数据对谁可见，审查数据权限配置 |
| `general_manager`（总经理）| L8 | 高层只读审阅：谁在系统中、登录频率、AI 使用情况 |
| `tech_director`（技术总监）| L8 | 监控平台整体健康度，AI 推理通道状态 |

### 2.2 不应通过鹿鸣操作的角色

鹿鸣·治理台不向 CRC、QA、财务等业务角色开放。这些用户在各自的业务工作台内使用系统，无需感知底层权限机制。

---

## 三、业务全景：七大功能域

### 3.1 用户全生命周期管理

**业务背景**：CN KIS 的所有用户通过**飞书 OAuth** 认证登录，账号在首次登录时自动创建（`Account` 表），角色由系统管理员按职责分配。

**覆盖的数据实体**：
- `t_account`：用户基础信息（用户名、显示名、邮箱、飞书 open_id、头像）
- `t_account_role`：账号-角色关联（支持全局角色 + 项目级角色）

**鹿鸣提供的能力**：

| 功能 | API | 页面 |
|---|---|---|
| 账号列表（含角色、最后登录时间）| `GET /auth/accounts/list` | UsersPage |
| 账号详情 | `GET /auth/accounts/{id}` | UsersPage |
| 为账号分配角色 | `POST /auth/roles/assign` | UsersPage |
| 撤销账号角色 | `POST /auth/roles/revoke` | UsersPage |

**关键业务规则**：
- 任何用户角色变更均被 `t_audit_log` 记录（`action=UPDATE`，`resource_type=account`）
- 一个账号可同时持有多个角色（通过 `AccountRole` 多对多关联）
- `viewer`（L1）是默认兜底角色，FEISHU_DEFAULT_ROLE 配置

---

### 3.2 角色-权限矩阵治理

**业务背景**：系统共有 **35 种角色**，分布在 L1-L10 五个权限层级，覆盖管理层、技术层、运营层、职能层、外部访问层。每个角色关联 1-N 个权限码（格式：`module.function.action`）。

**覆盖的数据实体**：
- `t_role`：角色定义（名称、显示名、级别、类别、工作台范围、是否系统内置）
- `t_permission`：权限码三元组（module + function + action，scope 作用域）
- `t_account_role`：账号-角色映射

**系统角色层级全景**：

```
L10  superadmin / admin
      └─ ['*']（全部权限，含所有 20 个工作台）

L8   general_manager / project_director / sales_director
      tech_director / research_director
      └─ 跨域权限，多工作台访问，关键审批权限

L6   project_manager / quality_manager / finance_manager
      hr_manager / research_manager / data_manager / recruitment_manager / sales_manager
      └─ 域管理权限，特定工作台全权限

L5   crc_supervisor / scheduler / customer_success / researcher
      └─ 专业执行 + 部分审批

L4   crc / clinical_executor / technician / evaluator
      receptionist / recruiter / sales / finance / qa / hr / lab_personnel
      it_specialist / data_analyst
      └─ 具体操作权限，数据录入/执行层

L3   （同L4部分）

L1   viewer / subject_self
      └─ 只读或自助访问
```

**鹿鸣的核心价值**：将以上所有角色及其权限覆盖范围**可视化**，使管理员可以快速回答：
> "研究经理（research_manager）能访问哪些工作台？能做什么操作？"

---

### 3.3 会话与 Token 健康监控

**业务背景**：这是鹿鸣·治理台的 Token 监控能力（与洞明协作的差异化）最重要的差异化能力。

CN KIS 存在两种 Token：

| Token 类型 | 寿命 | 存储位置 | 风险 |
|---|---|---|---|
| **JWT 会话 Token** | 配置决定（一般 24h-7d） | `t_session_token`（哈希存储） | 多设备登录冲突、会话劫持 |
| **飞书 access_token** | **2 小时** | `t_feishu_user_token` | 2h 后采集停止 |
| **飞书 refresh_token** | **30 天（滚动续期）** | `t_feishu_user_token` | 30 天未刷新则需重新授权 |

**V2 已实现的保护机制**（鹿鸣治理台负责监控其效果）：
- **提前 1 小时**刷新 access_token（防止大批量采集中断）
- **7 天内主动续期** refresh_token
- Celery Beat 每 6 小时运行 token 健康检查任务
- `_save_feishu_user_token` 严禁用空值覆盖有效 refresh_token

**鹿鸣监控面板数据模型**：

```
FeishuUserToken（每个账号一条）
├── account_id           → 关联账号
├── access_token         → 飞书 API 调用凭证（2h）
├── refresh_token        → 续期凭证（30天滚动，绝不可为空）
├── expires_at           → access_token 过期时间
├── refresh_expires_at   → refresh_token 过期时间（NEVER NULL）
├── issuer_app_id        → 签发应用（子衿/鹿鸣/洞明）
├── granted_capabilities → 已授权能力（mail/im/calendar/task）
├── requires_reauth      → 是否需要重新授权
├── last_preflight_at    → 最后一次健康检查时间
└── last_error_code      → 最后错误码（用于诊断）
```

**健康状态判断逻辑**：
- `is_healthy = refresh_token 非空 AND refresh_expires_at > now`
- `days_until_refresh_expires < 7` → 预警（橙色）
- `requires_reauth = True` → 告警（红色），需通知用户重新登录

---

### 3.4 登录活动监控

**业务背景**：GCP 要求对系统访问进行完整记录。每次飞书 OAuth 成功登录均会写入 `t_audit_log`（action=LOGIN）。

**可分析的维度**：
- 登录时间分布（工作日 vs 周末、深夜异常登录）
- 登录用户分布（哪些账号活跃）
- 工作台登录来源（从哪个工作台完成 OAuth）

**鹿鸣提供**：

| 功能 | API |
|---|---|
| 全量登录日志（分页、过滤） | `GET /audit/logs?action=LOGIN` |
| 账号维度登录历史 | `GET /audit/logs?account_id={id}&action=LOGIN` |
| 审计日志导出 | `GET /audit/logs/export` |

---

### 3.5 操作审计日志

**业务背景**：符合 GCP / 21 CFR Part 11 标准，`t_audit_log` 记录所有数据变更操作，**不可删除、不可修改**。

**审计动作类型**：

| 动作 | 含义 | 合规要求 |
|---|---|---|
| `CREATE` | 创建记录 | 记录操作者和初始值 |
| `UPDATE` | 修改记录 | 记录修改前后值（changed_fields） |
| `DELETE` | 删除记录 | 记录删除前完整快照 |
| `LOGIN` | 用户登录 | 记录登录时间和来源 |
| `LOGOUT` | 用户登出 | 记录登出时间 |
| `APPROVE` | 审批通过 | 记录审批人和审批时间 |
| `REJECT` | 审批拒绝 | 记录拒绝原因 |
| `SIGN` | 电子签名 | 21 CFR Part 11 合规签名 |
| `EXPORT` | 数据导出 | 记录导出内容和导出人 |
| `VIEW` | 敏感记录查看 | 用于受试者隐私保护场景 |

**鹿鸣的审计覆盖范围**：
- 账号权限变更（角色分配/撤销）
- 系统配置修改
- 知识资产写保护开关操作
- Token 手动干预

---

### 3.6 功能使用分析

**业务背景**：了解各工作台的使用频率，判断哪些功能被高频使用、哪些长期闲置，为系统优化和资源投入提供数据依据。

**当前状态**（Wave 4 之前）：  
系统已有 20 个工作台的静态清单。精细的功能点击率、停留时长统计需前端埋点 SDK 接入后采集。

**已可统计的代理指标**：
- `t_audit_log` 按 `resource_type` 聚合 → 哪类业务操作最频繁
- `t_session_token` 按账号统计 → 哪些用户最活跃
- `t_feishu_user_token.granted_capabilities` → 每个用户实际使用的飞书功能范围

**鹿鸣规划能力**（Wave 4）：
- 前端操作事件上报（工作台 + 页面 + 操作类型 + 耗时）
- 用户行为热图（哪些页面访问最多）
- 功能弃用识别（某功能 30 天零使用 → 建议下线或优化）

---

### 3.7 AI 使用监控

**业务背景**：CN KIS 已接入多个 AI 推理通道：字节方舟（ARK）、Kimi、Jina v3（向量化）。随着中书·智能台推进 Wave 5，AI 调用量将成为重要的成本和性能指标。

**鹿鸣当前提供**：
- 推理通道注册状态（`/agents/providers`）
- 已注册智能体列表（`/agents/list`）
- 通道回退监控（`/agents/fallback/metrics`）

**鹿鸣规划能力**（Wave 5）：
- 按账号统计 AI 对话次数（`t_agent_chat_call` 聚合）
- Token 消耗量与费用估算（ARK/Kimi API 费率）
- 智能体使用分布（哪些业务场景使用 AI 最频繁）
- 异常调用告警（单用户短时大量调用）

---

## 四、数据架构

### 4.1 鹿鸣·治理台读写的核心数据表

```
┌─────────────────────────────────────────────────────────┐
│                   鹿鸣数据访问边界                         │
│                                                           │
│  ○ 读写（有限写入）                                        │
│    t_account          用户基础信息                         │
│    t_account_role     角色分配（assign/revoke）            │
│    t_session_token    会话管理（吊销）                     │
│                                                           │
│  ○ 只读（监控/审查）                                       │
│    t_role             角色定义（seed_roles 初始化）        │
│    t_permission       权限码（seed_roles 初始化）          │
│    t_feishu_user_token Token 健康状态                     │
│    t_audit_log        操作审计日志（不可修改）             │
│                                                           │
│  ○ 聚合统计                                               │
│    t_agent_*          AI 使用情况                         │
│    t_personal_context 飞书采集完整度                      │
└─────────────────────────────────────────────────────────┘
```

### 4.2 与其他工作台的数据关系

```
鹿鸣 ←──写入角色──→ 全部 20 个工作台
          │
          ▼
   (所有工作台依赖 RBAC 鉴权)
   
鹿鸣 ←──读取日志──→ t_audit_log
                      ↑ 由全部工作台写入

鹿鸣 ←──监控 Token──→ FeishuUserToken
                        ↑ 子衿/采苓/维周等飞书数据采集依赖
```

---

## 五、业务流程场景

### 场景 A：新员工入职授权

```
新员工首次飞书登录 → 账号自动创建（默认 viewer 角色）
        │
        ▼
IT专员登录鹿鸣 → UsersPage 搜索到该账号
        │
        ▼
为账号分配角色（如 crc，L3）→ POST /auth/roles/assign
        │
        ▼
系统写入 t_account_role → 写入 t_audit_log（action=UPDATE）
        │
        ▼
员工重新登录 → 获得 crc 角色对应的工作台权限（execution/reception）
```

### 场景 B：飞书 Token 健康告警

```
Celery Beat（每 6 小时）→ batch_refresh_tokens 任务
        │
        ▼
扫描所有 FeishuUserToken → 识别 refresh_expires_at < now + 7d
        │
        ├── 可刷新：调用飞书 API 获取新 token，滚动续期
        │          → 写入新 access_token + refresh_token
        │
        └── 不可刷新（用户长期未登录）：
               → requires_reauth = True
               → 通过飞书消息推送授权提醒
        │
        ▼
鹿鸣·SessionsPage 显示 requires_reauth=True 账号（红色告警）
IT专员主动联系该用户重新登录
```

### 场景 C：权限合规审查

```
年度合规审查（GCP 要求）→ 审计人员登录鹿鸣
        │
        ▼
AuditPage → 按时间段导出所有 APPROVE/SIGN 操作记录
        │
        ▼
PermissionsPage → 验证研究角色的权限配置是否符合 21 CFR 11 最小权限原则
        │
        ▼
RolesPage → 核查高权限角色（L8+）的持有人列表
        │
        ▼
导出审计报告 → 提交给内外部审计机构
```

---

## 六、与鹿鸣·治理台的边界划分

| 操作 | 鹿鸣·治理台（admin） | 鹿鸣·治理台（iam） |
|---|---|---|
| 受众 | 系统管理员（superadmin/admin 专用） | IT专员、数据经理、总监 |
| 账号创建 | ✅（直接创建内部账号） | ❌（账号由飞书 OAuth 自动创建） |
| 角色分配 | ✅（全部角色） | ✅（在权限范围内） |
| 权限码管理 | ✅（定义新权限码） | 只读查看 |
| Token 监控 | ❌ | ✅（核心功能） |
| 登录活动审计 | 基础查看 | ✅（深度分析） |
| AI 使用监控 | ❌ | ✅ |
| 使用频率分析 | ❌ | ✅（Wave 4） |
| 访问频率 | 低频（配置变更时） | **高频（日常巡检）** |

---

## 七、OAuth 独立架构

鹿鸣·治理台使用独立的飞书网页应用，与子衿完全解耦：

```
┌─────────────────────────────────────────────┐
│       鹿鸣·治理台 OAuth 独立架构             │
│                                             │
│  飞书网页应用：鹿鸣                          │
│  App ID：cli_a937515668b99cc9               │
│  App Secret：vaNxAjUG5qyL4q5z3lkbtdfPCAyDK1gP │
│                                             │
│  Callback URL：/v2/api/v1/auth/feishu/callback?workstation=iam │
│  Backend 处理：FEISHU_APP_ID_IAM            │
│  ──────────────────────────────────────     │
│  ✅ 子衿故障 → 鹿鸣不受影响                  │
│  ✅ 鹿鸣故障 → 子衿不受影响                  │
│  ✅ 独立 Token 签发追踪（issuer_app_id）     │
└─────────────────────────────────────────────┘
```

**设计原则**：安全管理基础设施不可依赖于它所管理的业务系统。

---

## 八、当前功能完成度

| 功能页面 | 状态 | 说明 |
|---|---|---|
| DashboardPage（驾驶舱）| ✅ 已接入真实数据 | 账号总数、活跃会话、今日登录、Token告警 |
| UsersPage（用户管理）| ✅ 已接入真实数据 | 分页列表、搜索、角色展示 |
| SessionsPage（会话健康）| ✅ 已接入真实数据 | Token 健康状态、剩余天数、告警分级 |
| RolesPage（角色管理）| ✅ 已接入真实数据 | 工作台分组、角色详情面板 |
| PermissionsPage（权限矩阵）| ✅ 已接入真实数据 | 按模块分组、权限码搜索 |
| AuditPage（审计日志）| ✅ 已接入真实数据 | 操作日志、按 action 筛选、分页 |
| ActivityPage（登录活动）| ✅ 已接入真实数据 | 登录记录专项视图 |
| FeatureUsagePage（功能分析）| 🟡 框架已就绪 | 需前端埋点 SDK（Wave 4） |
| AiUsagePage（AI监控）| ✅ 基础数据可用 | 通道状态+智能体列表；精细用量 Wave 5 |

---

## 九、未来演进路径

| 阶段 | 内容 |
|---|---|
| Wave 4（数字化员工）| 接入前端埋点 SDK，实现功能使用热图和弃用识别 |
| Wave 5（AI治理）| AI Token 消耗统计、费用分摊、异常告警 |
| 长期规划 | 与 HR 工作台打通：员工离职自动触发账号冻结流程 |
| 长期规划 | 风险评分模型：基于登录模式、操作频率识别内部安全风险 |
| 长期规划 | SAML/SSO 扩展：支持第三方企业身份提供商接入 |
