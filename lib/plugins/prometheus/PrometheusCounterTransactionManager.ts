import { Counter } from "prom-client";
import type { TransactionObservabilityManager } from "@lokalise/node-core";
import { undefined } from "zod";

export class PrometheusCounterTransactionManager implements TransactionObservabilityManager {
  private readonly isEnabled: boolean;
  private readonly counter?: Counter<'status' | 'transactionName'>;

  private readonly transactionNameById: Map<string, string> = new Map()

  constructor() {
    this.isEnabled = true
  }

  start(transactionName: string, uniqueTransactionKey: string): void {
    this.transactionNameById.set(uniqueTransactionKey, transactionName)
    this.counter?.inc({ status: 'started', transactionName: transactionName })
  }

  startWithGroup(transactionName: string, uniqueTransactionKey: string, _transactionGroup: string): void {
    this.transactionNameById.set(uniqueTransactionKey, transactionName)
    this.counter?.inc({ status: 'started', transactionName })
  }

  stop(uniqueTransactionKey: string, wasSuccessful: boolean = true): void {
    const transactionName = this.transactionNameById.get(uniqueTransactionKey)
    if (!transactionName) return

    this.counter?.inc({ status: wasSuccessful ? 'success' : 'failed', transactionName })
    this.transactionNameById.delete(uniqueTransactionKey)
  }
}
