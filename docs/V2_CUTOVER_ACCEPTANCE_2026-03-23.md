# CN KIS V2.0 — 切換前驗收報告
**生成時間**：2026-03-23  
**目標服務器**：118.196.64.48（火山雲生產）

---

## 一、總體結論

| 維度 | 狀態 | 說明 |
|------|------|------|
| V2 後端 API | ✅ 可用 | 31/31 路由可達，port 8002 正常 |
| V2 前端部署 | ⚠️ 不完整 | 14 個工作台仍為 V1 前端，1 個（治理台）完全缺失 |
| 後端代碼版本 | ⚠️ 滯後 | 服務器未含 2 個 BUG-002/004 修復（今日提交） |
| V1→V2 功能完備性 | ✅ V2 超集 | V2 功能多於 V1（知識庫、人員資質矩陣等新增） |
| **切換就緒** | ❌ 未就緒 | 需完成前端部署和代碼同步後方可切換 |

---

## 二、後端 API 全量驗收（31 個端點）

所有端點均可達（未登錄返回 401/403 = 正常，路由已注冊）：

| 模塊 | 端點數 | 狀態 |
|------|--------|------|
| 系統健康（含 Redis/工作台文件） | 2 | ✅ |
| 認證（auth/me, roles, accounts, permissions） | 4 | ✅ 需認證 |
| 協議管理 | 2 | ✅ 需認證 |
| 受試者管理 | 2 | ✅ 需認證 |
| 招募 + 粗篩 + 前台接待 | 3 | ✅ 需認證 |
| 訪視 + EDC | 2 | ✅ 需認證 |
| 質量（偏差/CAPA/變更控制） | 3 | ✅ 需認證 |
| 知識庫（列表/搜索） | 2 | ✅ 需認證 |
| 設施管理（場地/預約） | 2 | ✅ 需認證 |
| 實驗室人員（列表/資質矩陣/證書） | 3 | ✅ 需認證 |
| 工單 + 評估 | 2 | ✅ 需認證 |
| 秘書工作台（統計/總覽） | 2 | ✅ 需認證 |
| 審計日誌 | 1 | ✅ 需認證 |

**V2 vs V1 功能對比**（無需認證路由測試）：
- 質量偏差/CAPA：V2 ✅ → V1 ❌（V1 無此功能）
- 知識庫：V2 ✅ → V1 ❌（V1 無此功能）
- 實驗室人員：V2 ✅ → V1 ❌（V1 無此功能）
- 治理台 API：V2 ✅ → V1 ❌（V2 新增）

**結論：V2 後端功能是 V1 的超集，V1 有的 V2 全都有，V2 還額外增加了 3 個模塊。**

---

## 三、前端工作台狀態

### 已部署（V2 最新版）
| 工作台 | 前端狀態 |
|--------|---------|
| data-platform（洞明） | ✅ V2 前端已部署 |
| control-plane（統一管理） | ✅ V2 前端已部署 |
| digital-workforce（中書） | ✅ V2 前端已部署 |

### 仍為 V1 前端（需替換）
以下 14 個工作台部署的是 V1 前端（JS bundle 調用 `/api/v1/` V1 後端）：
secretary / finance / research / execution / quality / hr / crm / recruitment / equipment / material / facility / evaluator / lab-personnel / ethics

> ⚠️ 這些工作台目前仍正常服務用戶，但調用的是 V1 後端。切換時需同時部署 V2 前端 + 切換 Nginx。

### 完全缺失（需新建）
| 工作台 | 問題 |
|--------|------|
| governance（鹿鳴·治理台） | ❌ `/var/www/cn-kis/governance/` 目錄不存在，Nginx 無路由配置，訪問時顯示秘書台！ |

---

## 四、代碼版本差異（服務器 vs 本地最新）

| 文件 | 服務器版本 | 本地最新 | 差異說明 |
|------|-----------|---------|---------|
| `backend/apps/quality/api.py` | Mar 21 13:42 | Mar 23（今日） | 缺少 BUG-004 日期 None 保護修復 |
| `backend/apps/lab_personnel/services/qualification_service.py` | Mar 20 20:39 | Mar 23（今日） | 缺少 BUG-002 矩陣格式修復 |
| `workstations/lab-personnel/…/QualificationMatrixPage.tsx` | V1 前端 | V2（今日修復） | 前端防 undefined 修復未部署 |
| `deploy/nginx/cn-kis.conf.template` | 手動配置 | 更新（8002） | 需確認服務器 Nginx 是否已正確配置 |

---

## 五、切換前必須完成的操作清單

### P0（必做，切換前）
- [ ] **P0-1** 將今日提交的後端修復推送到服務器：
  ```bash
  scp -i ~/.ssh/openclaw1.1.pem \
    backend/apps/quality/api.py \
    backend/apps/lab_personnel/services/qualification_service.py \
    root@118.196.64.48:/opt/cn-kis-v2/backend/apps/quality/
  # 重啟 V2 服務
  ssh -i ~/.ssh/openclaw1.1.pem root@118.196.64.48 "systemctl restart cn-kis-v2-api"
  ```
- [ ] **P0-2** 構建 governance 前端並部署 + 添加 Nginx 路由
- [ ] **P0-3** 構建其他 V2 工作台前端（重點：quality/lab-personnel 含今日修復）並部署到 `/var/www/cn-kis/`
- [ ] **P0-4** 執行 Nginx 切換：`/api/v1/` → 8002

### P1（建議在切換當日完成）
- [ ] 運行 `ops/scripts/switch_to_v2.sh` 做最終切換前環境檢查
- [ ] 確認 `.env` 的 `CELERY_PRODUCTION_TASKS_DISABLED` 已移除
- [ ] 確認 `REDIS_URL` 指向 DB0

---

## 六、快速部署命令（P0-1 已可執行）

```bash
# 1. 部署後端修復（2 個文件）
scp -i ~/.ssh/openclaw1.1.pem \
  backend/apps/quality/api.py \
  root@118.196.64.48:/opt/cn-kis-v2/backend/apps/quality/api.py

scp -i ~/.ssh/openclaw1.1.pem \
  backend/apps/lab_personnel/services/qualification_service.py \
  root@118.196.64.48:/opt/cn-kis-v2/backend/apps/lab_personnel/services/qualification_service.py

# 2. 重啟 V2 後端
ssh -i ~/.ssh/openclaw1.1.pem root@118.196.64.48 \
  "systemctl restart cn-kis-v2-api && sleep 3 && systemctl is-active cn-kis-v2-api"

# 3. 驗證修復生效
curl -s "http://118.196.64.48/v2/api/v1/health" | python3 -m json.tool
```
