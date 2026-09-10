import { describe, expect, it } from "vitest"
import { createUploadQueue } from "./uploadQueue.ts"

type Deferred = { promise: Promise<string>; resolve: (value: string) => void; reject: (error: Error) => void }

const deferred = (): Deferred => {
  let resolve: (value: string) => void = () => {}
  let reject: (error: Error) => void = () => {}
  const promise = new Promise<string>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe("createUploadQueue", () => {
  it("never runs more than three jobs at once", async () => {
    const queue = createUploadQueue(3)
    const started: number[] = []
    const gates = Array.from({ length: 7 }, () => deferred())
    let running = 0
    let peak = 0
    const results = gates.map((gate, index) =>
      queue.enqueue(async () => {
        started.push(index)
        running += 1
        peak = Math.max(peak, running)
        const value = await gate.promise
        running -= 1
        return value
      }),
    )

    await flush()
    expect(started).toEqual([0, 1, 2])
    expect(queue.active).toBe(3)
    expect(queue.waiting).toBe(4)

    gates[1]?.resolve("b")
    await flush()
    expect(started).toEqual([0, 1, 2, 3])
    expect(queue.active).toBe(3)

    gates[0]?.resolve("a")
    gates[2]?.resolve("c")
    await flush()
    expect(started).toEqual([0, 1, 2, 3, 4, 5])

    gates[3]?.resolve("d")
    gates[4]?.resolve("e")
    gates[5]?.resolve("f")
    gates[6]?.resolve("g")
    const values = await Promise.all(results)
    expect(values).toEqual(["a", "b", "c", "d", "e", "f", "g"])
    expect(peak).toBe(3)
    expect(queue.active).toBe(0)
    expect(queue.waiting).toBe(0)
  })

  it("keeps draining after a job fails", async () => {
    const queue = createUploadQueue(1)
    const failing = queue.enqueue(async () => {
      throw new Error("上传失败")
    })
    const following = queue.enqueue(async () => "ok")
    await expect(failing).rejects.toThrow("上传失败")
    await expect(following).resolves.toBe("ok")
  })

  it("rejects a non-positive concurrency", () => {
    expect(() => createUploadQueue(0)).toThrow(RangeError)
  })

  it("defaults to three concurrent uploads", async () => {
    const queue = createUploadQueue()
    const gate = deferred()
    const jobs = Array.from({ length: 5 }, () => queue.enqueue(() => gate.promise))
    await flush()
    expect(queue.active).toBe(3)
    gate.resolve("done")
    await Promise.all(jobs)
  })
})
