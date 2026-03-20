export interface UIAdapter {
  toast(params: { title: string; icon?: 'none' | 'success'; duration?: number }): void
  showLoading?(params: { title: string; mask?: boolean }): void
  hideLoading?(): void
  modal?(params: { title: string; content: string; showCancel?: boolean }): Promise<{ confirm: boolean }>
}
