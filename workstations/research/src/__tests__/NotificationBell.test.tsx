import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { NotificationBell } from '../components/NotificationBell'

const markReadFn = vi.fn().mockResolvedValue({ code: 200 })

vi.mock('@cn-kis/api-client', () => ({
  notificationApi: {
    inbox: vi.fn().mockResolvedValue({
      data: {
        items: [
          { id: 1, title: '通知1', status: 'sent', create_time: '2026-01-01T00:00:00' },
          { id: 2, title: '通知2', status: 'sent', create_time: '2026-01-02T00:00:00' },
        ],
        unread_count: 2,
        total: 2,
      },
    }),
    markRead: markReadFn,
  },
}))

function renderBell(overrideInbox?: any) {
  if (overrideInbox) {
    const { notificationApi } = require('@cn-kis/api-client')
    notificationApi.inbox.mockResolvedValueOnce(overrideInbox)
  }
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('NotificationBell', () => {
  it('shows badge when unread > 0', async () => {
    renderBell()
    expect(await screen.findByText('2')).toBeInTheDocument()
  })

  it('shows 99+ when unread > 99', async () => {
    renderBell({
      data: { items: [], unread_count: 150, total: 150 },
    })
    expect(await screen.findByText('99+')).toBeInTheDocument()
  })

  it('hides badge when unread is 0', async () => {
    renderBell({
      data: { items: [], unread_count: 0, total: 0 },
    })
    await screen.findByTitle('通知')
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('toggles dropdown on click', async () => {
    renderBell()
    await screen.findByText('2')

    const bell = screen.getByTitle('通知')
    fireEvent.click(bell)

    expect(await screen.findByText('通知1')).toBeInTheDocument()
    expect(screen.getByText('通知2')).toBeInTheDocument()
  })
})
