import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { adminApi, type AdminUser } from '../lib/serverClient'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'

interface Props {
  onClose: () => void
}

type Draft = {
  username: string
  displayName: string
  password: string
  role: AdminUser['role']
  disabled: boolean
  generationLimit: string
}

const emptyDraft: Draft = {
  username: '',
  displayName: '',
  password: '',
  role: 'user',
  disabled: false,
  generationLimit: '',
}

function formatTime(value: number) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

function formatQuota(user: AdminUser) {
  return user.generationLimit == null
    ? `已用 ${user.generationUsed} / 不限`
    : `已用 ${user.generationUsed} / ${user.generationLimit}`
}

export default function UserAdminModal({ onClose }: Props) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useCloseOnEscape(true, onClose)

  const selectedUser = useMemo(
    () => users.find((user) => user.username === selected) ?? null,
    [selected, users],
  )
  const isCreating = selected === null

  const selectUser = (user: AdminUser) => {
    setSelected(user.username)
    setDraft({
      username: user.username,
      displayName: user.displayName,
      password: '',
      role: user.role,
      disabled: user.disabled,
      generationLimit: user.generationLimit == null ? '' : String(user.generationLimit),
    })
    setError('')
  }

  const startCreate = () => {
    setSelected(null)
    setDraft(emptyDraft)
    setError('')
  }

  const loadUsers = async () => {
    setLoading(true)
    setError('')
    try {
      const nextUsers = await adminApi.listUsers()
      setUsers(nextUsers)
      if (!selected && nextUsers.length) {
        const firstOther = nextUsers.find((user) => !user.isSelf) ?? nextUsers[0]
        selectUser(firstOther)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadUsers()
    // 只在打开弹窗时加载一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const limitText = draft.generationLimit.trim()
      const generationLimit = limitText === '' ? null : Number(limitText)
      if (generationLimit != null && (!Number.isFinite(generationLimit) || generationLimit < 0)) {
        throw new Error('生成次数必须为空或非负整数')
      }
      const payload = {
        displayName: draft.displayName.trim(),
        role: draft.role,
        disabled: draft.disabled,
        generationLimit: generationLimit == null ? null : Math.floor(generationLimit),
        ...(draft.password.trim() ? { password: draft.password } : {}),
      }
      const nextUsers = isCreating
        ? await adminApi.createUser({ ...payload, username: draft.username.trim(), password: draft.password })
        : await adminApi.updateUser(draft.username, payload)
      setUsers(nextUsers)
      const nextSelected = nextUsers.find((user) => user.username === draft.username.trim().toLowerCase())
      if (nextSelected) selectUser(nextSelected)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedUser || selectedUser.isSelf) return
    if (!window.confirm(`确定删除用户 ${selectedUser.username} 吗？该用户的历史记录和图片也会删除。`)) return
    setSaving(true)
    setError('')
    try {
      const nextUsers = await adminApi.deleteUser(selectedUser.username)
      setUsers(nextUsers)
      const firstOther = nextUsers.find((user) => !user.isSelf) ?? nextUsers[0]
      if (firstOther) selectUser(firstOther)
      else startCreate()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div
      data-no-drag-select
      className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/35 backdrop-blur-sm animate-overlay-in" />
      <div
        className="relative z-10 flex h-[min(760px,90vh)] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-white/60 bg-white/95 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-950/95 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-white/[0.08]">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">用户管理</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500">每个用户都有独立历史记录</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={startCreate}
              className="rounded-xl bg-blue-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-600"
            >
              新建用户
            </button>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
              aria-label="关闭"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[20rem_1fr]">
          <aside className="min-h-0 border-b border-gray-100 p-4 dark:border-white/[0.08] md:border-b-0 md:border-r">
            <div className="h-full overflow-y-auto pr-1 custom-scrollbar">
              <div className="space-y-2">
                {loading ? (
                  <div className="py-10 text-center text-sm text-gray-400">加载中...</div>
                ) : users.map((user) => (
                  <button
                    key={user.username}
                    onClick={() => selectUser(user)}
                    className={`w-full rounded-2xl border p-3 text-left transition ${selected === user.username
                      ? 'border-blue-300 bg-blue-50 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.25)] dark:border-blue-500/40 dark:bg-blue-500/10 dark:shadow-[inset_0_0_0_1px_rgba(59,130,246,0.22)]'
                      : 'border-transparent hover:border-gray-200/70 hover:bg-gray-50 dark:hover:border-white/[0.08] dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                          {user.displayName || user.username}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-gray-400">@{user.username}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {user.isSelf && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">当前</span>}
                        <span className={`rounded-full px-2 py-0.5 text-[10px] ${user.role === 'admin' ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300' : 'bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-300'}`}>
                          {user.role === 'admin' ? '管理员' : '用户'}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-400">
                      <span>{user.taskCount ?? 0} 条记录</span>
                      <span>·</span>
                      <span>{user.imageCount ?? 0} 张图片</span>
                      <span>·</span>
                      <span>{formatQuota(user)}</span>
                      {user.disabled && <span className="text-red-400">· 已禁用</span>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="min-h-0 overflow-y-auto p-5 custom-scrollbar">
            <div className="mb-5">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {isCreating ? '新建用户' : `编辑 ${selectedUser?.username ?? ''}`}
              </h4>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                管理员可以新增、修改、禁用或删除其他用户。
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">用户名</span>
                <input
                  value={draft.username}
                  onChange={(e) => setDraft((prev) => ({ ...prev, username: e.target.value.toLowerCase() }))}
                  disabled={!isCreating}
                  placeholder="如 alice / bob"
                  className="w-full rounded-2xl border border-gray-200/70 bg-white/70 px-4 py-3 text-sm outline-none transition focus:border-blue-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">显示名称</span>
                <input
                  value={draft.displayName}
                  onChange={(e) => setDraft((prev) => ({ ...prev, displayName: e.target.value }))}
                  placeholder="如 小明"
                  className="w-full rounded-2xl border border-gray-200/70 bg-white/70 px-4 py-3 text-sm outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">密码{isCreating ? '' : '（留空不修改）'}</span>
                <input
                  value={draft.password}
                  onChange={(e) => setDraft((prev) => ({ ...prev, password: e.target.value }))}
                  type="password"
                  autoComplete="new-password"
                  placeholder={isCreating ? '至少 4 位' : '不修改则留空'}
                  className="w-full rounded-2xl border border-gray-200/70 bg-white/70 px-4 py-3 text-sm outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">角色</span>
                <select
                  value={draft.role}
                  onChange={(e) => setDraft((prev) => ({ ...prev, role: e.target.value as AdminUser['role'] }))}
                  disabled={selectedUser?.isSelf}
                  className="w-full rounded-2xl border border-gray-200/70 bg-white/70 px-4 py-3 text-sm outline-none transition focus:border-blue-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-100"
                >
                  <option value="user">普通用户</option>
                  <option value="admin">管理员</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">可生成次数</span>
                <input
                  value={draft.generationLimit}
                  onChange={(e) => setDraft((prev) => ({ ...prev, generationLimit: e.target.value }))}
                  type="number"
                  min={0}
                  step={1}
                  placeholder="留空表示不限"
                  className="w-full rounded-2xl border border-gray-200/70 bg-white/70 px-4 py-3 text-sm outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-100"
                />
              </label>
            </div>

            {!isCreating && selectedUser && (
              <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                生成次数：{formatQuota(selectedUser)}
              </div>
            )}

            <label className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-gray-200/70 bg-gray-50/70 px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
              <span>
                <span className="block text-sm font-medium text-gray-700 dark:text-gray-200">禁用账号</span>
                <span className="text-xs text-gray-400">禁用后该用户无法登录，历史记录会保留。</span>
              </span>
              <input
                type="checkbox"
                checked={draft.disabled}
                disabled={selectedUser?.isSelf}
                onChange={(e) => setDraft((prev) => ({ ...prev, disabled: e.target.checked }))}
                className="h-5 w-5 shrink-0 rounded border-gray-300 text-blue-500 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>

            {!isCreating && selectedUser && (
              <div className="mt-4 rounded-2xl bg-gray-50/70 p-4 text-xs text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
                <div>创建时间：{formatTime(selectedUser.createdAt)}</div>
                <div className="mt-1">更新时间：{formatTime(selectedUser.updatedAt)}</div>
              </div>
            )}

            {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-500 dark:bg-red-500/10 dark:text-red-300">{error}</p>}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {!isCreating && !selectedUser?.isSelf && (
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-500 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
                >
                  删除用户和历史
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={saving || loading || !draft.username.trim() || (isCreating && !draft.password.trim())}
                className="rounded-2xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none dark:disabled:bg-white/[0.08]"
              >
                {saving ? '保存中...' : isCreating ? '创建用户' : '保存修改'}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  )
}
