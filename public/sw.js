const CACHE_PREFIX = 'genimage'

async function clearGenImageCaches() {
  const keys = await caches.keys()
  await Promise.all(
    keys
      .filter((key) => key.startsWith(CACHE_PREFIX))
      .map((key) => caches.delete(key)),
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil(clearGenImageCaches())
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    clearGenImageCaches()
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: 'GENIMAGE_LEGACY_SW_REMOVED' })
        }
      }),
  )
})

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
