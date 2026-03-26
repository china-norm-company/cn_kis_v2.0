# Stash 恢复说明（便于 pop 时对照）

**Stash 创建时间**：2026-03-19  
**创建时分支**：`feature/wechat-recruitment-reception`  
**Stash 引用**：`stash@{0}`

**Stash 说明（英文，无乱码）**：
`20260319 feature/wechat-recruitment-reception | quality(reception/wechat-mini/backend/docs) + untracked: AdverseEventReportsPage, .env.example, WECHAT_MINI_DEV_SANDBOX, wechat-mini-sandbox, adverse-event-docs, PATCH-cloud-login, allow_port_8001.ps1`

---

## 本 stash 包含内容

### 已修改文件（Modified）
- **质量台**：`apps/quality/.env`、`App.tsx`、`layouts/AppLayout.tsx`
- **接待台**：`apps/reception/.env`、`vite.config.ts`
- **微信小程序**：`config/index.ts`、`package.json`、`src/app.ts`、`pages/report/history.tsx`、`pages/report/index.tsx`、`utils/api.ts`、`utils/auth.ts`
- **后端**：`backend/apps/identity/`、`backend/apps/safety/`、`backend/apps/subject/` 相关文件，`backend/settings.py`、`backend/db.sqlite3`
- **文档**：`docs/comprehensive_research/签到签出功能优化/` 下相关 md

### 未跟踪文件（Untracked）
- `allow_port_8001.ps1`
- `apps/quality/.env.example`、`apps/quality/src/pages/AdverseEventReportsPage.tsx`
- `docs/comprehensive_research/WECHAT_MINI_DEV_SANDBOX.md`、`wechat-mini-sandbox-visualization.html`
- `docs/comprehensive_research/不良反应功能优化/` 目录
- `docs/comprehensive_research/签到签出功能优化/PATCH_云托管登录赋予subject_self角色.md`

---

## 恢复步骤（pop）

1. **确认分支**（若需要先回到该分支）：
   ```powershell
   cd d:\git_project\cn_kis_v1.0
   git checkout feature/wechat-recruitment-reception
   ```

2. **若当前工作区有与 stash 冲突的修改**（例如上次 pop 失败后残留的 `backend/db.sqlite3`）：
   - **先关闭占用 SQLite 的进程**（如 Django runserver、IDE 数据库工具等），然后：
   ```powershell
   git restore backend/db.sqlite3
   ```
   - 或暂时保留该修改，直接执行 pop（可能仅 db.sqlite3 冲突，按提示解决即可）。

3. **执行 pop**：
   ```powershell
   git stash pop
   ```
   若有冲突，按提示解决后 `git add` 再继续即可。

4. **恢复后**可删除本说明文件（可选）：
   ```powershell
   Remove-Item STASH_POP_README.md
   ```

---

## 仅查看不恢复

- 查看 stash 列表：`git stash list`
- 查看该 stash 内容：`git stash show -p "stash@{0}"`
