# CN KIS V2.0

> ChinaNORM 临床研究信息系统 — 第二代

**状态**：Wave 0 治理底座就绪，进入 Wave 1 认证权限迁移阶段。

---

## 系统简介

CN KIS V2.0 是 ChinaNORM 临床研究信息系统的第二代，基于 V1.0 的"复制式迁移 + 结构重构"建立。

- **不破坏原则**：`CN_KIS_V1.0` 完整封存，V2 不引用 V1 的任何运行时文件。
- **进化原则**：飞书认证、知识资产、权限模型、业务能力只增强，不退化。
- **协作原则**：统一 Cursor 规则、统一分支规范、统一 PR 门禁。

## 工作台（18 个）

| 类型 | 工作台 | 端口 |
|------|--------|------|
| 业务（15）| 秘书台 / 财务台 / 研究台 / 执行台 / 质量台 / 人事台 / 客户台 / 招募台 / 设备台 / 物料台 / 设施台 / 评估台 / 人员台 / 伦理台 / 接待台 | 3001–3016 |
| 平台（3）| 统管台 / 治理台 / 智能台 | 3017, 3008, 3018 |

## 架构简介

```
workstations/         前端工作台应用（各工作台独立）
packages/             稳定共享包（api-client, feishu-sdk）
backend/
  apps/
    identity/         飞书认证 + RBAC（Wave 1 核心）
    core_domains/     核心业务能力（protocol/visit/subject/edc/workorder）
    integrations/     外部适配器（飞书/LIMS/易快报）
    knowledge/        知识图谱与向量化
    orchestration/    AI 编排与技能执行
    governance/       审计、控制台
  configs/            工作台 SSOT（workstations.yaml）
ops/                  部署、运维脚本
docs/                 治理、架构、协作文档
```

## 快速开始

### 1. 新成员入组

请先阅读：

1. [`docs/V2_MIGRATION_CHARTER.md`](docs/V2_MIGRATION_CHARTER.md) — 迁移章程与四条红线
2. [`docs/TEAM_WORKFLOW.md`](docs/TEAM_WORKFLOW.md) — 团队协作规范
3. [`docs/CURSOR_COLLABORATION_ONBOARDING.md`](docs/CURSOR_COLLABORATION_ONBOARDING.md) — Cursor 协作入门

### 2. 克隆仓库

```bash
git clone git@github.com:china-norm-company/cn_kis_v2.0.git
cd cn_kis_v2.0
```

### 3. 创建工作分支

```bash
# 格式：feature/<workstation>-<描述> 或 fix/<workstation>-<描述>
git checkout -b feature/secretary-dashboard-improve
```

### 4. 环境配置

```bash
# 后端（测试环境用阿里云隔离配置）
cp backend/.env.example backend/.env
# 前端
cp workstations/secretary/.env.example workstations/secretary/.env
```

## 双环境策略

| 环境 | 地址 | 用途 |
|------|------|------|
| 本地 | localhost | 个人开发与本地测试 |
| 阿里云测试 | test-guide.data-infact.com | 集成测试、UAT、部署演练 |
| 火山云生产 | 118.196.64.48 | 正式生产、知识资产、飞书采集 |

> ⚠️ 测试环境绝不使用生产飞书凭证，绝不写入生产知识资产。详见 [`docs/V2_MIGRATION_CHARTER.md`](docs/V2_MIGRATION_CHARTER.md)。

## 迁移进度

- [x] Wave 0：治理底座（仓库结构、协作规则、SSOT、双环境规则）
- [ ] Wave 1：认证与权限底座（identity、FeishuUserToken、RBAC）
- [ ] Wave 2：API 壳与核心业务主干
- [ ] Wave 3：知识与原始数据平面
- [ ] Wave 4：企业扩展域
- [ ] Wave 5：AI、编排与治理台

## 关键文档

| 文档 | 描述 |
|------|------|
| [`docs/V2_MIGRATION_CHARTER.md`](docs/V2_MIGRATION_CHARTER.md) | **迁移章程（必读）** |
| [`docs/TEAM_WORKFLOW.md`](docs/TEAM_WORKFLOW.md) | 团队协作规范 |
| [`docs/CURSOR_COLLABORATION_ONBOARDING.md`](docs/CURSOR_COLLABORATION_ONBOARDING.md) | Cursor 入门 |
| [`docs/WORKSTATION_INDEPENDENCE.md`](docs/WORKSTATION_INDEPENDENCE.md) | 工作台独立性原则 |
| [`docs/DUAL_ENVIRONMENT_STRATEGY.md`](docs/DUAL_ENVIRONMENT_STRATEGY.md) | 双环境策略 |
| [`docs/TECHNICAL_STANDARDS.md`](docs/TECHNICAL_STANDARDS.md) | 技术规范 |
| [`backend/configs/workstations.yaml`](backend/configs/workstations.yaml) | 工作台 SSOT |

---

*本仓库受 `.cursor/rules/safety-and-git.mdc` 与 GitHub Branch Protection 双重保护。禁止直接推送 `main`。*
