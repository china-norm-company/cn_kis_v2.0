import type { EcrfQuestion } from '../models/questionnaire'

export interface ValidationError {
  fieldId: string
  message: string
}

export function validateEcrfForm(questions: EcrfQuestion[], formData: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = []
  questions.forEach((q) => {
    const value = formData[q.id]
    const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
    if (q.required && empty) {
      errors.push({ fieldId: q.id, message: `${q.title}为必填项` })
      return
    }
    if (q.type === 'number' && value !== undefined && value !== null && value !== '') {
      const n = Number(value)
      if (Number.isNaN(n)) {
        errors.push({ fieldId: q.id, message: `${q.title}需要填写数字` })
      } else {
        if (typeof q.min === 'number' && n < q.min) {
          errors.push({ fieldId: q.id, message: `${q.title}不能小于${q.min}` })
        }
        if (typeof q.max === 'number' && n > q.max) {
          errors.push({ fieldId: q.id, message: `${q.title}不能大于${q.max}` })
        }
      }
    }
  })
  return errors
}
