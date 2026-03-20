# CONTRIBUTING — CN KIS V2.0

## 开始贡献

1. 阅读 [`docs/V2_MIGRATION_CHARTER.md`](docs/V2_MIGRATION_CHARTER.md)（四条红线，必读）
2. 阅读 [`docs/TEAM_WORKFLOW.md`](docs/TEAM_WORKFLOW.md)（分支规范、PR 流程）
3. Fork 或直接在仓库内创建分支（已有权限的成员）

## 分支命名

```
feature/<workstation>-<描述>     功能开发
fix/<workstation>-<描述>         Bug 修复
wave/<wave-number>-<描述>        迁移波次
chore/<描述>                     构建/配置/文档
hotfix/<描述>                    紧急修复
```

## PR 规范

- 必须填写完整的 PR 模板（`.github/PULL_REQUEST_TEMPLATE.md`）
- 必须通过 `PR Quality Gate` CI 检查
- 必须至少 1 位成员 Approve
- 涉及认证/权限/知识资产域：需额外勾选红线合规声明

## 代码规范

- 后端遵循 Django 规范，API 使用 Django Ninja
- API 响应格式：`{code, msg, data}`
- 表名格式：`{DB_PREFIX}_{entity}`（如 `t_protocol`）
- Schema：`XxxIn` / `XxxOut`
- 模块结构：`api.py` + `services/` + `models.py`

## 提交消息格式

```
<type>(<workstation>): <描述>

type: feat | fix | docs | chore | refactor | test | wave
```

示例：
- `feat(research): 方案列表加状态筛选`
- `fix(finance): 修复发票金额精度问题`
- `wave(identity): Wave 1 迁移飞书 OAuth 核心逻辑`

## 环境配置

```bash
cp backend/.env.example backend/.env
# 填写本地开发配置（SQLite 模式：USE_SQLITE=true）
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 8001
```
