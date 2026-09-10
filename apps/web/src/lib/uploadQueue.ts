export type QueueJob<T> = () => Promise<T>

export type UploadQueue = {
  enqueue: <T>(job: QueueJob<T>) => Promise<T>
  readonly active: number
  readonly waiting: number
}

export const DEFAULT_UPLOAD_CONCURRENCY = 3

export const createUploadQueue = (concurrency: number = DEFAULT_UPLOAD_CONCURRENCY): UploadQueue => {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError("并发数必须是正整数")
  }
  let active = 0
  const waiting: Array<() => void> = []

  const drain = (): void => {
    while (active < concurrency && waiting.length > 0) {
      const start = waiting.shift()
      if (start) start()
    }
  }

  const enqueue = <T>(job: QueueJob<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      waiting.push(() => {
        active += 1
        job()
          .then(resolve, reject)
          .finally(() => {
            active -= 1
            drain()
          })
      })
      drain()
    })

  return {
    enqueue,
    get active() {
      return active
    },
    get waiting() {
      return waiting.length
    },
  }
}
