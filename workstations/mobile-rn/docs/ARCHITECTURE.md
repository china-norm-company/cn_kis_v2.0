# Mobile RN 架构说明

## 技术栈

- React Native 0.76 + Expo 52
- TypeScript 5.3 (strict)
- React Navigation 6（底部 Tab + Native Stack）
- Expo SecureStore（敏感数据）
- AsyncStorage（普通持久化）
- react-native-webview（实名认证 H5 流程）

## 目录结构

```
apps/mobile-rn/
├── App.tsx                     # 入口：SafeAreaProvider + AuthContext + Navigation
├── app.config.js               # Expo 动态配置
├── eas.json                    # EAS Build/Submit 配置
├── src/
│   ├── adapters/               # 平台适配层
│   │   ├── rnApiClient.ts      # HTTP 请求（fetch + SecureStore token）
│   │   ├── rnAuthProvider.ts   # 认证（SecureStore + SMS login）
│   │   ├── rnStorageAdapter.ts # 存储（AsyncStorage）
│   │   └── rnUIAdapter.ts      # UI（Alert + Toast）
│   ├── components/             # 基础 UI 组件
│   │   ├── RNPage.tsx          # 页面容器
│   │   ├── RNCard.tsx          # 卡片
│   │   ├── RNButton.tsx        # 按钮（primary/secondary/danger）
│   │   ├── RNBadge.tsx         # 状态徽章
│   │   ├── RNEmpty.tsx         # 空态
│   │   ├── RNMenuItem.tsx      # 菜单项
│   │   └── RNCRFField.tsx      # eCRF 表单字段
│   ├── contexts/
│   │   └── AuthContext.tsx     # 全局认证状态
│   ├── hooks/
│   │   └── useNativeServices.ts # BLE/Health/Push 统一钩子
│   ├── navigation/
│   │   └── AppNavigator.tsx    # 路由（Auth Guard + 34 Screen）
│   ├── screens/                # 34 个页面
│   ├── services/native/        # 原生服务封装（BLE/Health/Push/SSE）
│   └── theme/
│       └── index.ts            # 主题（继承 subject-core designTokens）
├── .maestro/                   # E2E 测试流程
└── docs/                       # 发布/架构文档
```

## 架构分层

```
┌─────────────────────────────────────────┐
│           Screens (34 pages)            │
├─────────────────────────────────────────┤
│    Components (RNPage/Card/Button...)   │
├─────────────────────────────────────────┤
│    Hooks & Contexts (AuthContext...)    │
├──────────┬──────────────────────────────┤
│ Adapters │   @cn-kis/subject-core      │
│ (RN)     │   (shared business logic)    │
├──────────┴──────────────────────────────┤
│     Native Services (BLE/Health/Push)   │
└─────────────────────────────────────────┘
```

## 与微信小程序的一致性

- **共享业务逻辑**：`@cn-kis/subject-core` 包含 hooks、models、validators、endpoints
- **共享设计标记**：`designTokens`（颜色、间距、圆角、字号）
- **共享文案**：`PAGE_COPY`（各页面空态、加载态文案）
- **平台差异**：通过 adapters 层隔离（`taroXxx` vs `rnXxx`）

## 认证流程

1. App 启动 → `AuthContextProvider` 从 SecureStore 恢复 token
2. 未登录 → `LoginScreen`（SMS 验证码）
3. 登录成功 → token 存入 SecureStore → 导航到 `AuthenticatedStack`
4. 退出 → 清除 SecureStore → 导航到 `UnauthenticatedStack`

## 实名认证

使用火山云身份认证（`volcengine_cert`）：

1. 调用后端 `/my/identity/verify/start` 获取 `byted_token`
2. WebView 加载火山 H5 认证页
3. 认证完成后轮询结果
4. 成功后调用 `/my/identity/verify/complete` 确认
