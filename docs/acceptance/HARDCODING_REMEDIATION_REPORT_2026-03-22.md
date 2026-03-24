# 硬编码全面整改验收报告

> 版本：1.0 | 执行日期：2026-03-22 | 状态：整改完成，待运行时验收

---

## 1. 整改背景

本次整改由 GitNexus 配置审计触发，扫描发现系统存在三类硬编码风险：

1. **安全类**：API Token 明文写死在源代码中，已进入 git 历史
2. **规范类**：违反 `.cursor/rules/embedding-governance.mdc` 的降级逻辑仍在运行
3. **配置类**：全局常量已定义但代码绕过读取，导致配置变更不生效

---

## 2. 已修复问题清单

### P0 — 安全与规范红线

| 编号 | 问题 | 修复位置 | 修复方式 |
|---|---|---|---|
| HC-01 | `QWEN_API_TOKEN` 明文硬编码（`7ed12a89-fe21-4ed1-9616-1f6f27e64637`） | `tasks.py`、`vectorize_all_entries.py`、`priority_vectorize_entries.py` | 统一改为 `settings.QWEN3_EMBEDDING_KEY` |
| HC-02 | `QWEN_EMBEDDING_URL` 变量名与 settings 不一致（`QWEN3_EMBEDDING_URL`） | 同上三文件 | 统一改为 `settings.QWEN3_EMBEDDING_URL` |
| HC-03 | `KNOWLEDGE_EMBEDDING_STRATEGY` 读取违反 embedding-governance 规范 | `tasks.py:252` | 删除读取逻辑，直接走 qwen3 唯一路径 |
| HC-04 | `_get_embedding()` 失败时返回 `None` 而非抛出异常 | `tasks.py` | 改为 `raise RuntimeError()`，符合治理规范 |

### P1 — 认证与功能

| 编号 | 问题 | 修复位置 | 修复方式 |
|---|---|---|---|
| HC-05 | 前端 SDK fallback App ID 为 V1 旧 ID `cli_a907f21f0723dbce` | `packages/feishu-sdk/src/config.ts:7` | 更正为子衿 `cli_a98b0babd020500e` |
| HC-06 | 两个工作台 `.env.example` 中 App ID 为 V1 旧值 | `digital-workforce/.env.example`、`control-plane/.env.example` | 更正为子衿 App ID |
| HC-07 | `SITE_URL` 未在 `settings.py` 定义，飞书推送默认跳转裸 IP | `proactive_push_service.py:31` | 在 settings 定义 `SITE_URL`，空值时 `raise ImproperlyConfigured` |
| HC-08 | `FEISHU_REDIRECT_BASE` 分散在 3 处各自 fallback 硬编码 IP | `identity/services.py`、`secretary/tasks.py`、`batch_refresh_tokens.py` | settings 集中定义，三处统一读 `settings.FEISHU_REDIRECT_BASE` |
| HC-09 | `data-platform` 三页面绕过 api-client，各自硬编码 `/v2/api/v1` | `ExternalIntakePage.tsx`、`QualityPage.tsx`、`LineagePage.tsx` | 补充 api-client 端点，三页面改用 `dataPlatformApi` |

### P2 — 配置标准化

| 编号 | 问题 | 修复位置 | 修复方式 |
|---|---|---|---|
| HC-10 | `rebuild_embeddings.py` 中向量维度魔法数字 `1024` | `rebuild_embeddings.py:84` | 引用 `EMBEDDING_DIMENSION` 常量 |
| HC-11 | API 响应码 `code=0` vs `code=200` 双轨无文档说明 | `packages/api-client/src/client.ts` | 添加 `TODO[api-code-unify]` 注释，明确技术债 |
| HC-12 | `DB_PREFIX` 定义但从未被消费（80+ 模型硬编码表名） | `backend/settings.py` | 添加弃用注释，避免误操作 |
| HC-13 | 工作台 key 字符串散布在业务 if/elif 链中（6 文件） | `digital_workforce_api.py`、`qrcode/services.py`、`todo_service.py` | 新建 `apps/core/workstation_keys.py` 常量模块，迁移引用 |
| HC-14 | `PersonalContext.source_type` 无 Enum，20+ 处散乱字符串 | `secretary/models.py` | 添加 `PersonalContextSourceType(TextChoices)` |

---

## 3. 新增配置项（运维必读）

以下配置项在本次整改中**首次在 settings 正式定义**，部署时必须在 `.env` 中显式配置：

| 环境变量 | 作用 | 默认值 | 是否生产必填 |
|---|---|---|---|
| `SITE_URL` | 飞书推送卡片跳转链接基准域名 | `''`（空）| **必填**，空值时系统拒绝启动推送功能 |
| `FEISHU_REDIRECT_BASE` | OAuth 回调 redirect_uri 前缀 | `http://118.196.64.48` | 强烈建议配置为 HTTPS 域名 |
| `QWEN3_EMBEDDING_KEY` | Qwen3 内网 embedding 服务 Token | `''`（空）| **必填**，空值时向量化任务将失败 |
| `QWEN3_EMBEDDING_URL` | Qwen3 内网 embedding 服务地址 | 公网穿透地址 | 内网环境建议改为直连 `http://10.0.12.30:18099/...` |

