# 业务同事用 Cursor 协作编程 — 操作指南 (V2)

本文档面向**不熟悉技术的业务同事**，按顺序照着做即可。

**仓库地址**：`git@github.com:china-norm-company/cn_kis_v2.0.git`

> **必读**：开始前请先阅读 [`docs/V2_MIGRATION_CHARTER.md`](V2_MIGRATION_CHARTER.md) 中的四条红线。

---

## 配置要求说明

本小节汇总使用 Cursor 参与 **cn_kis_v2.0** 的**环境与流程要求**，与下文「第 1～8 步」及 [`docs/TEAM_WORKFLOW.md`](TEAM_WORKFLOW.md) 配合使用。已在后文逐步写明的操作（如 SSH、克隆）此处仅作索引，不重复展开。

### 前置条件（首次开工前）

| 项 | 要求 |
|----|------|
| Git | 已安装，终端可执行 `git --version` |
| SSH | 已配置密钥并添加到 GitHub（见 **第 1 步**） |
| Cursor | 已安装，可通过 **File → Open Folder** 打开仓库根目录 |

未满足时：先完成第 1～4 步，再进行环境与分支初始化。

### 版本与工具链（本地运行）

项目依赖 **Python 3**（后端 Django 4.2 系）、**Node.js**（建议安装 Current LTS 或团队统一版本）、**pnpm**（版本以仓库根目录 `package.json` 中的 `packageManager` 字段为准，例如 `pnpm@10.x`）。  
**首次克隆**或**换机 / 升级系统**后，建议在 Cursor 中请 AI 按「只检查、不重复安装」的原则核对上述软件是否已安装、版本是否可读；**仅对缺失或不匹配的项**给出安装命令（请说明自己的操作系统：macOS 或 Windows）。

安装完成后可自行验证：

```bash
python3 --version
node -v
pnpm -v
```

### 分支与集成主线

- **集成与测试部署**：按 [`docs/TEAM_WORKFLOW.md`](TEAM_WORKFLOW.md)，`develop` 分支的变更会进入阿里云测试环境流水线。日常开发应**以合并 `origin/develop` 为每日同步主线**，减少与集成分支的漂移。
- **分支命名**（与团队约定一致即可，以下为常见两种写法）：
  - **仓库通用**（见 TEAM_WORKFLOW）：`feature/<workstation>-<描述>`、`fix/<workstation>-<描述>`、`wave/<N>-<描述>` 等。
  - **便于识别责任人时的补充写法**：`feature/<模块名>-<姓名简写>`，例如 `feature/finance-maggie`、`feature/research-yoyo`。
- **红线**：**禁止**在 `develop` 或 `main` 上直接长期开发或提交个人改动；日常工作在 `feature/*` / `fix/*` 等分支，合并进主线通过 PR。

### 首次初始化（仅第一次，可与 AI 协作）

1. 在空文件夹中用 Cursor **Open Folder**，再于终端克隆到当前目录（或先 `git clone` 再打开），进入仓库根目录。
2. `git fetch origin`，检出并跟踪远程 **`develop`**：`git checkout develop`（或 `git checkout -b develop origin/develop`）。
3. 基于 **`develop`** 创建个人功能分支（命名见上节），并 `git checkout` 到该分支。
4. 用 `git status`、`git branch` 确认当前在**自己的功能分支**上。

### 每日开工同步（建议每天开工前执行）

1. `git fetch origin`
2. 确认当前分支为自己的 `feature/...`（或团队约定的开发分支）
3. `git merge origin/develop`，将远程 **develop** 最新变更并入当前分支
4. **有冲突**：列出冲突文件；简单冲突可请 Cursor 辅助；复杂冲突应停手、`git merge --abort` 后寻求同事协助，**勿强行提交带冲突标记的代码**
5. **无冲突**：合并成功后，可用 `git log origin/develop..HEAD --oneline` 查看当前分支相对 `develop` 多出的提交（作进度参考）

若团队通知需要与 **`main` 稳定线**对齐，可在上述步骤之后**再按需**执行 `git merge origin/main`，以实际协作约定为准。

### 本地启动与验证

