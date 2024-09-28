import * as path from 'node:path'
import * as process from 'node:process'

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

const DISABLED_TREATMENT: Treatment = 'control'

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

  private readonly splitIOClient?: SplitIO.IClient

  constructor(
    isSplitIOEnabled: boolean,
    apiKey: string,
    debugMode: boolean,
    localhostFilePath?: string,
  ) {
    if (isSplitIOEnabled) {
      const factory: SplitIO.ISDK = SplitFactory({
        core: {
          authorizationKey: localhostFilePath ? 'localhost' : apiKey,
        },
        features: localhostFilePath ? path.join(process.cwd(), localhostFilePath) : undefined,
        debug: debugMode,
      })
      this.splitIOClient = factory.client()
    }

    this.isEnabled = isSplitIOEnabled
  }

  public async init() {
    await this.splitIOClient?.ready()
  }

  public getTreatment(key: SplitKey, splitName: string, attributes?: Attributes): Treatment {
    return this.splitIOClient?.getTreatment(key, splitName, attributes) ?? DISABLED_TREATMENT
  }

  public getTreatmentWithConfig(
    key: SplitKey,
    splitName: string,
    attributes?: Attributes,
  ): TreatmentWithConfig {
    return (
      this.splitIOClient?.getTreatmentWithConfig(key, splitName, attributes) ?? {
        treatment: DISABLED_TREATMENT,
        config: null,
      }
    )
  }

  public track(
    key: SplitIO.SplitKey,
    trafficType: string,
    eventType: string,
    value?: number,
    properties?: Properties,
  ): boolean {
    return this.splitIOClient?.track(key, trafficType, eventType, value, properties) ?? false
  }

  public async shutdown(): Promise<void> {
    if (!this.isEnabled) {
      return
    }

    await this.splitIOClient?.destroy()
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
      await manager.shutdown()
    })
  }

  void manager
    .init()
    .then(() => done())
    .catch(() => {
      throw new Error('Split IO client is not ready')
    })
}

export const splitIOFeatureManagerPlugin = fp(plugin, {
  fastify: '5.x',
  name: 'split-io-feature-manager-plugin',
})
