# 业务同事用 Cursor 协作编程 — 操作指南 (V2)

本文档面向**不熟悉技术的业务同事**，按顺序照着做即可。

**仓库地址**：`git@github.com:china-norm-company/cn_kis_v2.0.git`

> **必读**：开始前请先阅读 [`docs/V2_MIGRATION_CHARTER.md`](V2_MIGRATION_CHARTER.md) 中的四条红线。

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

按**你负责的工作台**创建分支：

| 你负责的工作台 | 执行的命令 |
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

把 `your-task` 替换成你实际做的事情的简短描述（英文，用连字符分隔）。

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

收到「main 有更新」通知后：

```bash
cd ~/Documents/cn_kis_v2.0
git checkout feature/research-your-task   # 换成你的分支名
git fetch origin
git merge origin/main
```

---

## 日常操作速查

| 我要做什么 | 怎么做 |
|-----------|--------|
| 查看当前分支 | `git branch` |
| 切换到自己的分支 | `git checkout feature/my-branch` |
| 查看改了哪些文件 | `git status` |
| 推送到自己的分支 | `git add . && git commit -m "说明" && git push` |
| 拉取最新 main | `git fetch origin && git merge origin/main` |
| 合并冲突处理 | 把报错贴给 Cursor，说「以远程 main 为准，请帮我解决」 |
| 取消失败的合并 | `git merge --abort` |

---

## 注意事项

1. **每次开始工作前**先拉取最新：`git fetch origin && git merge origin/main`
2. **小步提交**：改完一个小功能就提交一次
3. **不要改 V2 迁移章程**：`docs/V2_MIGRATION_CHARTER.md` 需要 PR + 系统负责人审批
4. **不要提交密码/密钥**：AI 会自动遵守此规则
5. **遇到报错**：把完整报错复制给 Cursor 或技术同事

---

## 遇到问题？

| 问题 | 怎么办 |
|------|--------|
| SSH 配置报错 | 把报错截图发给技术同事 |
| push 报权限错误 | 确认已被加入 GitHub 仓库协作者 |
| 合并冲突搞不定 | `git merge --abort`，把报错发给技术同事 |
| 不知道改的对不对 | 提交前在 Cursor 问「这个改动是否符合 V2 迁移红线？」 |
