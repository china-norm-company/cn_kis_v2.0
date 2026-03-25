export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/phone-login/index',
    'pages/bind-phone/index',
    'pages/identity-verify/index',
    'pages/consent/index',
    'pages/visit/index',
    'pages/questionnaire/index',
    'pages/profile/index',
    'pages/report/index',
    'pages/myqrcode/index',
    'pages/technician/index',
    'pages/technician/workorder-detail',
    'pages/appointment/index',
    'pages/payment/index',
    'pages/support/index',
    'pages/register/index',
    'pages/report/history',
    'pages/queue/index',
    'pages/projects/index',
    'pages/referral/index',
    'pages/checkin/index',
    'pages/sample-confirm/index',
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
    'pages/qa-patrol/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#2B6CB0',
    navigationBarTitleText: 'UTest',
    navigationBarTextStyle: 'white'
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
        selectedIconPath: 'assets/tab-home-active.png'
      },
      {
        pagePath: 'pages/visit/index',
        text: '访视',
        iconPath: 'assets/tab-visit.png',
        selectedIconPath: 'assets/tab-visit-active.png'
      },
      {
        pagePath: 'pages/profile/index',
        text: '我的',
        iconPath: 'assets/tab-profile.png',
        selectedIconPath: 'assets/tab-profile-active.png'
      }
    ]
  }
})
