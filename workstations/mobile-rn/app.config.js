const appName = process.env.EXPO_APP_NAME || 'CN KIS Subject'
const bundleId = process.env.EXPO_BUNDLE_ID || 'cc.utest.cnkis.subject'
const androidPackage = process.env.EXPO_ANDROID_PACKAGE || 'cc.utest.cnkis.subject'

module.exports = {
  expo: {
    name: appName,
    slug: 'cn-kis-mobile-rn',
    version: '1.0.0',
    orientation: 'portrait',
    scheme: 'cnkismobile',
    userInterfaceStyle: 'automatic',
    runtimeVersion: {
      policy: 'appVersion',
    },
    updates: {
      url: process.env.EXPO_UPDATES_URL || undefined,
    },
    extra: {
      apiBase: process.env.EXPO_PUBLIC_API_BASE || '',
      envName: process.env.EXPO_PUBLIC_ENV_NAME || 'preview',
      eas: {
        projectId: process.env.EXPO_PROJECT_ID || undefined,
      },
    },
    ios: {
      bundleIdentifier: bundleId,
      supportsTablet: true,
    },
    android: {
      package: androidPackage,
    },
  },
}
