export interface EcrfQuestion {
  id: string
  type: string
  title: string
  required?: boolean
  options?: Array<{ label: string; value: string }>
  min?: number
  max?: number
  unit?: string
  repeat?: number
  auto_average?: boolean
  placeholder?: string
}

export interface EcrfTemplate {
  id: number
  name: string
  schema: { questions: EcrfQuestion[] }
  is_self_report?: boolean
}

export interface EcrfRecord {
  id: number
  template_id?: number
  data?: Record<string, unknown>
  status?: 'draft' | 'submitted' | 'verified' | string
}
