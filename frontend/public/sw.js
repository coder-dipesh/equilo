const STATIC_CACHE_NAME = 'equilo-static-v1'

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Never cache API or auth-related requests
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/accounts/')
  ) {
    return
  }

  // Navigation requests: network first, fall back to cached app shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/index.html').then((response) => {
          if (response) return response
          return new Response('<!doctype html><html><body><p>You&apos;re offline. Please reconnect to use Equilo.</p></body></html>', {
            headers: { 'Content-Type': 'text/html' },
          })
        }),
      ),
    )
    return
  }

  // Static assets: cache-first strategy
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request)
          .then((response) => {
            const clone = response.clone()
            caches.open(STATIC_CACHE_NAME).then((cache) => cache.put(request, clone))
            return response
          })
          .catch(() => cached || Promise.reject(new Error('Network error')))
      }),
    )
  }
})

