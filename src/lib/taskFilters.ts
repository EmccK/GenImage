import type { OwnerFilter, TaskRecord } from '../types'

interface TaskFilterOptions {
  searchQuery: string
  filterStatus: 'all' | TaskRecord['status']
  filterFavorite: boolean
  filterOwner: OwnerFilter
  isAdmin: boolean
  currentUsername?: string
}

function taskOwnerUsername(task: TaskRecord, currentUsername?: string) {
  return task.ownerUsername || currentUsername || ''
}

function matchesOwner(task: TaskRecord, filterOwner: OwnerFilter, currentUsername?: string) {
  if (filterOwner === 'all') return true

  const owner = taskOwnerUsername(task, currentUsername)
  if (filterOwner === 'self') {
    return currentUsername ? owner === currentUsername : true
  }

  return owner === filterOwner.slice('user:'.length)
}

export function filterTasks(tasks: TaskRecord[], options: TaskFilterOptions) {
  const q = options.searchQuery.trim().toLowerCase()

  return [...tasks]
    .sort((a, b) => b.createdAt - a.createdAt)
    .filter((task) => {
      if (options.filterFavorite && !task.isFavorite) return false
      if (options.filterStatus !== 'all' && task.status !== options.filterStatus) return false
      if (options.isAdmin && !matchesOwner(task, options.filterOwner, options.currentUsername)) return false

      if (!q) return true
      const prompt = (task.prompt || '').toLowerCase()
      const paramStr = JSON.stringify(task.params).toLowerCase()
      const owner = `${task.ownerDisplayName || ''} ${task.ownerUsername || ''}`.toLowerCase()
      return prompt.includes(q) || paramStr.includes(q) || owner.includes(q)
    })
}
