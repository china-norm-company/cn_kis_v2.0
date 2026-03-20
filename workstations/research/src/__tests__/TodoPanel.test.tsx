import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TodoPanel } from '../components/TodoPanel'

const EMPTY_SUMMARY = {
  approvals: 0, overdue_workorders: 0, pending_changes: 0,
  upcoming_visits: 0, unread_notifications: 0, total: 0,
}

function makeTodo(overrides: Partial<Parameters<typeof TodoPanel>[0]['items'][0]> = {}) {
  return {
    id: `todo-${Math.random()}`,
    type: 'approval',
    title: 'Test Todo',
    detail: 'detail',
    entity_id: 1,
    entity_type: 'workflow_instance',
    urgency: 'medium' as const,
    created_at: null,
    link: '/test',
    ...overrides,
  }
}

describe('TodoPanel', () => {
  it('renders grouped items with 4 summary cards', () => {
    const items = [
      makeTodo({ type: 'approval', title: '审批任务' }),
      makeTodo({ type: 'overdue_workorder', title: '逾期工单' }),
      makeTodo({ type: 'pending_change', title: '待处理变更' }),
      makeTodo({ type: 'upcoming_visit', title: '近期访视' }),
    ]
    const summary = { ...EMPTY_SUMMARY, approvals: 1, overdue_workorders: 1, pending_changes: 1, upcoming_visits: 1, total: 4 }

    render(
      <MemoryRouter>
        <TodoPanel items={items} summary={summary} />
      </MemoryRouter>,
    )

    expect(screen.getByText('待审批')).toBeInTheDocument()
    expect(screen.getByText('逾期工单')).toBeInTheDocument()
    expect(screen.getByText('待处理变更')).toBeInTheDocument()
    expect(screen.getByText('近期访视')).toBeInTheDocument()
  })

  it('sorts by urgency - critical before high', () => {
    const items = [
      makeTodo({ id: 'high-1', urgency: 'high', title: 'High item' }),
      makeTodo({ id: 'critical-1', urgency: 'critical', title: 'Critical item' }),
    ]

    render(
      <MemoryRouter>
        <TodoPanel items={items} summary={{ ...EMPTY_SUMMARY, total: 2 }} />
      </MemoryRouter>,
    )

    const links = screen.getAllByRole('link')
    expect(links[0]).toHaveTextContent('Critical item')
    expect(links[1]).toHaveTextContent('High item')
  })

  it('shows empty state when no items', () => {
    render(
      <MemoryRouter>
        <TodoPanel items={[]} summary={EMPTY_SUMMARY} />
      </MemoryRouter>,
    )

    expect(screen.getByText('暂无待办事项')).toBeInTheDocument()
  })

  it('summary counts match items length', () => {
    const summary = { ...EMPTY_SUMMARY, approvals: 3, total: 3 }
    const items = [
      makeTodo({ type: 'approval' }),
      makeTodo({ type: 'approval' }),
      makeTodo({ type: 'approval' }),
    ]

    render(
      <MemoryRouter>
        <TodoPanel items={items} summary={summary} />
      </MemoryRouter>,
    )

    expect(screen.getByText('3')).toBeInTheDocument()
  })
})
