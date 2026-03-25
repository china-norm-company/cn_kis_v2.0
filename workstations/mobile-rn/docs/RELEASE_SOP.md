# Mobile RN 发布 SOP

## 发布前检查清单

### 1. 代码质量

- [ ] `pnpm --filter @cn-kis/subject-core build` 通过
- [ ] `pnpm --filter @cn-kis/mobile-rn run type-check` 零错误
- [ ] Maestro E2E 测试通过（`pnpm --filter @cn-kis/mobile-rn run e2e:maestro`）
- [ ] PR 已通过 CI 质量门禁（`mobile-rn-quality.yml`）
- [ ] 代码审核已完成

### 2. 配置验证

```bash
pnpm --filter @cn-kis/mobile-rn run release:preflight
```

确认以下配置项：

- `EXPO_PUBLIC_API_BASE`：生产 API 地址（必须 HTTPS）
- `EXPO_PROJECT_ID`：EAS 项目 ID
- `EXPO_BUNDLE_ID`：iOS Bundle ID（`cc.utest.cnkis.subject`）
- `EXPO_ANDROID_PACKAGE`：Android 包名（`cc.utest.cnkis.subject`）

### 3. 版本号

在 `app.config.js` 中更新 `version`，遵循 semver：

- 功能新增：minor bump（1.0.0 → 1.1.0）
- Bug 修复：patch bump（1.0.0 → 1.0.1）
- 重大变更：major bump（1.0.0 → 2.0.0）

EAS `autoIncrement` 会自动处理 `buildNumber`/`versionCode`。

## 构建流程

### Preview 构建（内部测试）

```bash
# iOS
pnpm --filter @cn-kis/mobile-rn run eas:build:ios:preview

# Android
pnpm --filter @cn-kis/mobile-rn run eas:build:android:preview
```

Preview 构建产出 `.ipa`（ad-hoc）和 `.apk`，用于内部团队测试。

### Production 构建

```bash
# iOS
pnpm --filter @cn-kis/mobile-rn run eas:build:ios:production

# Android
pnpm --filter @cn-kis/mobile-rn run eas:build:android:production
```

Production 构建产出 `.ipa`（App Store）和 `.aab`（Google Play）。

## 提交商店

### iOS App Store

```bash
pnpm --filter @cn-kis/mobile-rn run eas:submit:ios:production
```

提交后在 App Store Connect 中：

1. 填写版本说明
2. 上传截图（6.7"、6.5"、5.5" 三种尺寸）
3. 提交审核

### Android Google Play

```bash
pnpm --filter @cn-kis/mobile-rn run eas:submit:android:production
```

提交后在 Google Play Console 中：

1. 上传至内测或正式轨道
2. 填写更新说明
3. 发布

## 回滚方案

1. 如果是 OTA 更新问题：在 EAS Updates 中回退到上一个 update
2. 如果是 native 问题：构建上一个 git tag 的版本重新提交商店
3. 紧急修复：hotfix 分支 → cherry-pick → 快速构建发布

## 环境变量管理

生产环境变量通过 EAS Secrets 管理：

```bash
pnpm --filter @cn-kis/mobile-rn run eas:secrets:push
```

不要将生产凭据提交到代码仓库。
