import { compareVersions, mustUpdate, APP_KEY, type AppMinVersions } from './app-version'

const mins = (ios: string, android: string): AppMinVersions => {
  const out: AppMinVersions = { rider: { ios: '0.0.0', android: '0.0.0' }, captain: { ios: '0.0.0', android: '0.0.0' } }
  out[APP_KEY] = { ios, android }
  return out
}

describe('compareVersions', () => {
  it('compares part by part as numbers', () => {
    expect(compareVersions('2.2.0', '2.2.0')).toBe(0)
    expect(compareVersions('2.2.0', '2.2.1')).toBe(-1)
    expect(compareVersions('2.10.0', '2.9.9')).toBe(1)
    expect(compareVersions('3.0.0', '2.99.99')).toBe(1)
    expect(compareVersions('1.9.0', '10.0.0')).toBe(-1)
  })

  it('returns null for anything that is not MAJOR.MINOR.PATCH', () => {
    expect(compareVersions('2.2', '2.2.0')).toBeNull()
    expect(compareVersions('2.2.0', 'v2.2.0')).toBeNull()
    expect(compareVersions('', '1.0.0')).toBeNull()
  })
})

describe('mustUpdate', () => {
  it('blocks only when the installed version is below this platform minimum', () => {
    expect(mustUpdate('2.2.0', mins('2.3.0', '0.0.0'), 'ios')).toBe(true)
    expect(mustUpdate('2.2.0', mins('2.3.0', '0.0.0'), 'android')).toBe(false)
    expect(mustUpdate('2.3.0', mins('2.3.0', '2.3.0'), 'ios')).toBe(false)
    expect(mustUpdate('2.4.0', mins('2.3.0', '2.3.0'), 'android')).toBe(false)
  })

  it('never blocks on the 0.0.0 default', () => {
    expect(mustUpdate('1.0.0', mins('0.0.0', '0.0.0'), 'ios')).toBe(false)
  })

  it('lets the user in when anything is unknown', () => {
    expect(mustUpdate(undefined, mins('9.0.0', '9.0.0'), 'ios')).toBe(false)
    expect(mustUpdate('2.2.0', undefined, 'ios')).toBe(false)
    expect(mustUpdate('2.2.0', mins('9.0.0', '9.0.0'), 'web')).toBe(false)
    expect(mustUpdate('2.2.0', mins('garbage', '9.0.0'), 'ios')).toBe(false)
    expect(mustUpdate('2.2.0', {} as AppMinVersions, 'ios')).toBe(false)
  })
})
