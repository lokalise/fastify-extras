import type {
  BackgroundJobProcessorDependencies,
  BaseJobPayload,
} from '@lokalise/background-jobs-common'
import { AbstractBackgroundJobProcessor } from '@lokalise/background-jobs-common'
import type { TestRedisConfig } from './TestDependencies.ts'

export class TestBackgroundJobProcessor<
  JobData extends BaseJobPayload,
  JobReturn,
> extends AbstractBackgroundJobProcessor<JobData, JobReturn> {
  private readonly returnValue: JobReturn

  constructor(
    dependencies: BackgroundJobProcessorDependencies<JobData, JobReturn>,
    returnValue: JobReturn,
    queueId: string,
    redisConfig: TestRedisConfig,
  ) {
    super(dependencies, {
      queueId,
      ownerName: 'test',
      isTest: true,
      workerOptions: { concurrency: 1 },
      redisConfig: { ...redisConfig, useTls: redisConfig.tls !== undefined },
    })
    this.returnValue = returnValue
  }

  override schedule(jobData: JobData): Promise<string> {
    return super.schedule(jobData, { attempts: 1, removeOnFail: false, removeOnComplete: false })
  }

  protected override process(): Promise<JobReturn> {
    return Promise.resolve(this.returnValue)
  }
}
