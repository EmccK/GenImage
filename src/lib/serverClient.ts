import type { AppSettings, StoredImage, TaskParams, TaskRecord } from '../types'

export interface PromptPreset {
  id: string
  title: string
  category: string
  prompt: string
  imageUrl?: string
  description?: string
  source?: string
  tags?: string[]
}

export interface ServerConfig {
  available: boolean
  authEnabled: boolean
  authenticated: boolean
  usernameRequired: boolean
  serverStorage: boolean
  apiProxyAvailable: boolean
  lockSettings: boolean
  lockParams: boolean
  hideSettings: boolean
  isAdmin: boolean
  currentUser: AdminUser | null
  defaultSettings?: Partial<AppSettings>
  lockedSettings?: Partial<AppSettings>
  lockedParams?: Partial<TaskParams>
  promptPresets: PromptPreset[]
}

export interface AdminUser {
  username: string
  displayName: string
  role: 'admin' | 'user'
  disabled: boolean
  createdAt: number
  updatedAt: number
  taskCount?: number
  imageCount?: number
  isSelf?: boolean
}

const DEFAULT_CONFIG: ServerConfig = {
  available: false,
  authEnabled: false,
  authenticated: true,
  usernameRequired: false,
  serverStorage: false,
  apiProxyAvailable: false,
  lockSettings: false,
  lockParams: false,
  hideSettings: false,
  isAdmin: false,
  currentUser: null,
  promptPresets: [],
}

let currentConfig: ServerConfig = DEFAULT_CONFIG

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object')
}

function normalizePromptPreset(value: unknown, index: number): PromptPreset | null {
  if (!isRecord(value)) return null
  const prompt = typeof value.prompt === 'string' ? value.prompt.trim() : ''
  if (!prompt) return null

  const title = typeof value.title === 'string' && value.title.trim()
    ? value.title.trim()
    : `Prompt ${index + 1}`
  const category = typeof value.category === 'string' && value.category.trim()
    ? value.category.trim()
    : '通用'
  const id = typeof value.id === 'string' && value.id.trim()
    ? value.id.trim()
    : `${category}-${title}-${index}`.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')

  return {
    id,
    title,
    category,
    prompt,
    imageUrl: typeof value.imageUrl === 'string' ? value.imageUrl : undefined,
    description: typeof value.description === 'string' ? value.description : undefined,
    source: typeof value.source === 'string' ? value.source : undefined,
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === 'string') : undefined,
  }
}

async function loadBundledPromptPresets(): Promise<PromptPreset[]> {
  try {
    const response = await fetch('./prompt-presets.json', {
      cache: 'no-store',
      credentials: 'same-origin',
    })
    if (!response.ok) return []
    const raw = await response.json()
    const list = Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.prompts) ? raw.prompts : []
    return list.map(normalizePromptPreset).filter((item): item is PromptPreset => Boolean(item))
  } catch {
    return []
  }
}

function normalizeServerConfig(raw: unknown, fallbackPrompts: PromptPreset[] = []): ServerConfig {
  if (!isRecord(raw)) return { ...DEFAULT_CONFIG, promptPresets: fallbackPrompts }

  const promptList = Array.isArray(raw.promptPresets) ? raw.promptPresets : fallbackPrompts
  return {
    available: true,
    authEnabled: Boolean(raw.authEnabled),
    authenticated: raw.authenticated !== false,
    usernameRequired: Boolean(raw.usernameRequired),
    serverStorage: Boolean(raw.serverStorage),
    apiProxyAvailable: Boolean(raw.apiProxyAvailable),
    lockSettings: Boolean(raw.lockSettings),
    lockParams: Boolean(raw.lockParams),
    hideSettings: Boolean(raw.hideSettings),
    isAdmin: Boolean(raw.isAdmin),
    currentUser: normalizeAdminUser(raw.currentUser),
    defaultSettings: isRecord(raw.defaultSettings) ? raw.defaultSettings as Partial<AppSettings> : undefined,
    lockedSettings: isRecord(raw.lockedSettings) ? raw.lockedSettings as Partial<AppSettings> : undefined,
    lockedParams: isRecord(raw.lockedParams) ? raw.lockedParams as Partial<TaskParams> : undefined,
    promptPresets: promptList.map(normalizePromptPreset).filter((item): item is PromptPreset => Boolean(item)),
  }
}

function normalizeAdminUser(value: unknown): AdminUser | null {
  if (!isRecord(value) || typeof value.username !== 'string') return null
  return {
    username: value.username,
    displayName: typeof value.displayName === 'string' ? value.displayName : value.username,
    role: value.role === 'admin' ? 'admin' : 'user',
    disabled: Boolean(value.disabled),
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : 0,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
    taskCount: typeof value.taskCount === 'number' ? value.taskCount : undefined,
    imageCount: typeof value.imageCount === 'number' ? value.imageCount : undefined,
    isSelf: Boolean(value.isSelf),
  }
}

