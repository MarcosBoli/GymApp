import { describe, expect, it } from 'vitest'
import { AI_ERROR_MESSAGES, aiError, aiErrorFromResponse, isAiErrorCode } from './aiErrors'

describe('aiErrors', () => {
  it('todos los códigos tienen mensaje en español no vacío', () => {
    for (const [code, msg] of Object.entries(AI_ERROR_MESSAGES)) {
      expect(msg.length, code).toBeGreaterThan(10)
    }
  })

  it('isAiErrorCode', () => {
    expect(isAiErrorCode('no_credit')).toBe(true)
    expect(isAiErrorCode('toString')).toBe(false)
    expect(isAiErrorCode(3)).toBe(false)
  })

  it('usa el código del JSON del servidor', () => {
    expect(aiErrorFromResponse(402, { error: { code: 'no_credit', message: 'x' } })).toEqual(aiError('no_credit'))
  })

  it.each([
    [504, 'FUNCTION_INVOCATION_TIMEOUT', 'timeout'],
    [408, null, 'timeout'],
    [404, 'The page could not be found', 'not_deployed'],
    [413, 'FUNCTION_PAYLOAD_TOO_LARGE', 'payload_too_large'],
    [401, null, 'unauthorized'],
    [429, null, 'rate_limited'],
    [500, { error: { code: 'desconocido' } }, 'server_error'],
    [502, undefined, 'server_error'],
  ])('sin JSON reconocible: %d → %s', (status, body, code) => {
    expect(aiErrorFromResponse(status, body).code).toBe(code)
  })
})
