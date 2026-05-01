import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, type TaskRecord } from '../types'
import { filterTasks } from './taskFilters'

function task(overrides: Partial<TaskRecord>): TaskRecord {
  return {
    id: overrides.id ?? 'task',
    prompt: overrides.prompt ?? 'prompt',
    params: { ...DEFAULT_PARAMS },
    inputImageIds: [],
    maskTargetImageId: null,
    maskImageId: null,
    outputImages: [],
    status: overrides.status ?? 'done',
    error: null,
    createdAt: overrides.createdAt ?? 1,
    finishedAt: 2,
    elapsed: 1,
    ...overrides,
  }
}

describe('filterTasks owner filter', () => {
  const tasks = [
    task({ id: 'self', ownerUsername: 'admin', createdAt: 3 }),
    task({ id: 'alice', ownerUsername: 'alice', ownerDisplayName: 'Alice', createdAt: 2 }),
    task({ id: 'new-self-without-owner', createdAt: 1 }),
  ]

  it('defaults admin view to current user tasks', () => {
    const result = filterTasks(tasks, {
      searchQuery: '',
      filterStatus: 'all',
      filterFavorite: false,
      filterOwner: 'self',
      isAdmin: true,
      currentUsername: 'admin',
    })

    expect(result.map((item) => item.id)).toEqual(['self', 'new-self-without-owner'])
  })

  it('can filter a specific user', () => {
    const result = filterTasks(tasks, {
      searchQuery: '',
      filterStatus: 'all',
      filterFavorite: false,
      filterOwner: 'user:alice',
      isAdmin: true,
      currentUsername: 'admin',
    })

    expect(result.map((item) => item.id)).toEqual(['alice'])
  })
})
