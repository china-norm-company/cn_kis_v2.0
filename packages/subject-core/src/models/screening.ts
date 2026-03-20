export interface MyScreeningStatusEntry {
  registration_id: number
  registration_no: string
  reg_status: string
  reg_date: string | null
  pre_screening: {
    result?: string
    date?: string
    notes?: string
  } | null
  screening: {
    result?: string
    date?: string
    notes?: string
  } | null
  enrollment: {
    status?: string
    date?: string
  } | null
}
