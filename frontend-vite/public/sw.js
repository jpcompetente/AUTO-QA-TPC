const CACHE_NAME = 'auto-qa-tpc-camera-v1';
const APP_SHELL = ['/', '/?mode=camera', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        for (const url of APP_SHELL) {
          try {
            // Attempt to add each resource individually so one failure doesn't abort install
            // (useful during development when some routes/assets may not be served).
            // Only attempt same-origin requests.
            const reqUrl = new URL(url, self.location.href);
            if (reqUrl.origin === self.location.origin) {
              // Use fetch then put to avoid opaque or CORS failures from addAll
              const resp = await fetch(reqUrl.href, { cache: 'no-store' });
              if (resp && resp.ok) await cache.put(reqUrl.href, resp.clone());
            }
          } catch {
            // ignore individual resource failures
          }
        }
        await self.skipWaiting();
      } catch {
        // If the install step fails entirely, fail gracefully — don't block activation.
      }
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve();
        }),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }
  // Never cache API calls
  if (requestUrl.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(event.request);
        } catch {
          const resp = await caches.match('/?mode=camera');
          return resp || (await caches.match('/'));
        }
      })(),
    );
    return;
  }
  event.respondWith(
    (async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      try {
        return await fetch(event.request);
      } catch {
        return cached || new Response(null, { status: 504, statusText: 'Gateway Timeout' });
      }
    })(),
  );
});
