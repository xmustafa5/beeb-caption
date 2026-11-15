import { AxiosError, AxiosHeaders } from 'axios'
import { otpSendErrorKey, otpVerifyErrorKey } from './otp-errors'

function httpError(status: number, error: string): AxiosError {
  const config = { headers: new AxiosHeaders() }
  return new AxiosError('failed', String(status), config as never, {}, {
    status,
    statusText: '',
    data: { error },
    headers: {},
    config: config as never,
  })
}

const offline = new AxiosError('offline', 'ERR_NETWORK', { headers: new AxiosHeaders() } as never)

describe('otpSendErrorKey', () => {
  it('reads the 400 send limit as rate limited', () => {
    expect(otpSendErrorKey(httpError(400, 'rate limited: too many OTP requests'))).toBe('auth.otpRateLimited')
    expect(otpSendErrorKey(httpError(429, ''))).toBe('auth.otpRateLimited')
  })
  it('reads a bad number as an invalid phone', () => {
    expect(otpSendErrorKey(httpError(400, 'bad request: invalid phone number'))).toBe('auth.phoneInvalid')
  })
  it('falls back to a generic send failure', () => {
    expect(otpSendErrorKey(httpError(500, 'internal'))).toBe('auth.otpSendFailed')
    expect(otpSendErrorKey(offline)).toBe('common.networkError')
  })
})

describe('otpVerifyErrorKey', () => {
  it('asks for a new code after too many tries', () => {
    expect(otpVerifyErrorKey(httpError(400, 'bad request: too many OTP attempts'))).toBe('captain.auth.otpTooManyTries')
  })
  it('tells a wrong code apart from a check that could not run', () => {
    expect(otpVerifyErrorKey(httpError(401, 'unauthorized'))).toBe('captain.auth.otpWrong')
    expect(otpVerifyErrorKey(httpError(503, 'otp_check_unavailable'))).toBe('captain.auth.otpCheckUnavailable')
  })
  it('falls back to a generic verify failure', () => {
    expect(otpVerifyErrorKey(httpError(400, 'bad request: something else'))).toBe('captain.auth.otpVerifyFailed')
    expect(otpVerifyErrorKey(offline)).toBe('common.networkError')
  })
})
