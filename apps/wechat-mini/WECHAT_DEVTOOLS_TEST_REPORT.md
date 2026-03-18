# 微信开发者工具测试报告（小程序）

**测试日期**: 2026-02-25（最近一次 2026-02-26）  
**测试环境**: macOS + 微信开发者工具 CLI  
**项目路径**: `apps/wechat-mini`  
**小程序 AppID**: `wx2019d5560fe47b1d`  
**API 基址**: 云托管 `wx.cloud.callContainer`（公网直连时通过 `TARO_APP_API_BASE` 显式指定）

**request/downloadFile 合法域名**：仅在公网直连模式需要配置你实际使用的 HTTPS 域名。  
云托管 `callContainer` 模式默认无需配置上述域名；若切换到直连且未配置会报错：`url not in domain list`。

**「微信快捷登录」报 url not in domain list 时排查**：

1. 若为公网直连，确认 **request 合法域名** 含实际 HTTPS 域名（无尾斜杠、无空格）。
2. 用 **新构建** 再试：本地执行 `TARO_APP_API_BASE=https://api.example.com/api/v1 pnpm --filter @cn-kis/wechat-mini build:weapp` 后重新预览/真机。
3. 公众平台修改域名后需保存，有时生效有延迟；真机可删除小程序后重新扫码进入。

**报 request:fail errcode:-100 / cronet_error_code:-100 时**（网络层失败，可能与域名或网络有关）：

1. 若为公网直连，确认 **request 合法域名** 已添加当前 API 域名并保存。
2. 同一手机浏览器访问 `https://api.example.com/api/v1/health` 验证连通性；若打不开则为网络/运营商/防火墙问题，可换 4G 或其它网络再试。
3. 小程序已对 -100 做友好提示，会引导检查域名与网络。

---

## 测试结论

本轮微信开发者工具测试已完成，关键链路通过：

- CLI 可用且登录状态正常（中途失效后已恢复）
- 小程序构建成功（Taro weapp）
- 微信预览成功，已生成二维码
- 自动化通道可用（`auto`、`auto-replay` 执行成功）

当前状态：**可继续真机扫码回归测试**。

---

## 已执行命令与结果

### 1) 环境与登录检查

```bash
"/Applications/wechatwebdevtools.app/Contents/MacOS/cli" islogin
```

- 结果：`{"login":true}`

### 2) 小程序构建

```bash
pnpm build:weapp
```

- 结果：`Compiled successfully`

### 3) 微信预览（CLI）

```bash
"/Applications/wechatwebdevtools.app/Contents/MacOS/cli" preview \
  --project "/Users/aksu/Cursor/CN_KIS_V1.0/apps/wechat-mini" \
  --lang zh --qr-format image \
  --qr-output "/Users/aksu/Cursor/CN_KIS_V1.0/apps/wechat-mini/test-results/wechat-preview-qr.png" \
  --info-output "/Users/aksu/Cursor/CN_KIS_V1.0/apps/wechat-mini/test-results/wechat-preview-info.json"
```

- 结果：`preview` 成功
- 包体：`489.6 KB`（`501314 Byte`）

### 4) 自动化能力连通性

```bash
"/Applications/wechatwebdevtools.app/Contents/MacOS/cli" auto \
  --project "/Users/aksu/Cursor/CN_KIS_V1.0/apps/wechat-mini" \
  --trust-project --lang zh
```

- 结果：`auto` 成功

```bash
"/Applications/wechatwebdevtools.app/Contents/MacOS/cli" auto-replay \
  --project "/Users/aksu/Cursor/CN_KIS_V1.0/apps/wechat-mini" \
  --replay-all --trust-project --lang zh
```

- 结果：`auto-replay finish`（无报错）

---

## 产物文件

- 预览二维码：`apps/wechat-mini/test-results/wechat-preview-qr.png`
- 预览信息：`apps/wechat-mini/test-results/wechat-preview-info.json`

---

## 开发版二维码「已失效」根因与处理

**现象**：每次执行 `cli preview` 后扫码仍提示「开发版二维码已失效」。

**根因**：微信开发者工具 CLI 在 `--qr-output` 指向**已存在的文件**时**不会覆盖**，只复用磁盘上的旧文件，因此实际展示的一直是第一次生成时的二维码（已过期）。用新文件名或绝对路径且先删后生成时，CLI 才会写入新内容。

