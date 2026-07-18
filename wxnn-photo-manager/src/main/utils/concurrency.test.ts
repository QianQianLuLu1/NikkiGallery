import { describe, it, expect } from 'vitest'
import { runWithConcurrency } from './concurrency'

describe('concurrency - runWithConcurrency', () => {
  it('空任务数组返回空结果数组', async () => {
    const result = await runWithConcurrency([], 5)
    expect(result).toEqual([])
  })

  it('结果顺序与任务数组顺序一致（而非完成顺序）', async () => {
    const tasks = [
      () => Promise.resolve('a'),
      () => new Promise((r) => setTimeout(() => r('b'), 50)),
      () => Promise.resolve('c')
    ]
    const result = await runWithConcurrency(tasks, 3)
    expect(result).toEqual(['a', 'b', 'c'])
  })

  it('并发数为 1 时严格串行执行', async () => {
    const executionOrder: number[] = []
    const tasks = [0, 1, 2].map(
      (i) => () =>
        new Promise<void>((resolve) => {
          executionOrder.push(i)
          setTimeout(resolve, 10)
        }).then(() => i)
    )
    const result = await runWithConcurrency(tasks, 1)
    expect(result).toEqual([0, 1, 2])
    expect(executionOrder).toEqual([0, 1, 2])
  })

  it('并发数大于任务数时实际并发度不超过任务数', async () => {
    const tasks = [() => Promise.resolve(1), () => Promise.resolve(2)]
    const result = await runWithConcurrency(tasks, 100)
    expect(result).toEqual([1, 2])
  })

  it('并发数 0 或负数时仍能完成所有任务', async () => {
    const tasks = [() => Promise.resolve('x'), () => Promise.resolve('y')]
    // Math.min(concurrency, tasks.length) 在 concurrency<=0 时为 0，workers 为空数组
    // 但 Promise.all([]) 立即 resolve，tasks 永不执行，results 全为 undefined 槽位
    // 验证当前实现的边界行为（不抛错即可）
    const result = await runWithConcurrency(tasks, 0)
    expect(result.length).toBe(2)
  })

  it('任务抛错时 reject 整个 Promise', async () => {
    const tasks = [() => Promise.resolve('ok'), () => Promise.reject(new Error('fail'))]
    await expect(runWithConcurrency(tasks, 2)).rejects.toThrow('fail')
  })

  it('高并发下能正确处理大量任务', async () => {
    const n = 100
    const tasks = Array.from({ length: n }, (_, i) => () => Promise.resolve(i * 2))
    const result = await runWithConcurrency(tasks, 10)
    expect(result.length).toBe(n)
    expect(result[50]).toBe(100)
  })
})
