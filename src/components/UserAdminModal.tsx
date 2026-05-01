import { useEffect, useMemo, useState } from 'react'
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
}

const emptyDraft: Draft = {
  username: '',
  displayName: '',
  password: '',
  role: 'user',
  disabled: false,
}

function formatTime(value: number) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
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

  const selectUser = (user: AdminUser) => {
    setSelected(user.username)
    setDraft({
      username: user.username,
      displayName: user.displayName,
      password: '',
      role: user.role,
      disabled: user.disabled,
    })
    setError('')
  }

  const startCreate = () => {
    setSelected(null)
    setDraft(emptyDraft)
    setError('')
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
      const payload = {
        displayName: draft.displayName.trim(),
        role: draft.role,
        disabled: draft.disabled,
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

  return (
    <div data-no-drag-select className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/35 backdrop-blur-sm animate-overlay-in" onClick={onClose} />
      <div className="relative z-10 grid max-h-[86vh] w-full max-w-5xl grid-cols-1 overflow-hidden rounded-[2rem] border border-white/60 bg-white/95 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-950/95 dark:ring-white/10 md:grid-cols-[20rem_1fr]">
        <aside className="min-h-0 border-b border-gray-100 p-4 dark:border-white/[0.08] md:border-b-0 md:border-r">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">用户管理</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500">每个用户都有独立历史记录</p>
            </div>
            <button
              onClick={startCreate}
              className="rounded-xl bg-blue-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-600"
            >
              新建
            </button>
          </div>

          <div className="max-h-[54vh] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
            {loading ? (
              <div className="py-10 text-center text-sm text-gray-400">加载中...</div>
            ) : users.map((user) => (
              <button
                key={user.username}
                onClick={() => selectUser(user)}
                className={`w-full rounded-2xl p-3 text-left transition ${selected === user.username ? 'bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-500/10 dark:ring-blue-500/20' : 'hover:bg-gray-50 dark:hover:bg-white/[0.04]'}`}
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
                <div className="mt-2 flex gap-2 text-[11px] text-gray-400">
                  <span>{user.taskCount ?? 0} 条记录</span>
                  <span>·</span>
                  <span>{user.imageCount ?? 0} 张图片</span>
                  {user.disabled && <span className="text-red-400">· 已禁用</span>}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {isCreating ? '新建用户' : `编辑 ${selectedUser?.username}`}
              </h4>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                管理员可以新增、修改、禁用或删除其他用户。
              </p>
            </div>
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

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">用户名</span>
              <input
                value={draft.username}
                onChange={(e) => setDraft((prev) => ({ ...prev, username: e.target.value.toLowerCase() }))}
                disabled={!isCreating}
                placeholder="如 mom / dad"
                className="w-full rounded-2xl border border-gray-200/70 bg-white/70 px-4 py-3 text-sm outline-none transition focus:border-blue-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-100"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">显示名称</span>
              <input
                value={draft.displayName}
                onChange={(e) => setDraft((prev) => ({ ...prev, displayName: e.target.value }))}
                placeholder="如 妈妈"
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
          </div>

          <label className="mt-4 flex items-center justify-between rounded-2xl border border-gray-200/70 bg-gray-50/70 px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
            <span>
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-200">禁用账号</span>
              <span className="text-xs text-gray-400">禁用后该用户无法登录，历史记录会保留。</span>
            </span>
            <input
              type="checkbox"
              checked={draft.disabled}
              disabled={selectedUser?.isSelf}
              onChange={(e) => setDraft((prev) => ({ ...prev, disabled: e.target.checked }))}
              className="h-5 w-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>

          {!isCreating && selectedUser && (
            <div className="mt-4 rounded-2xl bg-gray-50/70 p-4 text-xs text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
              <div>创建时间：{formatTime(selectedUser.createdAt)}</div>
              <div className="mt-1">更新时间：{formatTime(selectedUser.updatedAt)}</div>
            </div>
          )}

          {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-500 dark:bg-red-500/10 dark:text-red-300">{error}</p>}

          <div className="mt-auto flex flex-col-reverse gap-2 pt-6 sm:flex-row sm:justify-end">
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
  )
}
