// ═══════════════════════════════════════════════════════
// MMK VERESİYE — Service Worker
// Amaç: index.html (uygulama kabuğu) ilk açılıştan sonra
// önbelleğe alınır; internet olmadan siteye gidildiğinde bile
// sayfa (ve dolayısıyla giriş ekranı) açılabilir. Veriler zaten
// uygulama içindeki IndexedDB + "bekleyen işlemler" mekanizması
// ile çevrimdışı yönetiliyor — bu dosya sadece sayfanın kendisini
// çevrimdışı erişilebilir yapar.
// ═══════════════════════════════════════════════════════

const CACHE_NAME = 'mmk-veresiye-shell-v1';
const APP_SHELL = [
  './',
  './index.html'
];

// Kurulum: uygulama kabuğunu önbelleğe al
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((e) => console.warn('SW install cache hatası:', e))
  );
});

// Aktivasyon: eski cache sürümlerini temizle
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Sadece GET isteklerini önbellekle
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Supabase (veritabanı) isteklerine ASLA dokunma — bunlar zaten
  // uygulama içinde sbGet/sbPost/sbPatch/sbDelete ile
  // IndexedDB tabanlı çevrimdışı mantığı tarafından yönetiliyor.
  // Service Worker'ın araya girmesi o mekanizmayı bozabilir.
  if (url.hostname.endsWith('supabase.co')) return;

  // Sayfa navigasyonu (kullanıcı adrese gidiyor / sayfayı yeniliyor):
  // önce ağdan dene, başarısız olursa (çevrimdışıysa) önbellekten sun.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', resClone));
          return res;
        })
        .catch(() => caches.match('./index.html').then((res) => res || caches.match('./')))
    );
    return;
  }

  // Diğer statik kaynaklar (Google Fonts, CDN script'leri vb.):
  // önbellek varsa hemen onu ver, arka planda güncelle.
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
