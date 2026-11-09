// Bolos da Juju — service worker
// - Guarda o aplicativo para abrir sem internet (sempre tenta a versão nova primeiro).
// - Recebe comprovantes compartilhados de outros apps (ex.: app do banco → Compartilhar → Bolos da Juju).
// - Nunca guarda os dados do Supabase: eles sempre vêm da internet.
const APP = 'juju-app-v1', CDN = 'juju-cdn-v1', SHARE = 'juju-share';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'identidade-bolos-da-juju.webp', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => ![APP, CDN, SHARE].includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);

  // Comprovante compartilhado por outro aplicativo
  if (req.method === 'POST' && url.origin === location.origin && url.searchParams.has('share-target')) {
    e.respondWith((async () => {
      try {
        const form = await req.formData(), file = form.get('file');
        if (file && file.size) {
          const c = await caches.open(SHARE);
          await c.put('shared-file', new Response(file, {
            headers: { 'content-type': file.type || 'application/octet-stream', 'x-name': encodeURIComponent(file.name || 'comprovante') }
          }));
        }
      } catch (err) {}
      return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
    })());
    return;
  }

  if (req.method !== 'GET') return;
  // Dados e consultas: sempre direto da internet
  if (/supabase\.co$/.test(url.hostname) || url.hostname === 'brasilapi.com.br' || /fazenda|receita/.test(url.hostname)) return;
  // Áudio usa pedidos parciais (Range): deixa passar direto
  if (req.headers.has('range')) return;

  // Arquivos do próprio app: tenta a internet (versão nova) e cai para a cópia guardada
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req).then(res => {
        if (res.status === 200) { const copy = res.clone(); caches.open(APP).then(c => c.put(req, copy)).catch(() => {}); }
        return res;
      }).catch(() =>
        caches.match(req, { ignoreSearch: req.mode === 'navigate' })
          .then(m => m || (req.mode === 'navigate' ? caches.match('index.html') : undefined))
          .then(m => m || new Response('Sem internet', { status: 503 }))
      )
    );
    return;
  }

  // Bibliotecas e fontes (Supabase JS, leitor de QR/notas, Google Fonts): guarda depois da primeira vez
  if (/jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com|tessdata/.test(url.hostname + url.pathname)) {
    e.respondWith(caches.open(CDN).then(c => c.match(req).then(m => m || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') c.put(req, res.clone()).catch(() => {});
      return res;
    }))));
  }
});

// Toque na notificação de encomendas: abre o aplicativo
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./?go=orders');
  }));
});
