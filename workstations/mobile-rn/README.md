# CN KIS 移动端（React Native / Expo）

## 依赖与环境（E2E / 本地构建）

- **Maestro**（E2E）：`curl -Ls "https://get.maestro.mobile.dev" | bash`，安装后新开终端或 `export PATH="$PATH:$HOME/.maestro/bin"`
- **Java**（Maestro 依赖）：`brew install openjdk@17`，然后 `export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"`（或写入 `~/.zshrc`）
- **CocoaPods**（iOS）：`brew install cocoapods`
- **Xcode**（iOS 模拟器）：从 App Store 安装完整 Xcode；安装后执行 `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`。仅装 Command Line Tools 时无法使用 `simctl` 与模拟器。

## 启动

- `pnpm --filter @cn-kis/mobile-rn start`
- `pnpm --filter @cn-kis/mobile-rn ios`
- `pnpm --filter @cn-kis/mobile-rn android`
- 复制环境变量模板：`cp .env.example .env`

## E2E（Maestro）

- 主流程：`pnpm --filter @cn-kis/mobile-rn e2e:maestro`
- 全部流程（flow + login-flow + visit-flow）：`pnpm --filter @cn-kis/mobile-rn e2e:maestro:all`
- iOS headed 全量回归（自动检查环境 + 启动模拟器 + 必要时构建安装）：`pnpm --filter @cn-kis/mobile-rn e2e:maestro:ios:headed`
- 需已启动 Android 模拟器或连接真机，且已安装 Java 与 Maestro（见上方「依赖与环境」）。iOS 模式需完整 Xcode 且 `xcode-select` 指向 `/Applications/Xcode.app/Contents/Developer`。

## EAS 构建

- `pnpm --filter @cn-kis/mobile-rn run eas:build:ios:preview`
- `pnpm --filter @cn-kis/mobile-rn run eas:build:android:preview`
- `pnpm --filter @cn-kis/mobile-rn run eas:build:ios:production`
- `pnpm --filter @cn-kis/mobile-rn run eas:build:android:production`

## 标识与环境

- App 元信息使用 `app.config.js`（替代 `app.json`）
- 可用环境变量：
  - `EXPO_PUBLIC_API_BASE`：后端 API 基址
  - `EXPO_BUNDLE_ID`：iOS Bundle ID
  - `EXPO_ANDROID_PACKAGE`：Android Package
  - `EXPO_PROJECT_ID`：EAS project id（启用 updates 时）

## EAS Secrets

- 复制模板：`cp eas.secrets.example eas.secrets.local`
- 填写后执行：`pnpm --filter @cn-kis/mobile-rn run eas:secrets:push`
- 发布前检查清单：`RELEASE_CHECKLIST.md`
- 一键发布前体检：`pnpm --filter @cn-kis/mobile-rn run release:preflight`

## 环境模板

- 预发模板：`.env.preview.example`
- 生产模板：`.env.production.example`
- 通用模板：`.env.example`

## 发布流程

### iOS（TestFlight）

1. 配置 `eas.json` 与 Apple 证书
2. 运行 `pnpm run release:preflight`
3. 运行 `eas build -p ios --profile preview`
4. 上传到 TestFlight，执行冒烟测试
5. 通过后提交 App Store 审核

### Android（Google Play 内测）

1. 配置 Android keystore
2. 运行 `pnpm run release:preflight`
3. 运行 `eas build -p android --profile preview`
4. 上传到 Google Play Internal testing
5. 验证后发布到正式轨道
