const root = self.registration.scope
const prefix = 'chaimi-shell:' + root + ':'
const version = prefix + '__BUILD__'
const assets = new Set((/* ASSETS */ []).map(file => new URL(file, root).href))
const index = new URL('index.html', root).href

self.addEventListener('install', event => {
 event.waitUntil(caches.open(version).then(cache => cache.addAll([...assets].map(url => new Request(url, { cache: 'reload' })))))
})
self.addEventListener('activate', event => {
 event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith(prefix) && name !== version) await caches.delete(name)
  await self.clients.claim()
 })())
})
self.addEventListener('fetch', event => {
 const request = event.request
 if (request.method !== 'GET') return
 const target = new URL(request.url)
 const home = request.mode === 'navigate' && (target.origin + target.pathname === root || target.origin + target.pathname === index)
 if (!home && !assets.has(request.url)) return
 event.respondWith((async () => {
  const cache = await caches.open(version)
  return await cache.match(home ? index : request.url) || fetch(request)
 })())
})
