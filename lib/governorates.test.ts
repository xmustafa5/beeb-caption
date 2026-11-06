import en from '@/i18n/en.json'
import ar from '@/i18n/ar.json'
import ckb from '@/i18n/ckb.json'
import { GOVERNORATES, toGovernorate } from './governorates'

describe('governorates', () => {
  it('lists all 19 and names each one in every language', () => {
    expect(new Set(GOVERNORATES).size).toBe(19)
    for (const names of [en.governorates.names, ar.governorates.names, ckb.governorates.names]) {
      expect(Object.keys(names).sort()).toEqual([...GOVERNORATES].sort())
    }
  })

  it('reads a missing or unknown code as not set', () => {
    expect(toGovernorate('basra')).toBe('basra')
    expect(toGovernorate(null)).toBeNull()
    expect(toGovernorate('gotham')).toBeNull()
  })
})
