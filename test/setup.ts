import type { RedisConfig } from '@lokalise/node-core'

process.loadEnvFile('../.env.test')

export const getTestRedisConfig = (): RedisConfig => {
  return {
    host: process.env.REDIS_HOST ?? 'localhost',
    password: process.env.REDIS_PASSWORD,
    port: Number(process.env.REDIS_PORT),
    useTls: false,
  }
}
