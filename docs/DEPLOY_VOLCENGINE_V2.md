# CN KIS V2.0 火山云 ECS 一键部署

在仓库根目录（`cn_kis_v2.0/`）执行，与 V1 相比使用 **`workstations/<key>/`** 与 **`backend/configs/workstations.yaml`**。

## 前置条件

1. **Node / pnpm**：与各工作台开发一致。
2. **Python 3 + PyYAML**：健康检查脚本需要 `yaml` 模块（`pip install pyyaml` 若缺失）。
3. **本机配置文件（勿提交 Git）**  
   - 从 `deploy/secrets.env.example` 复制为 `deploy/secrets.env`，填写 `VOLCENGINE_SSH_HOST`、`VOLCENGINE_SSH_KEY` 或 `VOLCENGINE_SSH_PASS`。  
   - 从 `deploy/.env.volcengine.plan-a.example` 复制为 `deploy/.env.volcengine.plan-a`，填写飞书、ARK、Kimi、Redis 等（与 V1 `DEPLOY_TO_SERVER_GUIDE` 一致）。
4. **各工作台 `workstations/<key>/.env`**：部署前健康检查要求存在（可从 `.env.example` 复制并填写 `VITE_FEISHU_APP_ID` 等）。
5. **后端 `backend/.env`**：与 `deploy/.env.volcengine.plan-a` 中飞书主应用凭证应对齐，否则健康检查会报错。

## 一键命令

```bash
# 方式一：npm 脚本
pnpm run deploy:volcengine

# 方式二：显式环境变量（遗留 ECS 链路需手动开门）
ALLOW_LEGACY_SERVER_DEPLOY=true bash deploy/deploy_volcengine.sh
```

默认会禁用脚本，需 **`ALLOW_LEGACY_SERVER_DEPLOY=true`**（与 V1 策略一致：小程序默认走微信云托管）。

## 仅部署部分工作台

```bash
DEPLOY_WORKSTATIONS=secretary,research ALLOW_LEGACY_SERVER_DEPLOY=true bash deploy/deploy_volcengine.sh
```

## 方案质量检查台（Flask，`/protocol-qc/`）

V2 仓库根目录**不包含** `app.py`。若需一并部署方案检查台，请在本机检出 **cn_kis_v1.0**，并设置：

```bash
export PROTOCOL_QC_SOURCE_DIR=/绝对路径/cn_kis_v1.0
ALLOW_LEGACY_SERVER_DEPLOY=true bash deploy/deploy_volcengine.sh
```

该目录须包含：`app.py`、`qc_engine.py`、`pdf_parser.py`、`feedback_db.py`、`requirements.txt`、`templates/`、以及 `.cursor/skills` 下所需 skill（与 V1 部署脚本一致）。

未设置且 V2 根目录无上述文件时，脚本会**跳过** protocol-check 打包，远端 `/protocol-qc/` 不可用；冒烟测试不会因此失败。

## 部署后认证体检（Step 8）

脚本会调用 **`ops/scripts_v1/check_prod_auth_integrity.sh`**（若存在）。该脚本默认使用内置的 `SSH_KEY` 路径；请在本机通过环境变量覆盖，例如：

```bash
export SSH_KEY=/path/to/your.pem
export SSH_HOST=root@118.196.64.48
export BASE_URL=http://118.196.64.48
ALLOW_LEGACY_SERVER_DEPLOY=true bash deploy/deploy_volcengine.sh
```

若文件不存在，Step 8 会**跳过**并提示，不导致失败。

## 健康检查

```bash
python3 scripts/workstation_health_check.py
python3 scripts/workstation_health_check.py --only=research,secretary
```

部署脚本在 Step 0 会自动执行（未通过则中止）。

## 风险说明

- 远端会清空并重建 **`/opt/cn-kis`**（与 V1 相同），生产环境请谨慎并预留变更窗口。
- 数据库与迁移在服务端执行；V2 与 V1 模型差异需单独评估，本脚本不负责数据迁移方案。

## 相关文件

| 文件 | 说明 |
|------|------|
| `deploy/deploy_volcengine.sh` | 主脚本 |
| `deploy/nginx.conf` | Nginx 主配置 |
| `deploy/nginx-*.conf` | SSL 等辅助配置 |
| `scripts/workstation_health_check.py` | 部署前检查 |
| `backend/configs/workstations.yaml` | 工作台列表 |
