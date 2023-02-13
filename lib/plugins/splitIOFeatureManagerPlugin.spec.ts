import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'

import type { SplitIOOptions } from './splitIOFeatureManagerPlugin'
import { SplitIOFeatureManager, splitIOFeatureManagerPlugin } from './splitIOFeatureManagerPlugin'

declare module 'fastify' {}

async function initApp(opts?: SplitIOOptions) {
  const app = fastify()
  await app.register(splitIOFeatureManagerPlugin, opts)
  await app.ready()
  return app
}

describe('splitIOFeatureManagerPlugin', () => {
  let app: FastifyInstance
  afterAll(async () => {
    await app.close()
  })

  it('returns control treatment on disabled client', async () => {
    expect.assertions(1)
    const opts = {
      isEnabled: false,
      apiKey: '',
      debugMode: false,
    }

    app = await initApp(opts)
    const treatment = app.splitIOFeatureManager.getTreatment('', '')

    expect(treatment).toBe('control')
  })

  it('returns treatments from local file', async () => {
    expect.assertions(2)
    const opts = {
      isEnabled: true,
      apiKey: 'localhost',
      debugMode: false,
      localhostFilePath: '/lib/plugins/tests/.split.yaml',
    }

    app = await initApp(opts)
    const onTreatment = app.splitIOFeatureManager.getTreatment('mock_user_id', 'my_feature')
    const offTreatment = app.splitIOFeatureManager.getTreatment('unknown_id', 'my_feature')
    expect(onTreatment).toBe('on')
    expect(offTreatment).toBe('off')
  })

  it('returns control treatment with config on disabled client', async () => {
    expect.assertions(1)
    const opts = {
      isEnabled: false,
      apiKey: '',
      debugMode: false,
    }

    app = await initApp(opts)
    const treatment = app.splitIOFeatureManager.getTreatmentWithConfig('', '')

    expect(treatment).toStrictEqual({ config: null, treatment: 'control' })
  })

  it('returns false track on disabled client', async () => {
    expect.assertions(1)
    const opts = {
      isEnabled: false,
      apiKey: '',
      debugMode: false,
    }

    app = await initApp(opts)
    const trackResult = app.splitIOFeatureManager.track('', '', '')

    expect(trackResult).toBe(false)
  })

  it('shutdown running client', async () => {
    expect.assertions(1)
    const opts = {
      isEnabled: true,
      apiKey: 'localhost',
      debugMode: false,
      localhostFilePath: '/lib/plugins/tests/.split.yaml',
    }

    app = await initApp(opts)
    await app.close()
    const onTreatment = app.splitIOFeatureManager.getTreatment('mock_user_id', 'my_feature')

    expect(onTreatment).toBe('control')
  })

  it('shutdown not active client', async () => {
    expect.assertions(1)
    const opts = {
      isEnabled: false,
      apiKey: '',
      debugMode: false,
    }

    app = await initApp(opts)
    await app.splitIOFeatureManager.shutdown()
    const treatment = app.splitIOFeatureManager.getTreatment('', '')

    expect(treatment).toBe('control')
  })

  it('throw error on split io init', async () => {
    expect.assertions(1)
    const opts = {
      isEnabled: false,
      apiKey: '',
      debugMode: false,
    }

    jest.spyOn(SplitIOFeatureManager.prototype, 'init').mockRejectedValue(new Error(''))
    expect(async () => {
      await initApp(opts)
    }).toThrow()
  })
})
