export function formatIqd(amount: number): string {
  const rounded = Math.round(amount)
  const withCommas = rounded.toLocaleString('en-US')
  return `${withCommas} IQD`
}

export function formatIqdAr(amount: number): string {
  const rounded = Math.round(amount)
  const withCommas = rounded.toLocaleString('en-US')
  return `${withCommas} د.ع`
}
