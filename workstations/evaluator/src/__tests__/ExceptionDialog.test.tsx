/**
 * ExceptionDialog 组件测试
 *
 * 验证：表单渲染、类型选择、严重程度选择、描述验证、提交
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ExceptionDialog, ExceptionFloatingButton } from '../components/ExceptionDialog'

vi.mock('@cn-kis/api-client', () => ({
  evaluatorApi: {
    reportException: vi.fn().mockResolvedValue({
      data: { exception_id: 42, auto_deviation: false },
    }),
  },
}))

describe('ExceptionDialog', () => {
  const defaultProps = {
    workOrderId: 100,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  }

  it('renders dialog header', () => {
    render(<ExceptionDialog {...defaultProps} />)

    expect(screen.getByText('上报异常')).toBeInTheDocument()
    expect(screen.getByText('WO#100')).toBeInTheDocument()
  })

  it('renders all exception types', () => {
    render(<ExceptionDialog {...defaultProps} />)

    expect(screen.getByText('技术问题')).toBeInTheDocument()
    expect(screen.getByText('设备故障')).toBeInTheDocument()
    expect(screen.getByText('环境异常')).toBeInTheDocument()
    expect(screen.getByText('受试者问题')).toBeInTheDocument()
    expect(screen.getByText('质量问题')).toBeInTheDocument()
    expect(screen.getByText('资源不可用')).toBeInTheDocument()
    expect(screen.getByText('延迟')).toBeInTheDocument()
    expect(screen.getByText('其他')).toBeInTheDocument()
  })

  it('renders all severity levels', () => {
    render(<ExceptionDialog {...defaultProps} />)

    expect(screen.getByText('低')).toBeInTheDocument()
    expect(screen.getByText('中')).toBeInTheDocument()
    expect(screen.getByText('高')).toBeInTheDocument()
    expect(screen.getByText('严重')).toBeInTheDocument()
  })

  it('submit button disabled without description', () => {
    render(<ExceptionDialog {...defaultProps} />)

    expect(screen.getByText('确认上报')).toBeDisabled()
  })

  it('submit button enabled with description', () => {
    render(<ExceptionDialog {...defaultProps} />)

    const textarea = screen.getByPlaceholderText(/请详细描述异常情况/)
    fireEvent.change(textarea, { target: { value: '测量值波动较大' } })

    expect(screen.getByText('确认上报')).not.toBeDisabled()
  })

  it('shows error for empty description submission', () => {
    render(<ExceptionDialog {...defaultProps} />)

    // Try to submit with spaces only
    const textarea = screen.getByPlaceholderText(/请详细描述异常情况/)
    fireEvent.change(textarea, { target: { value: '   ' } })

    expect(screen.getByText('确认上报')).toBeDisabled()
  })

  it('shows critical severity warning', () => {
    render(<ExceptionDialog {...defaultProps} />)

    fireEvent.click(screen.getByText('严重'))
    expect(screen.getByText(/严重异常将自动创建偏差记录/)).toBeInTheDocument()
  })

  it('shows high severity warning', () => {
    render(<ExceptionDialog {...defaultProps} />)

    fireEvent.click(screen.getByText('高'))
    expect(screen.getByText(/高级别异常将自动通知上级/)).toBeInTheDocument()
  })

  it('calls onClose when cancel clicked', () => {
    const onClose = vi.fn()
    render(<ExceptionDialog {...defaultProps} onClose={onClose} />)

    fireEvent.click(screen.getByText('取消'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('submits exception and calls onSuccess', async () => {
    const onSuccess = vi.fn()
    const onClose = vi.fn()

    render(
      <ExceptionDialog
        workOrderId={100}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    // Fill description
    fireEvent.change(screen.getByPlaceholderText(/请详细描述异常情况/), {
      target: { value: '仪器探头接触不良' },
    })

    // Submit
    fireEvent.click(screen.getByText('确认上报'))

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith({
        exception_id: 42,
        auto_deviation: false,
      })
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('allows selecting different exception type', () => {
    render(<ExceptionDialog {...defaultProps} />)

    fireEvent.click(screen.getByText('设备故障'))
    // Should visually highlight selected type
    const btn = screen.getByText('设备故障')
    expect(btn.className).toContain('indigo')
  })

  it('has impact analysis field', () => {
    render(<ExceptionDialog {...defaultProps} />)

    const impactField = screen.getByPlaceholderText(/对工单执行、数据质量/)
    expect(impactField).toBeInTheDocument()
  })
})

describe('ExceptionFloatingButton', () => {
  it('renders floating button', () => {
    render(<ExceptionFloatingButton onClick={vi.fn()} />)
    expect(screen.getByTitle('上报异常')).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<ExceptionFloatingButton onClick={onClick} />)

    fireEvent.click(screen.getByTitle('上报异常'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