环境就绪且完成当日同步后，再启动后端 / 各工作台前端。可在 Cursor 中引用项目规则（例如 **`@local-backend-dev`**）请 AI **按仓库内本地开发规范**协助启动。  
**勿在仓库、文档或聊天可复制内容中写入真实密码、令牌**；本地口令使用本机环境变量或团队私下约定的安全渠道。

启动后应在浏览器访问对应本地地址，确认控制台与页面无持续性报错。

### 需求描述与人工审查

- **推荐**：写清**工作台 / 页面**、**控件**与**期望行为**（例：「研究台方案列表增加按状态筛选下拉框」）。
- **避免**：仅说「改一下那个按钮」「修个 bug」而无复现步骤或位置。

对 AI 生成或修改的代码应**人工审阅**后再保存、提交。

### 提交、推送与收工习惯

- **小步提交**：完成一个小功能或一个独立修复即提交，避免长时间大段未提交变更。
- **提交信息**：遵循 Conventional Commits（与团队示例一致，如 `feat(research): …`、`fix(finance): …`）。
- **推送范围**：**只推送到自己的特性分支**，勿直接 `push` 到 `develop` / `main`。
- **收工**：下班前尽量将当日已确认的工作推送到远程同名分支，避免大量未提交代码仅留在本机。

### 常见问题（补充）

| 场景 | 建议 |
|------|------|
| `merge` / `push` 出现冲突 | 先停手；把冲突文件与片段发给 Cursor 或同事；勿提交未解决冲突 |
| 不确定改动是否合规 | 提交前在 Cursor 询问是否违反 V2 迁移红线或相关域规范 |

---

## 第 1 步：配置 SSH 密钥（只需做一次）

### 1.1 打开终端

- **Mac**：应用程序 → 实用工具 → 终端
- **Windows**：开始菜单搜索「Git Bash」并打开

### 1.2 检查密钥

```bash
ls ~/.ssh/id_ed25519.pub
```

- 若显示文件路径：说明已有密钥，跳至 1.4
- 若提示 No such file：继续 1.3

### 1.3 生成密钥

```bash
ssh-keygen -t ed25519 -C "你的邮箱@china-norm.com"
```

提示时**连续按 3 次回车**（使用默认设置、不设密码）。

### 1.4 复制公钥

- **Mac**：`cat ~/.ssh/id_ed25519.pub | pbcopy`
- **Windows（Git Bash）**：`cat ~/.ssh/id_ed25519.pub | clip`

### 1.5 添加到 GitHub

1. 浏览器访问：https://github.com/settings/keys
2. 点击 **New SSH key**
3. Title：填任意名称（如 "My Laptop"）
4. Key：粘贴刚才复制的内容
5. 点击 **Add SSH key**

### 1.6 验证连接

```bash
ssh -T git@github.com
```

看到 `Hi <用户名>! You've been successfully authenticated` 即成功。

---

## 第 2 步：克隆 V2 项目（只需做一次）

**Mac：**
```bash
cd ~/Documents
git clone git@github.com:china-norm-company/cn_kis_v2.0.git
cd cn_kis_v2.0
```

**Windows：**
```bash
cd %USERPROFILE%\Documents
git clone git@github.com:china-norm-company/cn_kis_v2.0.git
cd cn_kis_v2.0
```

---

## 第 3 步：创建自己的工作分支（只需做一次）

