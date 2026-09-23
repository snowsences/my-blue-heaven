// Service worker for My Blue Heaven: lets the installed app open offline
// and skips re-downloading the libraries on repeat visits.
//  - The app's own files (same origin): network first, so an online load
//    always gets the latest version — the cached copy is only used offline.
//  - Versioned libraries (Firebase SDK, SheetJS): cache first. A given URL
//    never changes, so a cached copy is never stale.
//  - Google Fonts: served from cache, refreshed in the background.
// Everything else — Firestore, sign-in, Last.fm, Cloudinary — isn't touched.
const CACHE = 'mbh-v1';
const SHELL = ['./', './index.html', './manifest.json', './icon-192-v2.png', './favicon-32-v2.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isVersionedLibrary(url){
  return (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'))
    || url.hostname === 'cdn.sheetjs.com';
}

function isFont(url){
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

// Opaque responses (plain <script>/@import loads from another origin) can't
// be checked for success, but are still worth caching.
function cacheable(response){
  return response && (response.ok || response.type === 'opaque');
}

async function networkFirst(request){
  const cache = await caches.open(CACHE);
  try{
    const response = await fetch(request);
    if (cacheable(response)) cache.put(request, response.clone());
    return response;
  }catch(e){
    const cached = await cache.match(request, { ignoreSearch: true })
      || (request.mode === 'navigate' ? await cache.match('./index.html') : undefined);
    if (cached) return cached;
    throw e;
  }
}

async function cacheFirst(request){
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (cacheable(response)) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(event){
  const cache = await caches.open(CACHE);
  const cached = await cache.match(event.request);
  const refresh = fetch(event.request).then((response) => {
    if (cacheable(response)) cache.put(event.request, response.clone());
    return response;
  });
  if (cached){
    event.waitUntil(refresh.catch(() => {}));
    return cached;
  }
  return refresh;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) event.respondWith(networkFirst(request));
  else if (isVersionedLibrary(url)) event.respondWith(cacheFirst(request));
  else if (isFont(url)) event.respondWith(staleWhileRevalidate(event));
});
