/**
 * 占位页：新信息架构下尚未实现完整内容的页面，显示标题与简短说明。
 */
import { useLocation } from 'react-router-dom'

const TITLES: Record<string, string> = {
  '/roster': '数字员工花名册',
  '/positions': '岗位与分工',
  '/teams': '团队编制',
  '/workflows': '协作流程定义',
  '/executions': '流程执行实况',
  '/tasks': '任务看板',
  '/skills': '技能管理',
  '/permissions': '权限与数据范围',
  '/knowledge': '知识灌注',
  '/behavior': '行为策略配置',
  '/performance': '绩效仪表盘',
  '/value': '价值核算',
  '/growth': '能力成长曲线',
  '/audit': '行为审计',
  '/health': '通道健康与告警',
  '/gates': '验收门禁',
  '/upgrades': '升级管控',
  '/n8n': '高级编排 (n8n)',
}

const N8N_EDITOR_URL = import.meta.env.VITE_N8N_EDITOR_URL as string | undefined

export default function PlaceholderPage() {
  const { pathname } = useLocation()
  const title = TITLES[pathname] || '页面'
  const isN8n = pathname === '/n8n'
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold text-slate-800 mb-2">{title}</h1>
      {isN8n ? (
        <>
          <p className="text-slate-600">
            通过 n8n 编辑器定义数字员工协作工作流，可通过 MCP execute_workflow / search_workflows 或配置 n8n 实例地址对接。
          </p>
          {N8N_EDITOR_URL ? (
            <a
              href={N8N_EDITOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              打开 n8n 编辑器
            </a>
          ) : (
            <p className="text-sm text-slate-500">配置 VITE_N8N_EDITOR_URL 后显示「打开 n8n 编辑器」按钮。</p>
          )}
        </>
      ) : (
        <p className="text-slate-600">功能开发中，敬请期待。</p>
      )}
    </div>
  )
}
