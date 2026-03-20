export interface AvailablePlanItem {
  id: number
  title: string
  protocol_title: string | null
  description: string | null
  remaining_slots: number | null
  start_date: string | null
  end_date: string | null
  criteria: Array<{
    is_mandatory: boolean
    type: string
    description: string
  }> | null
}
