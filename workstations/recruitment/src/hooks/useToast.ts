import { useState, useCallback } from 'react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: number
  type: ToastType
  message: string
}

let toastId = 0

const listeners: Set<(toast: ToastItem) => void> = new Set()
const dismissListeners: Set<(id: number) => void> = new Set()

function emit(type: ToastType, message: string) {
  toastId += 1
  const item: ToastItem = { id: toastId, type, message }
  listeners.forEach((fn) => fn(item))
  return item.id
}

function dismiss(id: number) {
  dismissListeners.forEach((fn) => fn(id))
}

export const toast = {
  success: (message: string) => emit('success', message),
  error: (message: string) => emit('error', message),
  warning: (message: string) => emit('warning', message),
  info: (message: string) => emit('info', message),
  dismiss,
}

export function useToastState() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((item: ToastItem) => {
    setToasts((prev) => [...prev, item])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== item.id))
    }, 4000)
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  useState(() => {
    listeners.add(addToast)
    dismissListeners.add(removeToast)
    return () => {
      listeners.delete(addToast)
      dismissListeners.delete(removeToast)
    }
  })

  return { toasts, removeToast }
}
