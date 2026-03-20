export function normalizeDateText(value: unknown): string {
  if (!value) return ''
  const text = String(value)
  return text.slice(0, 10)
}

export function averageRepeatedNumbers(values: Array<number | string>): number | null {
  const nums = values
    .map((v) => Number(v))
    .filter((n) => !Number.isNaN(n))
  if (!nums.length) return null
  return Math.round((nums.reduce((acc, cur) => acc + cur, 0) / nums.length) * 100) / 100
}
