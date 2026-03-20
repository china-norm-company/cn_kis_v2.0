import { useCallback, useState } from 'react'

export function useListFetch<T>(loader: () => Promise<T[]>) {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const next = await loader()
      setItems(Array.isArray(next) ? next : [])
    } catch (e) {
      setError('加载失败')
    } finally {
      setLoading(false)
    }
  }, [loader])

  return { items, loading, error, reload, setItems }
}
