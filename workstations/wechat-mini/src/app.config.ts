/**
 * 页面统一收敛到主包 `src/pages`，避免 pages 与 subpackages 双份源码分叉。
 */
const mainPages = ['pages/index/index', 'pages/visit/index', 'pages/profile/index'] as const

const businessPages = [
  'pages/phone-login/index',
  'pages/bind-phone/index',
  'pages/identity-verify/index',
  'pages/consent/index',
  'pages/questionnaire/index',
  'pages/report/index',
  'pages/report/history',
  'pages/myqrcode/index',
  'pages/technician/index',
  'pages/technician/workorder-detail',
  'pages/appointment/index',
  'pages/payment/index',
  'pages/support/index',
  'pages/register/index',
  'pages/queue/index',
  'pages/projects/index',
  'pages/referral/index',
  'pages/checkin/index',
  'pages/sample-confirm/index',
  'pages/sample-return/index',
  'pages/products/index',
  'pages/products/detail',
  'pages/results/index',
  'pages/compliance/index',
  'pages/withdraw/index',
  'pages/nps/index',
  'pages/diary/index',
  'pages/screening-status/index',
  'pages/notifications/index',
  'pages/study-types/index',
  'pages/rights/index',
  'pages/faq/index',
  'pages/ai-chat/index',
  'pages/reception-board/index',
  'pages/qa-patrol/index',
  'pages/demo-hero/index',
  'pages/dev-api/index',
] as const

export default defineAppConfig({
  pages: [...mainPages, ...businessPages],
  // 代码质量：需开启「组件按需注入」。单独开启可能导致 Taro 根渲染组件 comp 未参与注入链而白屏，故在 app 级登记 `./comp`（与 dist/comp 一致，见微信文档 usingComponents + lazyCodeLoading）。
  lazyCodeLoading: 'requiredComponents',
  usingComponents: {
    comp: './comp',
  },
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#2B6CB0',
    navigationBarTitleText: 'UTest',
    navigationBarTextStyle: 'white',
    backgroundColor: '#f7fafc',
  },
  tabBar: {
    color: '#999999',
    selectedColor: '#2B6CB0',
    backgroundColor: '#ffffff',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '首页',
        iconPath: 'assets/tab-home.png',
        selectedIconPath: 'assets/tab-home-active.png',
      },
      {
        pagePath: 'pages/visit/index',
        text: '访视',
        iconPath: 'assets/tab-visit.png',
        selectedIconPath: 'assets/tab-visit-active.png',
      },
      {
        pagePath: 'pages/profile/index',
        text: '我的',
        iconPath: 'assets/tab-profile.png',
        selectedIconPath: 'assets/tab-profile-active.png',
      },
    ],
  },
})
