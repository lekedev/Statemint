import Bull from 'bull'
import {
  QUEUE_NAMES,
  ParseJobData,
  CategorizeJobData,
  EmbedJobData,
} from '../types'

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

const defaultJobOptions: Bull.JobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
  removeOnComplete: 50,
  removeOnFail: 100,
}

export const parseQueue = new Bull<ParseJobData>(
  QUEUE_NAMES.PARSE,
  redisUrl,
  { defaultJobOptions }
)

export const categorizeQueue = new Bull<CategorizeJobData>(
  QUEUE_NAMES.CATEGORIZE,
  redisUrl,
  { defaultJobOptions }
)

export const embedQueue = new Bull<EmbedJobData>(
  QUEUE_NAMES.EMBED,
  redisUrl,
  { defaultJobOptions }
)

export async function closeQueues(): Promise<void> {
  await Promise.all([
    parseQueue.close(),
    categorizeQueue.close(),
    embedQueue.close(),
  ])
}