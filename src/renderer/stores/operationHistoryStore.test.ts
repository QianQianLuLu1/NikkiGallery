import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useOperationHistoryStore, type OperationType } from './operationHistoryStore'

/**
 * Mock window.electronAPI.operationHistory
 * 仅 mock push/clear/loadFromDatabase 涉及的 IPC 调用
 */
interface MockOperationHistoryApi {
  add: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  clear: ReturnType<typeof vi.fn>
  list: ReturnType<typeof vi.fn>
}

let mockApi: MockOperationHistoryApi

function setMockApi(overrides: Partial<MockOperationHistoryApi> = {}): void {
  mockApi = {
    add: vi.fn().mockResolvedValue({ success: true, id: 1 }),
    remove: vi.fn().mockResolvedValue({ success: true }),
    clear: vi.fn().mockResolvedValue({ success: true }),
    list: vi.fn().mockResolvedValue({ success: true, records: [] }),
    ...overrides
  }
  ;(globalThis as { window?: { electronAPI?: Record<string, unknown> } }).window = {
    electronAPI: { operationHistory: mockApi }
  }
}

function clearMockApi(): void {
  ;(globalThis as { window?: { electronAPI?: Record<string, unknown> } }).window = undefined
}

describe('operationHistoryStore', () => {
  beforeEach(() => {
    setMockApi()
    // 每个测试前重置 store
    useOperationHistoryStore.setState({ stack: [], undoing: false })
  })

  afterEach(() => {
    clearMockApi()
    vi.restoreAllMocks()
  })

  describe('push', () => {
    it('向栈中推入新记录，自动生成 localId 与 createdAt', () => {
      const { push } = useOperationHistoryStore.getState()
      push({
        type: 'file_rename',
        description: '重命名文件',
        payload: { oldPath: '/a.jpg', newPath: '/b.jpg' }
      })
      const state = useOperationHistoryStore.getState()
      expect(state.stack.length).toBe(1)
      expect(state.stack[0].localId).toBeTruthy()
      expect(state.stack[0].type).toBe('file_rename')
      expect(state.stack[0].createdAt).toBeGreaterThan(0)
      expect(state.stack[0].dbId).toBeUndefined() // 异步写入数据库，初始为 undefined
    })

    it('异步调用 electronAPI.operationHistory.add 写入数据库', async () => {
      const { push } = useOperationHistoryStore.getState()
      push({
        type: 'rating_update',
        description: '修改评分',
        payload: { oldRating: 3, newRating: 5 },
        mediaId: '100'
      })
      // 等待微任务队列中的 IPC 调用完成
      await vi.waitFor(() => {
        expect(mockApi.add).toHaveBeenCalledTimes(1)
      })
      const callArg = mockApi.add.mock.calls[0][0]
      expect(callArg.operationType).toBe('rating_update')
      expect(callArg.mediaId).toBe(100)
      expect(callArg.description).toBe('修改评分')
    })

    it('栈超过 50 条时丢弃最旧记录（FIFO）', () => {
      const { push } = useOperationHistoryStore.getState()
      for (let i = 0; i < 51; i++) {
        push({
          type: 'rating_update',
          description: `op-${i}`,
          payload: {}
        })
      }
      const state = useOperationHistoryStore.getState()
      expect(state.stack.length).toBe(50)
      // 最旧的 op-0 应已被丢弃
      expect(state.stack[0].description).toBe('op-1')
      expect(state.stack[state.stack.length - 1].description).toBe('op-50')
    })

    it('mediaId 不传时 IPC 调用 mediaId 为 undefined', async () => {
      const { push } = useOperationHistoryStore.getState()
      push({
        type: 'file_copy',
        description: '复制文件',
        payload: {}
      })
      await vi.waitFor(() => {
        expect(mockApi.add).toHaveBeenCalledTimes(1)
      })
      expect(mockApi.add.mock.calls[0][0].mediaId).toBeUndefined()
    })
  })

  describe('undo', () => {
    it('空栈时返回失败', async () => {
      const { undo } = useOperationHistoryStore.getState()
      const result = await undo()
      expect(result.success).toBe(false)
      expect(result.message).toContain('没有可撤销的操作')
    })

    it('未注册 handler 时返回失败', async () => {
      const { push, undo } = useOperationHistoryStore.getState()
      push({ type: 'file_rename', description: 'rename', payload: {} })
      const result = await undo()
      expect(result.success).toBe(false)
      expect(result.message).toContain('未注册')
    })

    it('handler 返回成功时从栈中移除该记录', async () => {
      const { push, undo, registerUndoHandler } = useOperationHistoryStore.getState()
      const handler = vi.fn().mockResolvedValue({ success: true })
      registerUndoHandler('file_rename', handler)

      push({ type: 'file_rename', description: 'rename', payload: { path: '/x' } })
      expect(useOperationHistoryStore.getState().stack.length).toBe(1)

      const result = await undo()
      expect(result.success).toBe(true)
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler.mock.calls[0][0]).toEqual({ path: '/x' })
      expect(useOperationHistoryStore.getState().stack.length).toBe(0)
    })

    it('handler 返回失败时不移除记录', async () => {
      const { push, undo, registerUndoHandler } = useOperationHistoryStore.getState()
      const handler = vi.fn().mockResolvedValue({ success: false, message: '失败原因' })
      registerUndoHandler('rating_update', handler)

      push({ type: 'rating_update', description: 'rating', payload: {} })
      const result = await undo()
      expect(result.success).toBe(false)
      expect(result.message).toBe('失败原因')
      expect(useOperationHistoryStore.getState().stack.length).toBe(1)
    })

    it('handler 抛错时返回失败且不移除记录', async () => {
      const { push, undo, registerUndoHandler } = useOperationHistoryStore.getState()
      const handler = vi.fn().mockRejectedValue(new Error('网络错误'))
      registerUndoHandler('tags_update', handler)

      push({ type: 'tags_update', description: 'tags', payload: {} })
      const result = await undo()
      expect(result.success).toBe(false)
      expect(result.message).toContain('网络错误')
      expect(useOperationHistoryStore.getState().stack.length).toBe(1)
    })

    it('undoing 标志在执行期间为 true，完成后恢复 false', async () => {
      const { push, undo, registerUndoHandler } = useOperationHistoryStore.getState()
      let resolveHandler: (val: { success: boolean }) => void
      const handlerPromise = new Promise<{ success: boolean }>((resolve) => {
        resolveHandler = resolve
      })
      registerUndoHandler('notes_update', () => handlerPromise)

      push({ type: 'notes_update', description: 'notes', payload: {} })
      const undoPromise = undo()
      // 等待微任务让 set({ undoing: true }) 生效
      await new Promise((r) => setTimeout(r, 0))
      expect(useOperationHistoryStore.getState().undoing).toBe(true)

      resolveHandler!({ success: true })
      await undoPromise
      expect(useOperationHistoryStore.getState().undoing).toBe(false)
    })

    it('撤销成功后调用 electronAPI.operationHistory.remove 删除数据库记录', async () => {
      // 覆盖 mock：add 返回 id=42
      setMockApi({
        add: vi.fn().mockResolvedValue({ success: true, id: 42 }),
        remove: vi.fn().mockResolvedValue({ success: true })
      })

      const { push, undo, registerUndoHandler } = useOperationHistoryStore.getState()
      const handler = vi.fn().mockResolvedValue({ success: true })
      registerUndoHandler('favorite_toggle', handler)

      push({ type: 'favorite_toggle', description: 'fav', payload: {} })
      // 等 add 完成，stack 中的记录会更新 dbId=42
      await vi.waitFor(() => {
        expect(useOperationHistoryStore.getState().stack[0].dbId).toBe(42)
      })

      await undo()
      await vi.waitFor(() => {
        expect(mockApi.remove).toHaveBeenCalledWith(42)
      })
    })
  })

  describe('clear', () => {
    it('清空内存栈', () => {
      const { push, clear } = useOperationHistoryStore.getState()
      push({ type: 'file_rename', description: 'r1', payload: {} })
      push({ type: 'file_rename', description: 'r2', payload: {} })
      clear()
      expect(useOperationHistoryStore.getState().stack).toEqual([])
    })

    it('调用 electronAPI.operationHistory.clear 清空数据库', async () => {
      const { clear } = useOperationHistoryStore.getState()
      clear()
      await vi.waitFor(() => {
        expect(mockApi.clear).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('canUndo', () => {
    it('空栈时返回 false', () => {
      expect(useOperationHistoryStore.getState().canUndo()).toBe(false)
    })

    it('有记录且未在撤销中时返回 true', () => {
      const { push } = useOperationHistoryStore.getState()
      push({ type: 'file_rename', description: 'r', payload: {} })
      expect(useOperationHistoryStore.getState().canUndo()).toBe(true)
    })

    it('撤销中时返回 false', async () => {
      const { push, undo, registerUndoHandler } = useOperationHistoryStore.getState()
      let resolveHandler: (val: { success: boolean }) => void
      const handlerPromise = new Promise<{ success: boolean }>((resolve) => {
        resolveHandler = resolve
      })
      registerUndoHandler('category_update', () => handlerPromise)

      push({ type: 'category_update', description: 'c', payload: {} })
      const undoPromise = undo()
      await new Promise((r) => setTimeout(r, 0))
      expect(useOperationHistoryStore.getState().canUndo()).toBe(false)
      resolveHandler!({ success: true })
      await undoPromise
    })
  })

  describe('registerUndoHandler', () => {
    it('注册后可被 undo 调用', async () => {
      const { push, undo, registerUndoHandler } = useOperationHistoryStore.getState()
      const handler = vi.fn().mockResolvedValue({ success: true })
      registerUndoHandler('media_soft_delete' as OperationType, handler)
      push({ type: 'media_soft_delete', description: 'soft delete', payload: { id: 'x' } })
      await undo()
      expect(handler).toHaveBeenCalled()
    })

    it('重复注册同一类型会覆盖旧 handler', async () => {
      const { push, undo, registerUndoHandler } = useOperationHistoryStore.getState()
      const handler1 = vi.fn().mockResolvedValue({ success: true })
      const handler2 = vi.fn().mockResolvedValue({ success: true })
      registerUndoHandler('media_restore', handler1)
      registerUndoHandler('media_restore', handler2)

      push({ type: 'media_restore', description: 'r', payload: {} })
      await undo()
      expect(handler1).not.toHaveBeenCalled()
      expect(handler2).toHaveBeenCalled()
    })
  })

  describe('loadFromDatabase', () => {
    it('从数据库加载记录并填充 stack', async () => {
      setMockApi({
        list: vi.fn().mockResolvedValue({
          success: true,
          records: [
            {
              id: 1,
              operationType: 'file_rename',
              description: 'db-record',
              mediaId: 100,
              payload: JSON.stringify({ oldPath: '/a' }),
              createdAt: '2026-01-01T00:00:00.000Z'
            }
          ]
        })
      })

      const { loadFromDatabase } = useOperationHistoryStore.getState()
      await loadFromDatabase()

      const stack = useOperationHistoryStore.getState().stack
      expect(stack.length).toBe(1)
      expect(stack[0].dbId).toBe(1)
      expect(stack[0].localId).toBe('db-1')
      expect(stack[0].type).toBe('file_rename')
      expect(stack[0].mediaId).toBe('100')
      expect(stack[0].payload).toEqual({ oldPath: '/a' })
    })

    it('payload 是对象时直接使用，不 JSON.parse', async () => {
      setMockApi({
        list: vi.fn().mockResolvedValue({
          success: true,
          records: [
            {
              id: 2,
              operationType: 'rating_update',
              description: 'rating',
              payload: { rating: 5 }, // 对象而非字符串
              createdAt: '2026-01-01T00:00:00.000Z'
            }
          ]
        })
      })

      const { loadFromDatabase } = useOperationHistoryStore.getState()
      await loadFromDatabase()
      const stack = useOperationHistoryStore.getState().stack
      expect(stack[0].payload).toEqual({ rating: 5 })
    })

    it('payload 损坏时回退为空对象', async () => {
      setMockApi({
        list: vi.fn().mockResolvedValue({
          success: true,
          records: [
            {
              id: 3,
              operationType: 'notes_update',
              description: 'notes',
              payload: 'not-valid-json{',
              createdAt: '2026-01-01T00:00:00.000Z'
            }
          ]
        })
      })

      const { loadFromDatabase } = useOperationHistoryStore.getState()
      await loadFromDatabase()
      const stack = useOperationHistoryStore.getState().stack
      expect(stack[0].payload).toEqual({})
    })

    it('API 返回失败时不修改 stack', async () => {
      setMockApi({
        list: vi.fn().mockResolvedValue({ success: false })
      })
      // 先 push 一条本地记录
      const { push, loadFromDatabase } = useOperationHistoryStore.getState()
      push({ type: 'file_rename', description: 'local', payload: {} })
      const beforeLen = useOperationHistoryStore.getState().stack.length

      await loadFromDatabase()
      expect(useOperationHistoryStore.getState().stack.length).toBe(beforeLen)
    })

    it('调用时传入 MAX_STACK_SIZE 作为 limit 参数', async () => {
      const { loadFromDatabase } = useOperationHistoryStore.getState()
      await loadFromDatabase()
      expect(mockApi.list).toHaveBeenCalledWith(50)
    })
  })
})
