import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'

import type { SplitIOOptions } from './splitIOFeatureManagerPlugin'
import { splitIOFeatureManagerPlugin } from './splitIOFeatureManagerPlugin'

declare module 'fastify' {}

async function initApp(opts?: SplitIOOptions) {
  const app = fastify()
  await app.register(splitIOFeatureManagerPlugin, opts)
  await app.ready()
  return app
}

describe('splitIOFeatureManagerPlugin custom request context', () => {
  let app: FastifyInstance
  afterAll(async () => {
    await app.close()
  })

  // it('returns disabled treatment', async () => {
  //   expect.assertions(1)
  //   const opts = {
  //     isEnabled: false,
  //     apiKey: '',
  //     debugMode: false,
  //   }
  //
  //   app = await initApp(opts)
  //   const treatment = app.splitIOFeatureManager.getTreatment('', '')
  //
  //   expect(treatment).toBe('disabled')
  // })
  // it('returns disabled treatment', async () => {
  //   expect.assertions(1)
  //   const opts = {
  //     isEnabled: true,
  //     apiKey: '',
  //     debugMode: false,
  //   }
  //
  //   app = await initApp(opts)
  //   const treatment = await app.splitIOFeatureManager.getTreatment('', '')
  //
  //   expect(treatment).toBe('control')
  // })
  it('returns localhost treatment', async () => {
    expect.assertions(1)
    const opts = {
      isEnabled: true,
      apiKey: 'localhost',
      debugMode: false,
      localhostFilePath: '../tests/.split.yaml',
    }

    app = await initApp(opts)
    const treatment = await app.splitIOFeatureManager.getTreatment('mock_user_id', 'my_feature')
    expect(treatment).toBe('on')
  })
})
