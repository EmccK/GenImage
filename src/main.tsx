import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { installMobileViewportGuards } from './lib/viewport'

installMobileViewportGuards()

const LEGACY_SW_RELOAD_FLAG = 'genimage-legacy-sw-cleanup-reloaded'

async function cleanupLegacyServiceWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false

  try {
    const appBaseUrl = new URL(import.meta.env.BASE_URL || './', window.location.href).href
    const registrations = await navigator.serviceWorker.getRegistrations()
    const appRegistrations = registrations.filter((registration) => {
      if (new URL(registration.scope).origin !== window.location.origin) return false
      return appBaseUrl.startsWith(registration.scope) || registration.scope.startsWith(appBaseUrl)
    })
    const hadController = Boolean(navigator.serviceWorker.controller)

    await Promise.all(appRegistrations.map((registration) => registration.unregister()))

    let deletedCacheCount = 0
    if ('caches' in window) {
      const cacheKeys = await caches.keys()
      const genimageCaches = cacheKeys.filter((key) => key.startsWith('genimage'))
      deletedCacheCount = genimageCaches.length
      await Promise.all(genimageCaches.map((key) => caches.delete(key)))
    }

    // 当前页面如果仍被旧 SW 控制，继续启动会让 /app-api/tasks 仍可能被旧缓存污染。
    // 注销后自动重载一次，确保后续历史记录请求直接走网络。
    if (hadController && sessionStorage.getItem(LEGACY_SW_RELOAD_FLAG) !== '1') {
      sessionStorage.setItem(LEGACY_SW_RELOAD_FLAG, '1')
      window.location.reload()
      return true
    }

    sessionStorage.removeItem(LEGACY_SW_RELOAD_FLAG)
  } catch {
    /* ignore */
  }

  return false
}

async function bootstrap() {
  if (await cleanupLegacyServiceWorker()) return

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
