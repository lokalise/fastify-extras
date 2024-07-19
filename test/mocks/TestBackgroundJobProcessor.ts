import type {
  BackgroundJobProcessorDependencies,
  BaseJobPayload} from '@lokalise/background-jobs-common';
import {
  AbstractBackgroundJobProcessor
} from '@lokalise/background-jobs-common'
import { generateMonotonicUuid } from '@lokalise/id-utils'


import { getTestRedisConfig } from '../setup'

export class TestBackgroundJobProcessor<
  JobData extends BaseJobPayload,
  JobReturn,
> extends AbstractBackgroundJobProcessor<JobData, JobReturn> {
  private readonly returnValue: JobReturn

  constructor(
    dependencies: BackgroundJobProcessorDependencies<JobData, JobReturn>,
    returnValue: JobReturn,
    queueId: string = generateMonotonicUuid(),
  ) {
    super(dependencies, {
      queueId,
      ownerName: 'test',
      isTest: true,
      workerOptions: { concurrency: 1 },
      redisConfig: getTestRedisConfig(),
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