**处理**：

1. 每次生成前**删除**目标文件：`rm -f test-results/wechat-preview-qr.png`
2. 使用**绝对路径**：`-o /完整路径/apps/wechat-mini/test-results/wechat-preview-qr.png`
3. 或使用项目脚本（已封装上述逻辑）：  
   `./scripts/gen-preview-qr.sh`  
   生成后会打开新二维码，请尽快扫码（开发版二维码有效期较短）。

---

## 过程中出现的问题与处理

1. **登录态失效**
   - 现象：`islogin` 返回 `false`，`preview` 报“需要重新登录”
   - 处理：重新登录微信开发者工具后恢复正常

2. **早期报错（已不复现）**
   - 现象：`iconPath=assets/tab-home.png, file not found`
   - 现状：登录恢复后重新构建并预览，已成功通过

---

## 待人工真机验证清单（建议）

请扫码 `wechat-preview-qr.png` 后，按以下项做冒烟：

- [ ] 底部 Tab：`首页`、`访视`、`我的` 可切换，图标显示正常
- [ ] 首屏加载无白屏、无崩溃
- [ ] 关键页面可进入：`预约`、`支付`、`支持`、`消息通知`
- [ ] 常见交互可用：按钮点击、表单输入、页面返回
- [ ] 控制台无 JS 运行时报错（网络错误需按后端状态判定）

---

## 发布前自动化门禁清单（新增）

在发布前建议至少执行以下 Headed 用例并留存报告：

```bash
# 仓库根目录执行（推荐）
pnpm gate:wechat-headed

# 或在 apps/wechat-mini 目录执行
pnpm run gate:wechat-headed
```

等价于依次执行下面三个用例：

1. **UI 综合质量回归**

```bash
pnpm exec playwright test e2e/headed/ui-quality-comprehensive.spec.ts --project=wechat-mini-h5-mobile-headed
```

1. **产品全链路验收（Happy Path）**

```bash
pnpm exec playwright test e2e/headed/product-lifecycle.spec.ts --project=wechat-mini-h5-mobile-headed
```

1. **产品异常链路验收（Error Path）**

```bash
pnpm exec playwright test e2e/headed/product-lifecycle-exception.spec.ts --project=wechat-mini-h5-mobile-headed
```

门禁判定建议：

- 三个用例均通过，方可进入真机扫码回归。
- 若异常链路用例失败，视为用户提示与容错逻辑不完整，不允许标记“已完成”。

---

## 建议下一步

1. 进行一次真机录屏回归（覆盖主流程 5-10 分钟）
2. 将发现的问题按“页面-步骤-期望-实际-截图”格式登记
3. 若需要，我可以继续基于该报告补充“问题清单”和“修复优先级”

---

## 最近一次执行（2026-02-26）

- **islogin**: `{"login":true}`
- **build:weapp**: `TARO_APP_API_BASE=https://api.example.com/api/v1`（公网直连示例），Compiled successfully
- **preview**: 成功，包体 490.0 KB，二维码 `test-results/wechat-preview-qr.png`
- **auto**: 成功
- **auto-replay**: `auto-replay finish`（无报错）

**直接打开「我的二维码」页预览**（扫码即进入该页）：

```bash
"/Applications/wechatwebdevtools.app/Contents/MacOS/cli" preview \
  --project "$(pwd)" --compile-condition '{"pathName":"pages/myqrcode/index"}' \
  --lang zh --qr-format image --qr-output test-results/wechat-preview-qr.png
```

---

## 修复记录（2026-02-27）

**问题**：

- 其他体验用户反馈首页左上角动画不动。
- 未登录页偶发黑块（外链视频未播放，显示首帧/空白）。

**根因**：

- 首页动效依赖 `Video` 自动播放，受设备/网络/微信内核策略影响，稳定性不足。

**修复**：

- 将首页左上角动效统一改为本地 CSS 动画图标（未登录/已登录一致）。
- 去除视频依赖，增强动效可见性（浮动 + 脉冲 + 旋转环）。

**发布与验证**：

- 代码提交：`2edec7a`（分支 `wechat-mini-cloud-deploy`）。
- 已推送 GitHub 并完成微信云托管发布（服务 `django-l3sv`）。
- 多次重新生成预览二维码供体验用户验证。

**当前结论**：

- 该问题已修复并记录，后续以云托管发布版本为准验收。
