import * as path from 'path'

import { SplitFactory } from '@splitsoftware/splitio'
import type SplitIO from '@splitsoftware/splitio/types/splitio'
import type {
  Attributes,
  Properties,
  SplitKey,
  Treatment,
  TreatmentWithConfig,
} from '@splitsoftware/splitio/types/splitio'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

const DISABLED_TREATMENT: Treatment = 'disabled'

declare module 'fastify' {
  interface FastifyInstance {
    splitIOFeatureManager: SplitIOFeatureManager
  }
}

export interface SplitIOOptions {
  isEnabled: boolean
  apiKey: string
  debugMode: boolean
  localhostFilePath?: string
}

export class SplitIOFeatureManager {
  private readonly isEnabled: boolean
  private sdkReady = false
  private splitIOClient?: SplitIO.IClient

  private waitForSdk = async () => {
    while (!this.sdkReady) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  constructor(
    isSplitIOEnabled: boolean,
    apiKey: string,
    debug: boolean,
    localhostFilePath?: string,
  ) {
    if (isSplitIOEnabled) {
      const factory: SplitIO.ISDK = SplitFactory({
        core: {
          authorizationKey: localhostFilePath != null ? 'localhost' : apiKey,
        },
        features: localhostFilePath != null ? path.join(__dirname, localhostFilePath) : undefined,
        debug: debug,
      })
      this.splitIOClient = factory.client()
    }

    this.isEnabled = isSplitIOEnabled
  }

  public async getTreatment(
    key: SplitKey,
    splitName: string,
    attributes?: Attributes,
  ): Promise<Treatment> {
    await this.splitIOClient!!.ready()
    return this.splitIOClient != null && this.isEnabled
      ? this.splitIOClient.getTreatment(key, splitName, attributes)
      : DISABLED_TREATMENT
  }

  public async getTreatmentWithConfig(
    key: SplitKey,
    splitName: string,
    attributes?: Attributes,
  ): Promise<TreatmentWithConfig> {
    await this.waitForSdk()
    return this.splitIOClient != null && this.isEnabled
      ? this.splitIOClient.getTreatmentWithConfig(key, splitName, attributes)
      : { treatment: DISABLED_TREATMENT, config: null }
  }

  public track(
    key: SplitIO.SplitKey,
    trafficType: string,
    eventType: string,
    value?: number,
    properties?: Properties,
  ): boolean {
    return this.splitIOClient != null && this.isEnabled
      ? this.splitIOClient.track(key, trafficType, eventType, value, properties)
      : false
  }

  public shutdown(): void {
    if (!this.isEnabled) {
      return
    }

    void this.splitIOClient?.destroy()
  }
}

function plugin(fastify: FastifyInstance, opts: SplitIOOptions, done: () => void) {
  const manager = new SplitIOFeatureManager(
    opts.isEnabled,
    opts.apiKey,
    opts.debugMode,
    opts.localhostFilePath,
  )

  fastify.decorate('splitIOFeatureManager', manager)

  if (opts.isEnabled) {
    fastify.addHook('onClose', async () => {
      return new Promise(() => {
        manager.shutdown()
      })
    })
  }

  done()
}

export const splitIOFeatureManagerPlugin = fp(plugin, {
  fastify: '4.x',
  name: 'split-io-feature-manager-plugin',
})
