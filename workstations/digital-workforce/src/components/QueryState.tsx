import { useFeishuContext } from '@cn-kis/feishu-sdk'

interface QueryStateProps {
  loadingText?: string
  error?: unknown
}

export function QueryLoading({ loadingText = '加载中...' }: Pick<QueryStateProps, 'loadingText'>) {
  return <div className="flex items-center justify-center py-20 text-sm text-slate-500">{loadingText}</div>
}

export function QueryError({ error }: Pick<QueryStateProps, 'error'>) {
  const message = error instanceof Error ? error.message : '加载失败'
  const needLogin = message === '请先登录' || message.includes('未授权')
  const { login } = useFeishuContext()

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <p className="mb-2">{message}</p>
      {needLogin && (
        <button
          type="button"
          onClick={() => login()}
          className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
        >
          重新登录
        </button>
      )}
    </div>
  )
}
