/**
 * 原生并发控制（替代 p-limit，避免 ESM/CJS 兼容问题）
 * p-limit v7 为纯 ESM，主进程编译为 CommonJS 后 require() 失败
 */

export async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let nextIndex = 0

  const runNext = async (): Promise<void> => {
    while (nextIndex < tasks.length) {
      const index = nextIndex++
      results[index] = await tasks[index]()
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    () => runNext()
  )
  await Promise.all(workers)
  return results
}
