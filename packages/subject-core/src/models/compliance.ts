export interface MyComplianceData {
  latest_score: number
  latest_rating: string
  history: Array<{
    id: number
    rating: string
    evaluation_date: string
    overall_score: number | null
  }>
}
