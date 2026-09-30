import * as path from 'node:path'

import { SplitFactory } from '@splitsoftware/splitio'
import type {
  Attributes,
  Properties,
  SplitIO,
  SplitKey,
  Treatment,
  TreatmentWithConfig,
  //@ts-ignore
} from '@splitsoftware/splitio/types/splitio'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
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
    this.isEnabled = isSplitIOEnabled
    if (!this.isEnabled) return

    // The SDK internally registers a SIGTERM listener to clean itself up on process shutdown. We
    // don't want it: cleanup is handled by `shutdown()`, which destroys the client from the plugin's
    // onClose hook. The listener is registered synchronously while the factory and its main client
    // are created, so any SIGTERM listener added in between belongs to the SDK and is removed here.
    const sigtermListenersBefore = new Set(process.listeners('SIGTERM'))
    const factory: SplitIO.ISDK = SplitFactory({
      core: {
        authorizationKey: localhostFilePath ? 'localhost' : apiKey,
      },
      features: localhostFilePath ? path.join(process.cwd(), localhostFilePath) : undefined,
      debug: debugMode,
    })
    this.splitIOClient = factory.client()
    for (const listener of process.listeners('SIGTERM')) {
      if (!sigtermListenersBefore.has(listener)) {
        process.removeListener('SIGTERM', listener)
      }
    }
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

async function plugin(fastify: FastifyInstance, opts: SplitIOOptions): Promise<void> {
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

  await manager.init()
}

export const splitIOFeatureManagerPlugin: FastifyPluginAsync<SplitIOOptions> = fp(plugin, {
  fastify: '5.x',
  name: 'split-io-feature-manager-plugin',
})