先检出 **`develop`** 并拉取最新，再基于 **`develop`** 创建分支（与 **[配置要求说明](#配置要求说明)**、[`docs/TEAM_WORKFLOW.md`](TEAM_WORKFLOW.md) 中的测试部署主线一致）：

```bash
git fetch origin
git checkout develop
git pull origin develop
git checkout -b feature/<工作台或模块>-<描述或姓名简写>
```

按**你负责的工作台**创建分支示例：

| 你负责的工作台 | 执行的命令（示例） |
|---------------|-----------|
| 秘书台（子衿） | `git checkout -b feature/secretary-your-task` |
| 财务台（管仲） | `git checkout -b feature/finance-your-task` |
| 研究台（采苓） | `git checkout -b feature/research-your-task` |
| 执行台（维周） | `git checkout -b feature/execution-your-task` |
| 质量台（怀瑾） | `git checkout -b feature/quality-your-task` |
| 人事台（时雨） | `git checkout -b feature/hr-your-task` |
| 客户台（进思） | `git checkout -b feature/crm-your-task` |
| 招募台（招招） | `git checkout -b feature/recruitment-your-task` |
| 迁移波次工作 | `git checkout -b wave/1-identity-migration` |

把 `your-task` 替换成你实际做的事情的简短描述（英文，用连字符分隔）。若团队约定使用 `feature/<模块名>-<姓名简写>`，将分支名换成对应格式即可。

---

## 第 4 步：用 Cursor 打开项目

1. 打开 **Cursor**
2. 菜单选 **File → Open Folder**
3. 选中 `cn_kis_v2.0` 文件夹，点「打开」

---

## 第 5 步：第一次和 AI 对话

在 Cursor 里新建对话，复制粘贴以下内容：

```
我是业务同事，和开发一起用 Cursor 协作 CN KIS V2.0 项目。
这个系统有四条不可违反的迁移红线：
1. 飞书统一认证（子衿主授权）不得破坏
2. 权限模型（5 维）不得退化
3. 知识资产不得丢失
4. 测试与生产环境职责不得混淆

请按照项目规则帮我：我描述需求，你给出修改方案，
涉及提交或推送前先说明影响再操作。
```

---

## 第 6 步：日常提需求

在 Cursor 对话里，用自然语言说你要做什么，例如：

- 「在研究台的方案列表页面加一个按状态筛选的功能」
- 「把财务台发票页面的按钮文案从"确认"改成"提交审核"」
- 「帮我看看这个页面为什么显示不出数据」

AI 会按规范改代码或给出需要执行的命令。

---

## 第 7 步：提交并推送

改完代码后，在 Cursor 里说：

```
帮我把刚才的修改提交并推送到远程（只推到我自己的分支），请给出我需要执行的命令。
```

或者自己执行（以研究台为例）：

```bash
cd ~/Documents/cn_kis_v2.0
git add .
git commit -m "feat(research): 方案列表加状态筛选"
git push -u origin feature/research-protocol-filter
```

---

## 第 8 步：拉取最新内容

**日常**应以 **`develop` 集成线**为准（见 [配置要求说明 · 每日开工同步](#配置要求说明)）。开始工作或收到「需要同步」通知后：

```bash
cd ~/Documents/cn_kis_v2.0   # 换成你的项目路径
git checkout feature/research-your-task   # 换成你的分支名
git fetch origin
git merge origin/develop
```

若团队另行通知需要与 **`main`** 稳定线对齐，再执行：`git merge origin/main`。

---

## 日常操作速查

| 我要做什么 | 怎么做 |
|-----------|--------|
| 查看当前分支 | `git branch` |
| 切换到自己的分支 | `git checkout feature/my-branch` |
| 查看改了哪些文件 | `git status` |
| 推送到自己的分支 | `git add . && git commit -m "说明" && git push` |
| 拉取最新集成线（推荐每日） | `git fetch origin && git merge origin/develop` |
| 按需对齐 main | `git fetch origin && git merge origin/main`（以团队通知为准） |
| 合并冲突处理 | 把报错与冲突片段贴给 Cursor；复杂时勿强行提交 |
| 取消失败的合并 | `git merge --abort` |

---

## 注意事项

1. **每次开始工作前**先同步远程 **`develop`**：`git fetch origin && git merge origin/develop`（见 [配置要求说明](#配置要求说明)）
2. **小步提交**：改完一个小功能就提交一次
3. **不要改 V2 迁移章程**：`docs/V2_MIGRATION_CHARTER.md` 需要 PR + 系统负责人审批
4. **不要提交密码/密钥**：勿将口令写入仓库；AI 与文档均应遵守此规则
5. **遇到报错**：把完整报错复制给 Cursor 或技术同事

---

## 遇到问题？

| 问题 | 怎么办 |
|------|--------|
| SSH 配置报错 | 把报错截图发给技术同事 |
| push 报权限错误 | 确认已被加入 GitHub 仓库协作者 |
| 合并冲突搞不定 | `git merge --abort`，把报错发给技术同事 |
| 不知道改的对不对 | 提交前在 Cursor 问「这个改动是否符合 V2 迁移红线？」 |
