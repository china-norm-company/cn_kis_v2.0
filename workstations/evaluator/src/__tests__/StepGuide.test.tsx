/**
 * StepGuide 组件测试
 *
 * 验证：步骤渲染、开始/完成/跳过操作、状态显示、顺序控制
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StepGuide } from '../components/StepGuide'
import type { ExperimentStep } from '@cn-kis/api-client'

const createSteps = (overrides?: Partial<ExperimentStep>[]): ExperimentStep[] => [
  {
    id: 1, step_number: 1, step_name: '准备仪器', step_description: '按照 SOP 准备检测仪器',
    estimated_duration_minutes: 5, status: 'pending',
    started_at: '', completed_at: '', actual_duration_minutes: 0,
    execution_data: {}, result: '', skip_reason: '',
    ...overrides?.[0],
  },
  {
    id: 2, step_number: 2, step_name: '受试者准备', step_description: '确认受试者状态',
    estimated_duration_minutes: 5, status: 'pending',
    started_at: '', completed_at: '', actual_duration_minutes: 0,
    execution_data: {}, result: '', skip_reason: '',
    ...overrides?.[1],
  },
  {
    id: 3, step_number: 3, step_name: '执行检测', step_description: '按照标准方法执行',
    estimated_duration_minutes: 15, status: 'pending',
    started_at: '', completed_at: '', actual_duration_minutes: 0,
    execution_data: {}, result: '', skip_reason: '',
    ...overrides?.[2],
  },
]

describe('StepGuide', () => {
  const defaultProps = {
    onStartStep: vi.fn(),
    onCompleteStep: vi.fn(),
    onSkipStep: vi.fn(),
  }

  it('renders all steps', () => {
    const steps = createSteps()
    render(<StepGuide steps={steps} {...defaultProps} />)

    expect(screen.getByText('准备仪器')).toBeInTheDocument()
    expect(screen.getByText('受试者准备')).toBeInTheDocument()
    expect(screen.getByText('执行检测')).toBeInTheDocument()
  })

  it('shows estimated duration', () => {
    const steps = createSteps()
    render(<StepGuide steps={steps} {...defaultProps} />)

    const fiveMinTexts = screen.getAllByText(/预计 5 分钟/)
    expect(fiveMinTexts.length).toBe(2)  // step 1 and step 2 both 5 min
    expect(screen.getByText(/预计 15 分钟/)).toBeInTheDocument()
  })

  it('shows start button only for first pending step', () => {
    const steps = createSteps()
    render(<StepGuide steps={steps} {...defaultProps} />)

    const startButtons = screen.getAllByText('开始')
    expect(startButtons).toHaveLength(1)
  })

  it('calls onStartStep when clicking start button', () => {
    const onStartStep = vi.fn()
    const steps = createSteps()
    render(<StepGuide steps={steps} {...defaultProps} onStartStep={onStartStep} />)

    fireEvent.click(screen.getByText('开始'))
    expect(onStartStep).toHaveBeenCalledWith(1)
  })

  it('shows complete button for in-progress step', () => {
    const steps = createSteps([
      { status: 'in_progress', started_at: new Date().toISOString() },
    ])
    render(<StepGuide steps={steps} {...defaultProps} />)

    expect(screen.getByText('完成此步骤')).toBeInTheDocument()
  })

  it('calls onCompleteStep when clicking complete', () => {
    const onCompleteStep = vi.fn()
    const steps = createSteps([
      { status: 'in_progress', started_at: new Date().toISOString() },
    ])
    render(<StepGuide steps={steps} {...defaultProps} onCompleteStep={onCompleteStep} />)

    fireEvent.click(screen.getByText('完成此步骤'))
    expect(onCompleteStep).toHaveBeenCalledWith(1)
  })

  it('shows skip button for in-progress step', () => {
    const steps = createSteps([
      { status: 'in_progress', started_at: new Date().toISOString() },
    ])
    render(<StepGuide steps={steps} {...defaultProps} />)

    expect(screen.getByText('跳过')).toBeInTheDocument()
  })

  it('shows skip reason dialog when clicking skip', () => {
    const steps = createSteps([
      { status: 'in_progress', started_at: new Date().toISOString() },
    ])
    render(<StepGuide steps={steps} {...defaultProps} />)

    fireEvent.click(screen.getByText('跳过'))
    expect(screen.getByText('跳过步骤')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('请填写跳过此步骤的原因...')).toBeInTheDocument()
  })

  it('skip confirm button disabled when reason empty', () => {
    const steps = createSteps([
      { status: 'in_progress', started_at: new Date().toISOString() },
    ])
    render(<StepGuide steps={steps} {...defaultProps} />)

    fireEvent.click(screen.getByText('跳过'))
    const confirmBtn = screen.getByText('确认跳过')
    expect(confirmBtn).toBeDisabled()
  })

  it('calls onSkipStep with reason', () => {
    const onSkipStep = vi.fn()
    const steps = createSteps([
      { status: 'in_progress', started_at: new Date().toISOString() },
    ])
    render(<StepGuide steps={steps} {...defaultProps} onSkipStep={onSkipStep} />)

    fireEvent.click(screen.getByText('跳过'))
    const textarea = screen.getByPlaceholderText('请填写跳过此步骤的原因...')
    fireEvent.change(textarea, { target: { value: '仪器需校准' } })
    fireEvent.click(screen.getByText('确认跳过'))

    expect(onSkipStep).toHaveBeenCalledWith(1, '仪器需校准')
  })

  it('renders completed steps with green checkmark', () => {
    const steps = createSteps([
      { status: 'completed', result: '正常', actual_duration_minutes: 4 },
    ])
    render(<StepGuide steps={steps} {...defaultProps} />)

    // Completed step should show actual duration
    expect(screen.getByText(/实际 4 分钟/)).toBeInTheDocument()
  })

  it('renders skipped step with badge', () => {
    const steps = createSteps([
      { status: 'skipped', skip_reason: '设备故障' },
    ])
    render(<StepGuide steps={steps} {...defaultProps} />)

    expect(screen.getByText('已跳过')).toBeInTheDocument()
  })

  it('shows skip reason when step expanded', () => {
    const steps = createSteps([
      { status: 'skipped', skip_reason: '设备故障' },
    ])
    render(<StepGuide steps={steps} {...defaultProps} />)

    // Expand the step
    fireEvent.click(screen.getByText('准备仪器'))
    expect(screen.getByText(/设备故障/)).toBeInTheDocument()
  })

  it('allows second step start when first is completed', () => {
    const steps = createSteps([
      { status: 'completed' },
      { status: 'pending' },
    ])
    render(<StepGuide steps={steps} {...defaultProps} />)

    const startButtons = screen.getAllByText('开始')
    expect(startButtons).toHaveLength(1)
  })

  it('allows second step start when first is skipped', () => {
    const steps = createSteps([
      { status: 'skipped', skip_reason: '测试' },
      { status: 'pending' },
    ])
    render(<StepGuide steps={steps} {...defaultProps} />)

    const startButtons = screen.getAllByText('开始')
    expect(startButtons).toHaveLength(1)
  })
})
