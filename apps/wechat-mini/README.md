# CN KIS 受试者端 · 微信小程序

本应用为 CN KIS 受试者端微信小程序，采用 **微信云托管 + wx.cloud.callContainer** 与后端通信，真机登录与 API 已验证通过。

## 快速参考

- **云托管接入与部署完整说明**（环境、配置、前端规范、后端要点、部署流程、常见问题）：  
  **[docs/WECHAT_MINI_CLOUDRUN_GUIDE.md](../../docs/WECHAT_MINI_CLOUDRUN_GUIDE.md)**

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm run cloudrun:deploy`（在仓库根目录） | 一键部署云托管服务 cnkis（自动登录、打精简包、非交互） |
| `bash scripts/gen-preview-qr.sh`（在本目录） | 生成新的预览二维码到 test-results/wechat-preview-qr.png |

## 关键配置

- 云托管环境 ID：`prod-5gedwgmb04c799d6`
- 服务名：`cnkis`
- 前端严格使用微信官方 `wx.cloud.init`、`wx.cloud.callContainer`，见 [官方文档](https://developers.weixin.qq.com/minigame/dev/wxcloudrun/src/development/call/mini.html)
