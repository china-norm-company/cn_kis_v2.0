/**
 * DetectionForm 组件测试
 *
 * 验证：数据输入、自动计算、超范围警告、提交
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DetectionForm } from '../components/DetectionForm'

describe('DetectionForm', () => {
  const defaultProps = {
    detectionName: 'Corneometer 角质层含水量',
    onSubmit: vi.fn(),
  }

  it('renders form title', () => {
    render(<DetectionForm {...defaultProps} />)
    expect(screen.getByText(/Corneometer 角质层含水量 数据录入/)).toBeInTheDocument()
  })

  it('renders default measurement points', () => {
    render(<DetectionForm {...defaultProps} />)
    expect(screen.getByText('左颊')).toBeInTheDocument()
    expect(screen.getByText('右颊')).toBeInTheDocument()
    expect(screen.getByText('额头')).toBeInTheDocument()
    expect(screen.getByText('下颏')).toBeInTheDocument()
  })

  it('renders custom measurement points', () => {
    render(
      <DetectionForm
        {...defaultProps}
        measurementPoints={[
          { name: 'T区', code: 'T_ZONE', repeat: 2 },
          { name: 'U区', code: 'U_ZONE', repeat: 2 },
        ]}
      />,
    )
    expect(screen.getByText('T区')).toBeInTheDocument()
    expect(screen.getByText('U区')).toBeInTheDocument()
  })

  it('renders correct number of input fields', () => {
    render(
      <DetectionForm
        {...defaultProps}
        measurementPoints={[
          { name: 'A', code: 'A', repeat: 3 },
          { name: 'B', code: 'B', repeat: 3 },
        ]}
      />,
    )
    const inputs = screen.getAllByPlaceholderText('--')
    expect(inputs).toHaveLength(6) // 2 points × 3 repeats
  })

  it('shows normal range when provided', () => {
    render(
      <DetectionForm
        {...defaultProps}
        normalRange={{ min: 20, max: 80, unit: 'AU' }}
      />,
    )
    expect(screen.getByText(/正常范围: 20 - 80 AU/)).toBeInTheDocument()
  })

  it('submit button disabled when fields empty', () => {
    render(<DetectionForm {...defaultProps} />)
    expect(screen.getByText('提交检测数据')).toBeDisabled()
  })

  it('displays statistics section', () => {
    render(<DetectionForm {...defaultProps} />)
    expect(screen.getByText('总平均值:')).toBeInTheDocument()
    expect(screen.getByText('标准差:')).toBeInTheDocument()
  })

  it('shows out-of-range warning for values below minimum', () => {
    render(
      <DetectionForm
        {...defaultProps}
        measurementPoints={[{ name: '测试部位', code: 'TEST', repeat: 1 }]}
        normalRange={{ min: 20, max: 80, unit: 'AU' }}
      />,
    )

    const input = screen.getByPlaceholderText('--')
    fireEvent.change(input, { target: { value: '10' } })

    expect(screen.getByText('检测值超出正常范围')).toBeInTheDocument()
    const matches = screen.getAllByText(/测试部位/)
    expect(matches.length).toBeGreaterThanOrEqual(2) // table cell + warning
  })

  it('submit button enabled when all fields filled', () => {
    render(
      <DetectionForm
        {...defaultProps}
        measurementPoints={[{ name: 'A', code: 'A', repeat: 1 }]}
      />,
    )

    const input = screen.getByPlaceholderText('--')
    fireEvent.change(input, { target: { value: '42.5' } })

    expect(screen.getByText('提交检测数据')).not.toBeDisabled()
  })

  it('calls onSubmit with computed data', () => {
    const onSubmit = vi.fn()
    render(
      <DetectionForm
        {...defaultProps}
        measurementPoints={[{ name: 'A', code: 'A', repeat: 1 }]}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('--'), { target: { value: '42.5' } })
    fireEvent.click(screen.getByText('提交检测数据'))

    expect(onSubmit).toHaveBeenCalledOnce()
    const result = onSubmit.mock.calls[0][0]

    expect(result).toHaveProperty('measurements')
    expect(result).toHaveProperty('averages')
    expect(result).toHaveProperty('overall_average')
    expect(result).toHaveProperty('overall_std')
    expect(result).toHaveProperty('out_of_range')
    expect(result).toHaveProperty('raw_data')
    expect(result.overall_average).toBe(42.5)
  })

  it('computes average correctly for multiple repeats', () => {
    const onSubmit = vi.fn()
    render(
      <DetectionForm
        {...defaultProps}
        measurementPoints={[{ name: 'A', code: 'A', repeat: 3 }]}
        onSubmit={onSubmit}
      />,
    )

    const inputs = screen.getAllByPlaceholderText('--')
    fireEvent.change(inputs[0], { target: { value: '40' } })
    fireEvent.change(inputs[1], { target: { value: '42' } })
    fireEvent.change(inputs[2], { target: { value: '44' } })

    fireEvent.click(screen.getByText('提交检测数据'))

    expect(onSubmit).toHaveBeenCalledOnce()
    const result = onSubmit.mock.calls[0][0]
    expect(result.averages.A).toBe(42)  // (40+42+44)/3
    expect(result.overall_average).toBe(42)
  })

  it('shows submitting state', () => {
    render(<DetectionForm {...defaultProps} isSubmitting={true} />)
    expect(screen.getByText('提交中...')).toBeInTheDocument()
  })

  it('column headers include repeat labels', () => {
    render(
      <DetectionForm
        {...defaultProps}
        measurementPoints={[{ name: 'X', code: 'X', repeat: 3 }]}
      />,
    )
    expect(screen.getByText('第 1 次')).toBeInTheDocument()
    expect(screen.getByText('第 2 次')).toBeInTheDocument()
    expect(screen.getByText('第 3 次')).toBeInTheDocument()
  })
})
