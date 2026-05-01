import { useState } from 'react'

interface Props {
  usernameRequired: boolean
  onLogin: (payload: { username?: string; password: string }) => Promise<void>
}

export default function LoginScreen({ usernameRequired, onLogin }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onLogin({ username: username.trim() || undefined, password })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_32rem),linear-gradient(135deg,#f8fafc,#eef2ff)] dark:bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.24),transparent_32rem),linear-gradient(135deg,#020617,#111827)] flex items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-2xl shadow-blue-950/10 backdrop-blur dark:border-white/[0.08] dark:bg-gray-950/80 dark:shadow-black/30"
      >
        <div className="mb-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500 text-white shadow-lg shadow-blue-500/30">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">私有图片工作台</h1>
        </div>

        <div className="space-y-3">
          {usernameRequired && (
            <label className="block">
              <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">账号</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                className="w-full rounded-2xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-100"
                placeholder="请输入账号"
              />
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">密码</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              className="w-full rounded-2xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-100"
              placeholder="请输入访问密码"
            />
          </label>
        </div>

        {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-500 dark:bg-red-500/10 dark:text-red-300">{error}</p>}

        <button
          type="submit"
          disabled={!password || loading || (usernameRequired && !username.trim())}
          className="mt-5 w-full rounded-2xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none dark:disabled:bg-white/[0.08]"
        >
          {loading ? '登录中...' : '进入工作台'}
        </button>
      </form>
    </main>
  )
}
