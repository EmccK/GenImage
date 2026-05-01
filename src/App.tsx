import { useEffect, useState } from 'react'
import { initStore } from './store'
import { useStore } from './store'
import { normalizeBaseUrl } from './lib/api'
import type { ApiMode } from './types'
import { loadServerConfig, loginToServer, logoutFromServer, type ServerConfig } from './lib/serverClient'
import Header from './components/Header'
import SearchBar from './components/SearchBar'
import TaskGrid from './components/TaskGrid'
import InputBar from './components/InputBar'
import DetailModal from './components/DetailModal'
import Lightbox from './components/Lightbox'
import SettingsModal from './components/SettingsModal'
import ConfirmDialog from './components/ConfirmDialog'
import Toast from './components/Toast'
import MaskEditorModal from './components/MaskEditorModal'
import ImageContextMenu from './components/ImageContextMenu'
import LoginScreen from './components/LoginScreen'

export default function App() {
  const setSettings = useStore((s) => s.setSettings)
  const setParams = useStore((s) => s.setParams)
  const [booted, setBooted] = useState(false)
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null)

  useEffect(() => {
    let cancelled = false

    const boot = async () => {
      const config = await loadServerConfig()
      if (cancelled) return
      setServerConfig(config)

      if (config.authEnabled && !config.authenticated) {
        setBooted(true)
        return
      }

      const searchParams = new URLSearchParams(window.location.search)
      const nextSettings: { baseUrl?: string; apiKey?: string; codexCli?: boolean; apiMode?: ApiMode } = {}

      const apiUrlParam = searchParams.get('apiUrl')
      if (apiUrlParam !== null) {
        nextSettings.baseUrl = normalizeBaseUrl(apiUrlParam.trim())
      }

      const apiKeyParam = searchParams.get('apiKey')
      if (apiKeyParam !== null) {
        nextSettings.apiKey = apiKeyParam.trim()
      }

      const codexCliParam = searchParams.get('codexCli')
      if (codexCliParam !== null) {
        nextSettings.codexCli = codexCliParam.trim().toLowerCase() === 'true'
      }

      const apiModeParam = searchParams.get('apiMode')
      if (apiModeParam === 'images' || apiModeParam === 'responses') {
        nextSettings.apiMode = apiModeParam
      }

      setSettings({
        ...(config.defaultSettings ?? {}),
        ...nextSettings,
        ...(config.lockSettings ? config.lockedSettings : {}),
      })
      if (config.lockParams && config.lockedParams) {
        setParams(config.lockedParams)
      }

      if (searchParams.has('apiUrl') || searchParams.has('apiKey') || searchParams.has('codexCli') || searchParams.has('apiMode')) {
        searchParams.delete('apiUrl')
        searchParams.delete('apiKey')
        searchParams.delete('codexCli')
        searchParams.delete('apiMode')

        const nextSearch = searchParams.toString()
        const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
        window.history.replaceState(null, '', nextUrl)
      }

      await initStore()
      if (!cancelled) setBooted(true)
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [setParams, setSettings])

  useEffect(() => {
    const preventPageImageDrag = (e: DragEvent) => {
      if ((e.target as HTMLElement | null)?.closest('img')) {
        e.preventDefault()
      }
    }

    document.addEventListener('dragstart', preventPageImageDrag)
    return () => document.removeEventListener('dragstart', preventPageImageDrag)
  }, [])

  const handleLogin = async (payload: { username?: string; password: string }) => {
    const config = await loginToServer(payload)
    setServerConfig(config)
    setSettings({
      ...(config.defaultSettings ?? {}),
      ...(config.lockSettings ? config.lockedSettings : {}),
    })
    if (config.lockParams && config.lockedParams) setParams(config.lockedParams)
    await initStore()
  }

  const handleLogout = async () => {
    await logoutFromServer()
    setServerConfig((prev) => prev
      ? { ...prev, authenticated: false, currentUser: null, isAdmin: false }
      : prev)
  }

  if (!booted) {
    return (
      <main className="min-h-screen flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
        正在加载...
      </main>
    )
  }

  if (serverConfig?.authEnabled && !serverConfig.authenticated) {
    return <LoginScreen usernameRequired={serverConfig.usernameRequired} onLogin={handleLogin} />
  }

  return (
    <>
      <Header onLogout={handleLogout} />
      <main data-home-main data-drag-select-surface className="pb-48">
        <div className="safe-area-x max-w-7xl mx-auto">
          <SearchBar />
          <TaskGrid />
        </div>
      </main>
      <InputBar />
      <DetailModal />
      <Lightbox />
      <SettingsModal />
      <ConfirmDialog />
      <Toast />
      <MaskEditorModal />
      <ImageContextMenu />
    </>
  )
}
