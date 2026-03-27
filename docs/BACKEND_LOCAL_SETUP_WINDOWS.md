# 后端本地环境（Windows）— 虚拟环境与启动

> **虚拟环境是什么（通俗）**：在项目里的 **`.venv` 文件夹**里单独装一套 Python 和依赖，**不污染**系统全局 Python，不同项目也不会互相冲突。  
> **本仓库**：虚拟环境路径为 **`backend/.venv`**（已在 `.gitignore` 中，不会提交到 Git）。

---

## 一、已在本机完成的一次性步骤（若你已跑过可跳过）

在 **`backend`** 目录下已执行：

1. `python -m venv .venv` — 创建虚拟环境  
2. `.venv\Scripts\pip.exe install -r requirements.txt` — 安装后端依赖  

若你在**另一台电脑**或删掉了 `.venv`，在 **`backend`** 下重新执行上面两句即可。

---

## 二、以后每次开终端要写后端时（复制粘贴）

**PowerShell**（路径按你本机修改）：

```powershell
cd d:\git_project\cn_kis_v1.0\backend
.\.venv\Scripts\Activate.ps1
```

若提示「无法加载，因为在此系统上禁止运行脚本」，可先执行（**仅当前用户、一次**）：

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

再重新执行 `Activate.ps1`。

**或用 cmd.exe**（一般不拦脚本）：

```cmd
cd /d d:\git_project\cn_kis_v1.0\backend
.venv\Scripts\activate.bat
```

激活成功后，提示符前会出现 **`(.venv)`**。

---

## 三、激活虚拟环境之后（数据库与迁移）

### 推荐：本机无 PostgreSQL 时（数据固定在 `db.sqlite3`）

1. 团队下发的 **`deploy/.env.volcengine.plan-a`** 放在仓库 **`deploy/`** 目录（已在 `.gitignore`，勿提交），用于飞书等密钥。  
2. 在 **`backend/.env`** 中设置 **`USE_SQLITE=true`**（可新建该文件，或复制 `.env.example` 后只改此项）。`settings.py` 会**后加载** `backend/.env` 并覆盖数据库配置，开发数据写入 **`backend/db.sqlite3`**，不连本机 `5432`。  
3. 若需用本机或隧道 PostgreSQL：在 `backend/.env` 中设 **`USE_SQLITE=false`**，并正确配置 **`DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD`**。

### 迁移与启动

1. 配置好上述环境变量后，执行迁移并启动：

```powershell
python manage.py migrate
python manage.py runserver 8001
```

浏览器访问：`http://127.0.0.1:8001`（若有健康检查路由以项目为准）。

---

## 四、与小程序联调时的 API 基址

本地后端默认：`http://127.0.0.1:8001/api/v1`（详见 `docs/WECHAT_MINI_LOCAL_DEV.md`）。

---

## 五、日记 2.0 试点配置（可选）

迁移含 `t_subject_diary_config` 后，可在 **`backend`** 目录执行：

```powershell
python manage.py seed_diary_config_pilot
```

会创建或复用 **`project_no=W26000000`** 的全链路项目，并写入一条**已发布且研究员已确认**的日记配置。小程序拉取：

`GET http://127.0.0.1:8001/api/v1/my/diary/config?project_id=<上条命令输出的 project_id>`  
（需受试者 JWT，权限 `my.profile.read`。）

---

## 六、故障排查（迁移）

- **`SubjectAppointment has no field named 'visit_point'`**：仓库已修正 `0015_add_visit_point_to_appointment` 为真实 `AddField`。若你**旧库**在修正前已应用过「空」0015，需由技术同事评估补列或重建本地库（删除 `backend/db.sqlite3` 后重新 `migrate`）。

---

*文档可随团队路径调整 `cd` 目标目录。*
