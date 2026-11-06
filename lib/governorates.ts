/**
 * Iraq's governorates, as the codes the backend stores. Baghdad and Basra first,
 * then the rest in Arabic alphabetical order; names live in i18n
 * (`governorates.names.*`).
 */
export const GOVERNORATES = [
  'baghdad',
  'basra',
  'anbar',
  'erbil',
  'babil',
  'halabja',
  'duhok',
  'diyala',
  'dhi_qar',
  'sulaymaniyah',
  'salah_al_din',
  'qadisiyah',
  'karbala',
  'kirkuk',
  'muthanna',
  'maysan',
  'najaf',
  'nineveh',
  'wasit',
] as const

export type Governorate = (typeof GOVERNORATES)[number]

/** Null for an account that has not set one, or a code this build does not know. */
export function toGovernorate(value: string | null | undefined): Governorate | null {
  return GOVERNORATES.find((g) => g === value) ?? null
}
