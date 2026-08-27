import { importOptionalPeer } from './optionalPeerImport.js'

const moduleNotFound = (specifier: string): NodeJS.ErrnoException => {
  const error: NodeJS.ErrnoException = new Error(
    `Cannot find package '${specifier}' imported from /app/node_modules/@lokalise/fastify-extras/dist/index.js`,
  )
  error.code = 'ERR_MODULE_NOT_FOUND'

  return error
}

describe('importOptionalPeer', () => {
  it('returns the module when it is installed', async () => {
    const module = { default: 'plugin' }

    await expect(
      importOptionalPeer('@scalar/fastify-api-reference', async () => module),
    ).resolves.toBe(module)
  })

  it('names the package to install when it is missing', async () => {
    const promise = importOptionalPeer('@scalar/fastify-api-reference', () => {
      throw moduleNotFound('@scalar/fastify-api-reference')
    })

    await expect(promise).rejects.toThrow(
      /apiDocumentationPlugin requires "@scalar\/fastify-api-reference", which is not installed/,
    )
  })

  it('keeps the resolution failure as the cause', async () => {
    const cause = moduleNotFound('@scalar/fastify-api-reference')

    await expect(
      importOptionalPeer('@scalar/fastify-api-reference', () => {
        throw cause
      }),
    ).rejects.toMatchObject({ cause })
  })

  /**
   * A broken import *inside* the package fails with the same error code, and
   * turning that into "install this package" would send the reader looking for
   * a dependency that is already there.
   */
  it('rethrows a resolution failure for some other specifier untouched', async () => {
    const cause = moduleNotFound('some-transitive-dependency')

    await expect(
      importOptionalPeer('@scalar/fastify-api-reference', () => {
        throw cause
      }),
    ).rejects.toBe(cause)
  })

  it('rethrows a failure that is not a missing module untouched', async () => {
    const cause = new Error('the package threw while initialising')

    await expect(
      importOptionalPeer('@scalar/fastify-api-reference', () => {
        throw cause
      }),
    ).rejects.toBe(cause)
  })
})