export function getServerConfigSnapshot(): ServerConfig {
  return currentConfig
}

export function isServerStorageEnabled(): boolean {
  return Boolean(currentConfig.available && currentConfig.serverStorage && currentConfig.authenticated)
}

export function applyLockedSettings(settings: AppSettings): AppSettings {
  const cfg = currentConfig
  return cfg.lockSettings && cfg.lockedSettings
    ? { ...settings, ...cfg.lockedSettings }
    : settings
}

export function applyLockedParams(params: TaskParams): TaskParams {
  const cfg = currentConfig
  return cfg.lockParams && cfg.lockedParams
    ? { ...params, ...cfg.lockedParams }
    : params
}

export async function loadServerConfig(): Promise<ServerConfig> {
  const fallbackPrompts = await loadBundledPromptPresets()
  try {
    const response = await fetch('/app-api/config', {
      cache: 'no-store',
      credentials: 'include',
    })
    if (!response.ok) {
      currentConfig = { ...DEFAULT_CONFIG, promptPresets: fallbackPrompts }
      return currentConfig
    }

    const raw = await response.json()
    const config = normalizeServerConfig(raw, fallbackPrompts)
    if (!config.promptPresets.length) config.promptPresets = fallbackPrompts
    currentConfig = config
    return config
  } catch {
    currentConfig = { ...DEFAULT_CONFIG, promptPresets: fallbackPrompts }
    return currentConfig
  }
}

export async function loginToServer(payload: { username?: string; password: string }): Promise<ServerConfig> {
  const response = await fetch('/app-api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    let message = '登录失败，请检查账号或密码'
    try {
      const data = await response.json()
      if (typeof data.message === 'string') message = data.message
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }

  return loadServerConfig()
}

export async function logoutFromServer(): Promise<void> {
  try {
    await fetch('/app-api/logout', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
    })
  } catch {
    /* 即使请求失败，也先更新前端状态，避免退出按钮看起来没有反应。 */
  } finally {
    currentConfig = { ...currentConfig, authenticated: false, currentUser: null, isAdmin: false }
  }
}

async function serverRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/app-api${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  })

  if (response.status === 401) {
    currentConfig = { ...currentConfig, authenticated: false }
  }
  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const data = await response.json()
      if (typeof data.message === 'string') message = data.message
    } catch {
      try {
        message = await response.text()
      } catch {
        /* ignore */
      }
    }
    throw new Error(message)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const serverDb = {
  getAllTasks: () => serverRequest<TaskRecord[]>('/tasks'),
  putTask: (task: TaskRecord) => serverRequest<IDBValidKey>(`/tasks/${encodeURIComponent(task.id)}`, {
    method: 'PUT',
    body: JSON.stringify(task),
  }),
  deleteTask: (id: string) => serverRequest<undefined>(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  clearTasks: () => serverRequest<undefined>('/tasks/clear', { method: 'POST' }),

  getImage: async (id: string) => {
    const response = await fetch(`/app-api/images/${encodeURIComponent(id)}`, {
      credentials: 'include',
      cache: 'no-store',
    })
    if (response.status === 404) return undefined
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json() as Promise<StoredImage>
  },
  getAllImages: () => serverRequest<StoredImage[]>('/images'),
  putImage: (image: StoredImage) => serverRequest<IDBValidKey>(`/images/${encodeURIComponent(image.id)}`, {
    method: 'PUT',
    body: JSON.stringify(image),
  }),
  deleteImage: (id: string) => serverRequest<undefined>(`/images/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  clearImages: () => serverRequest<undefined>('/images/clear', { method: 'POST' }),
}

export const adminApi = {
  listUsers: async () => {
    const users = await serverRequest<unknown[]>('/admin/users')
    return users.map(normalizeAdminUser).filter((user): user is AdminUser => Boolean(user))
  },
  createUser: async (payload: {
    username: string
    password: string
    displayName?: string
    role?: AdminUser['role']
    disabled?: boolean
  }) => {
    const users = await serverRequest<unknown[]>('/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return users.map(normalizeAdminUser).filter((user): user is AdminUser => Boolean(user))
  },
  updateUser: async (username: string, payload: {
    password?: string
    displayName?: string
    role?: AdminUser['role']
    disabled?: boolean
  }) => {
    const users = await serverRequest<unknown[]>(`/admin/users/${encodeURIComponent(username)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
    return users.map(normalizeAdminUser).filter((user): user is AdminUser => Boolean(user))
  },
  deleteUser: async (username: string) => {
    const users = await serverRequest<unknown[]>(`/admin/users/${encodeURIComponent(username)}`, {
      method: 'DELETE',
    })
    return users.map(normalizeAdminUser).filter((user): user is AdminUser => Boolean(user))
  },
}
