import 'intl-pluralrules'
import i18next from 'i18next'
import en from './en.json'
import ar from './ar.json'
import ckb from './ckb.json'

type Tree = { [k: string]: string | Tree }

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out[key] = v
    else Object.assign(out, flatten(v, key))
  }
  return out
}

const files = { en: flatten(en as Tree), ar: flatten(ar as Tree), ckb: flatten(ckb as Tree) }

// i18next plural suffixes: Arabic has six forms, English and Kurdish two, so a
// plural key is compared by its base name, not suffix by suffix.
const PLURAL = /_(zero|one|two|few|many|other)$/
const base = (key: string) => key.replace(PLURAL, '')

/** Plural bases: keys that have a `_one` form (a lone `reason_other` is just a name). */
function pluralBases(keys: string[]): Set<string> {
  return new Set(keys.filter((k) => k.endsWith('_one')).map(base))
}

describe('translation files', () => {
  it('have the same keys in en, ar and ckb (plural suffixes aside)', () => {
    const [enKeys, arKeys, ckbKeys] = [files.en, files.ar, files.ckb].map((f) => [...new Set(Object.keys(f).map(base))].sort())
    expect(arKeys).toEqual(enKeys)
    expect(ckbKeys).toEqual(enKeys)
  })

  it('give every plural the forms its language needs', () => {
    const need = { en: ['one', 'other'], ckb: ['one', 'other'], ar: ['zero', 'one', 'two', 'few', 'many', 'other'] }
    for (const lang of ['en', 'ar', 'ckb'] as const) {
      const keys = Object.keys(files[lang])
      for (const b of pluralBases(keys)) {
        for (const form of need[lang]) expect(keys).toContain(`${b}_${form}`)
      }
    }
  })

  it('never use Arabic-only letters in Kurdish', () => {
    // A language's own name is written in that language ("العربية" in the picker).
    const endonyms = new Set(['settings.arabic'])
    const bad = Object.entries(files.ckb).filter(([k, v]) => !endonyms.has(k) && /[يكةى]/.test(v))
    expect(bad).toEqual([])
  })
})

describe('rider-count plural', () => {
  const i18n = i18next.createInstance()
  beforeAll(async () => {
    await i18n.init({
      resources: { en: { translation: en }, ar: { translation: ar }, ckb: { translation: ckb } },
      lng: 'ar',
      fallbackLng: { ckb: ['ar', 'en'], default: ['en'] },
      interpolation: { escapeValue: false },
      showSupportNotice: false,
    })
  })
  const t = (lng: string, count: number) => i18n.t('captain.queue.roomRiders', { lng, count })

  it('uses the Arabic dual and the 3-10 / 11+ forms', () => {
    expect(t('ar', 1)).toBe('راكب واحد')
    expect(t('ar', 2)).toBe('راكبان')
    expect(t('ar', 3)).toBe('3 ركاب')
    expect(t('ar', 10)).toBe('10 ركاب')
    expect(t('ar', 11)).toBe('11 راكبًا')
  })

  it('uses one/other in English and Kurdish', () => {
    expect(t('en', 1)).toBe('1 rider')
    expect(t('en', 3)).toBe('3 riders')
    expect(t('ckb', 1)).toBe('1 سەرنشین')
    expect(t('ckb', 4)).toBe('4 سەرنشین')
  })
})