---

## 4. 整改后验收检查点（HC 验收矩阵）

### 4.1 静态代码验证（可脚本化）

| AC# | 验收项 | 验证命令 | 期望结果 |
|---|---|---|---|
| HC-AC-01 | 旧 API Token 不在源代码中 | `grep -r "7ed12a89-fe21-4ed1" backend/` | 零匹配 |
| HC-AC-02 | `KNOWLEDGE_EMBEDDING_STRATEGY` 不在代码中读取 | `grep -r "KNOWLEDGE_EMBEDDING_STRATEGY" backend/apps/` | 零匹配 |
| HC-AC-03 | V1 旧 App ID 不在 .env.example 中 | `grep -r "cli_a907f21f0723dbce" workstations/` | 零匹配（非 SDK 配置外） |
| HC-AC-04 | `QWEN_API_TOKEN` 旧变量名不在生产代码中 | `grep -r "QWEN_API_TOKEN" backend/apps/` | 零匹配 |
| HC-AC-05 | `get_embedding` 不返回 None | `grep -n "return None" backend/apps/knowledge/tasks.py` | 仅 `_store_embedding` 中存在，`_get_embedding` 中无 |

### 4.2 运行时配置验证（Python shell）

```python
# 在生产服务器执行
from django.conf import settings

assert settings.SITE_URL, "SITE_URL 未配置"
assert settings.FEISHU_REDIRECT_BASE, "FEISHU_REDIRECT_BASE 未配置"
assert settings.QWEN3_EMBEDDING_KEY, "QWEN3_EMBEDDING_KEY 未配置"
assert settings.QWEN3_EMBEDDING_URL, "QWEN3_EMBEDDING_URL 未配置"
print("✅ 所有关键配置项已就位")

# 验证 workstation_keys 模块可导入
from apps.core.workstation_keys import ALL_WORKSTATIONS, WS_FINANCE
assert len(ALL_WORKSTATIONS) == 19, f"工作台数量异常: {len(ALL_WORKSTATIONS)}"
print("✅ workstation_keys 模块正常")

# 验证 PersonalContextSourceType 可用
from apps.secretary.models import PersonalContextSourceType
assert PersonalContextSourceType.MAIL == 'mail'
assert PersonalContextSourceType.IM == 'im'
print("✅ PersonalContextSourceType 枚举正常")
```

### 4.3 向量化服务验证

```bash
# 在服务器执行
cd /opt/cn-kis-v2/backend
source venv/bin/activate
python manage.py rebuild_embeddings --dry-run
# 期望：输出 "Qwen3 服务连通" + 维度=1024，无 "api token" 报错
```

### 4.4 飞书推送链接验证

| 验证项 | 期望 |
|---|---|
| 主动洞察推送中的跳转 URL | 包含 `SITE_URL` 配置的域名，而非裸 IP |
| OAuth 回调 redirect_uri | 与飞书后台配置一致，来自 `settings.FEISHU_REDIRECT_BASE` |

### 4.5 前端 API 请求验证（浏览器 DevTools）

| 工作台页面 | 验证项 | 期望 |
|---|---|---|
| 洞明·数据台 > ExternalIntake | Network 请求 | 走 `/v2/api/v1/data-platform/intake-overview`，无重复 `API_BASE` 变量 |
| 洞明·数据台 > Quality | Network 请求 | 走 `/v2/api/v1/quality/data-quality/rules` |
| 洞明·数据台 > Lineage | Network 请求 | 走 `/v2/api/v1/protocol/list` |

---

## 5. 遗留技术债（已记录，计划迁移）

| 编号 | 技术债 | 标记位置 | 建议处理时间 |
|---|---|---|---|
| TD-01 | `DB_PREFIX` 配置死代码，80+ 模型硬编码表名 | `settings.py` 注释 | Wave 5 表结构重构时处理 |
| TD-02 | API 响应码 `code=0` vs `code=200` 双轨 | `api-client/src/client.ts` `TODO[api-code-unify]` | 待旧接口逐步迁移 |
| TD-03 | `PersonalContext.source_type` 调用方仍有 20+ 处字符串字面量 | 各采集脚本 | 可分批迁移至 `PersonalContextSourceType.MAIL` 等 |
| TD-04 | `TODO[vec-2048]` 向量维度升级 | `tasks.py`、`rebuild_embeddings.py` | 待内网 Qwen3-embedding-2048 就绪 |

---

## 6. 关联文档

- [V2 迁移章程](../V2_MIGRATION_CHARTER.md) — 认证红线规范
- [embedding-governance 规范](`../../.cursor/rules/embedding-governance.mdc`) — 向量化治理规则
- [feishu-token-persistence 规范](`../../.cursor/rules/feishu-token-persistence.mdc`) — Token 持久化规范
- [V2 验收追溯矩阵](V2_ACCEPTANCE_TRACEABILITY_MATRIX.md) — 整体验收矩阵
- [V2 验收测试报告 2026-03-22](../V2_ACCEPTANCE_TEST_REPORT_2026-03-22.md) — 最新测试执行报告
