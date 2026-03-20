/**
 * 合同详情抽屉
 *
 * 从项目商务卡片展开，展示合同信息、付款条款和回款进度
 */
import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Badge } from '@cn-kis/ui-kit'
import { financeApi } from '@cn-kis/api-client'
import type { Contract, ContractPaymentTerm } from '@cn-kis/api-client'
import { X, FileText, ArrowRightLeft, CheckCircle } from 'lucide-react'

interface ContractDetailDrawerProps {
  isOpen: boolean
  onClose: () => void
  contractId?: number
  quoteId?: number
  client?: string
}

function formatAmount(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '¥0'
  if (num >= 10000) return `¥${(num / 10000).toFixed(1)}万`
  return `¥${num.toLocaleString()}`
}

export function ContractDetailDrawer({
  isOpen,
  onClose,
  contractId,
  quoteId,
  client,
}: ContractDetailDrawerProps) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (isOpen) document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  const { data: contractRes, isLoading: contractLoading } = useQuery({
    queryKey: ['finance', 'contract', contractId],
    queryFn: () => financeApi.getContract(contractId!),
    enabled: isOpen && !!contractId,
  })

  const { data: termsRes } = useQuery({
    queryKey: ['finance', 'contract-terms', contractId],
    queryFn: () => financeApi.listPaymentTerms(contractId!),
    enabled: isOpen && !!contractId,
  })

  const convertMutation = useMutation({
    mutationFn: () => financeApi.convertToContract(quoteId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'business-pipeline'] })
      onClose()
    },
  })

  const contract: Contract | undefined = contractRes?.data
  const terms: ContractPaymentTerm[] = termsRes?.data?.items ?? []

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-white shadow-xl overflow-y-auto animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-400" />
            合同详情
          </h2>
          <button onClick={onClose} aria-label="关闭" className="p-1.5 rounded-lg hover:bg-slate-100 transition">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {contractLoading ? (
            <div className="py-12 text-center text-sm text-slate-400">加载中...</div>
          ) : contract ? (
            <>
              {/* 基本信息 */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">基本信息</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-slate-500">合同编号</span>
                    <div className="mt-0.5 font-medium text-slate-800">{contract.code}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">状态</span>
                    <div className="mt-0.5">
                      <Badge
                        variant={contract.status === 'active' ? 'success' : contract.status === 'completed' ? 'default' : 'warning'}
                      >
                        {contract.status}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">客户</span>
                    <div className="mt-0.5 font-medium text-slate-800">{contract.client}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">合同金额</span>
                    <div className="mt-0.5 font-semibold text-emerald-600">{formatAmount(contract.amount)}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">签订日期</span>
                    <div className="mt-0.5 text-slate-800">{contract.signed_date || '-'}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">有效期</span>
                    <div className="mt-0.5 text-slate-800">
                      {contract.start_date && contract.end_date
                        ? `${contract.start_date} ~ ${contract.end_date}`
                        : '-'}
                    </div>
                  </div>
                </div>
              </div>

              {/* 付款条款 */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">付款条款</h3>
                {terms.length === 0 ? (
                  <p className="text-sm text-slate-400">暂无付款条款</p>
                ) : (
                  <div className="space-y-2">
                    {terms.map((term) => (
                      <div
                        key={term.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100"
                      >
                        <CheckCircle className="w-4 h-4 text-slate-300 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-700">{term.milestone}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {term.percentage}% · {formatAmount(term.amount)} · {term.payment_days}天
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 回款进度条 */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">回款进度</h3>
                <ReceivedProgress contractId={contract.id} totalAmount={parseFloat(contract.amount)} />
              </div>
            </>
          ) : quoteId ? (
            <div className="text-center py-12">
              <ArrowRightLeft className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-600 mb-1">该项目有报价但尚未创建合同</p>
              <p className="text-xs text-slate-400 mb-4">
                {client ? `客户: ${client}` : ''}
              </p>
              <Button
                onClick={() => convertMutation.mutate()}
                disabled={convertMutation.isPending}
              >
                {convertMutation.isPending ? '转换中...' : '报价转合同'}
              </Button>
              {convertMutation.isError && (
                <p className="text-sm text-red-600 mt-2">转换失败，报价可能不是已接受状态</p>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-sm text-slate-400">
              无合同数据
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ReceivedProgress({ contractId, totalAmount }: { contractId: number; totalAmount: number }) {
  const { data: paymentsRes } = useQuery({
    queryKey: ['finance', 'payments-for-contract', contractId],
    queryFn: () => financeApi.listPayments({ page_size: 100 }),
    enabled: !!contractId,
  })

  const payments = paymentsRes?.data?.items ?? []
  const totalReceived = payments.reduce((sum, p) => {
    const amt = parseFloat(p.actual_amount)
    return sum + (isNaN(amt) ? 0 : amt)
  }, 0)

  const pct = totalAmount > 0 ? Math.min((totalReceived / totalAmount) * 100, 100) : 0

  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-2">
        <span className="text-slate-500">已回款 / 合同额</span>
        <span className="font-semibold text-slate-800">
          {formatAmount(totalReceived)} / {formatAmount(totalAmount)}
        </span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2.5">
        <div
          className={`h-2.5 rounded-full transition-all ${
            pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-blue-500' : 'bg-amber-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-right text-xs text-slate-400 mt-1">{pct.toFixed(1)}%</div>
    </div>
  )
}
