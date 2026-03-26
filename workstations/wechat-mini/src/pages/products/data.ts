import type { MyProductItem, MyProductReminderItem } from '@cn-kis/subject-core'

type ItemsEnvelope<T> = {
  code?: number
  data?: {
    items?: T[]
  } | null
} | null | undefined

export function resolveServerProductData(
  productsRes: ItemsEnvelope<MyProductItem>,
  remindersRes: ItemsEnvelope<MyProductReminderItem>,
): { items: MyProductItem[]; reminders: MyProductReminderItem[] } | null {
  if (productsRes?.code !== 200) return null
  return {
    items: productsRes.data?.items || [],
    reminders: remindersRes?.data?.items || [],
  }
}
