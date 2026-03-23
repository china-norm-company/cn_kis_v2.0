/**
 * 数据采集监察
 *
 * 嵌入 EDC BI Dashboard（Flask 服务，通过 Nginx /edc-dashboard/ 代理）
 * 提供仪器数据查询、趋势图表与分页明细。
 */

const EDC_DASHBOARD_URL = (() => {
  if (typeof window === 'undefined') return '/edc-dashboard'
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:5001'
  }
  return `${window.location.protocol}//${window.location.host}/edc-dashboard`
})()

export default function DataCollectionMonitorPage() {
  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 112px)' }}>
      <iframe
        src={EDC_DASHBOARD_URL}
        title="EDC BI Dashboard"
        className="flex-1 w-full border-0 rounded-lg"
        style={{ minHeight: 0 }}
      />
    </div>
  )
}
