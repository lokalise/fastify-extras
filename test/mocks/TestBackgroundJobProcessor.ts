import type {
  BackgroundJobProcessorDependencies,
  BaseJobPayload,
} from '@lokalise/background-jobs-common'
import { AbstractBackgroundJobProcessor } from '@lokalise/background-jobs-common'

import type { RedisConfig } from '@lokalise/node-core'

export class TestBackgroundJobProcessor<
  JobData extends BaseJobPayload,
  JobReturn,
> extends AbstractBackgroundJobProcessor<JobData, JobReturn> {
  private readonly returnValue: JobReturn

  constructor(
    dependencies: BackgroundJobProcessorDependencies<JobData, JobReturn>,
    returnValue: JobReturn,
    queueId: string,
    redisConfig: RedisConfig,
  ) {
    super(dependencies, {
      queueId,
      ownerName: 'test',
      isTest: true,
      workerOptions: { concurrency: 1 },
      redisConfig,
    })
    this.returnValue = returnValue
  }

  schedule(jobData: JobData): Promise<string> {
    return super.schedule(jobData, { attempts: 1 })
  }

  protected override process(): Promise<JobReturn> {
    return Promise.resolve(this.returnValue)
  }
}
