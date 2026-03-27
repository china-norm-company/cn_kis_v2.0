import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { OpportunityForm } from '../components/OpportunityForm'

export function OpportunityEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()

  const from = (location.state as { from?: string } | null)?.from

  const goBack = () => {
    if (from) {
      navigate(from, { replace: true })
    } else {
      navigate(-1)
    }
  }

  if (!id) return null

  return (
    <OpportunityForm
      mode="edit"
      variant="page"
      opportunityId={id}
      onCancel={goBack}
      onSaved={() => {
        qc.invalidateQueries({ queryKey: ['opportunities'] })
        qc.invalidateQueries({ queryKey: ['opportunity-stats'] })
        qc.invalidateQueries({ queryKey: ['crm', 'opportunity', id] })
        qc.invalidateQueries({ queryKey: ['crm', 'opportunities', 'list', 'kanban'] })
        goBack()
      }}
    />
  )
}
