/**
 * 数据字典 hook 存根
 * 实际业务接入时替换为真实 API 调用
 */
import { useQuery } from '@tanstack/react-query'

export interface DictionaryItem {
  code: string
  name: string
  is_active: boolean
  sort_order: number
  description?: string
}

export function useDictionaryItems(dictCode: string) {
  return useQuery<DictionaryItem[]>({
    queryKey: ['dictionary', dictCode],
    queryFn: async () => {
      return []
    },
    staleTime: 5 * 60 * 1000,
  })
}
