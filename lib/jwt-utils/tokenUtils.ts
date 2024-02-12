import type { JWT } from '@fastify/jwt'
import { AuthFailedError } from '@lokalise/node-core'

import { EmptyTokenError } from '../errors/publicErrors'

export function generateJwtToken(
  jwt: JWT,
  payload: Record<string, unknown>,
  ttlInSeconds: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    jwt.sign(payload, { expiresIn: ttlInSeconds }, (err, encoded) => {
      /* v8 ignore next 3 */
      if (err) {
        return reject(err)
      }
      /* v8 ignore next 3 */
      if (!encoded) {
        throw new EmptyTokenError()
      }
      resolve(encoded)
    })
  })
}

const hasCode = (error: unknown): error is { code: unknown } =>
  typeof error === 'object' && error !== null && 'code' in error

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function decodeJwtToken(jwt: JWT, encodedToken: string): Promise<any> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jwt.verify(encodedToken, (err: Error | null, decoded: any) => {
      /* v8 ignore next 3 */
      if (err) {
        return reject(err)
      }
      /* v8 ignore next 3 */
      if (!decoded) {
        throw new EmptyTokenError()
      }
      resolve(decoded)
    })
  }).catch((err) => {
    if (hasCode(err) && err.code === 'FAST_JWT_INVALID_SIGNATURE') {
      throw new AuthFailedError({ message: 'Auth error' })
    }
    throw err
  })
}
