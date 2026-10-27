/**
 * src/sw.ts — TypeScript Source สำหรับ Service Worker ของ SlipSense
 *
 * นโยบายความปลอดภัยและออฟไลน์ (Section 17 & PWA Architecture):
 * 1. Cache เฉพาะไฟล์โครงสร้างแอป (Application Shell) ด้วย Relative Path เพื่อให้รองรับทั้ง Root Site และ GitHub Pages Project Site
 * 2. ห้าม Cache ข้อมูลธุรกรรมจาก Cloud, ผลลัพธ์จาก Gemini AI, หรือ Supabase Auth Session/Token โดยเด็ดขาด
 * 3. ล้างเฉพาะ Cache รุ่นเก่าของ SlipSense ที่มีคำนำหน้า CACHE_PREFIX เท่านั้น
 */

interface SwMessageData {
  type?: 'SKIP_WAITING' | 'GET_VERSION' | string;
}

const CACHE_PREFIX: string = 'slipsense-app-shell-';
const CACHE_VERSION: string = `${CACHE_PREFIX}v1.0.0`;

const APP_SHELL_ASSETS: readonly string[] = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './apple-touch-icon.png',
  './vendor/supabase.min.js'
];

function isSensitiveOrApiRequest(request: Request, url: URL): boolean {
  if (request.method !== 'GET') return true;

  if (request.headers.has('authorization') || request.headers.has('apikey')) {
    return true;
  }

  const href: string = url.href.toLowerCase();
  const pathname: string = url.pathname.toLowerCase();

  const forbiddenPatterns: readonly string[] = [
    '/auth/v1',
    '/rest/v1',
    '/functions/v1',
    '/realtime/v1',
    '/storage/v1',
    'supabase.co',
    'supabase.in',
    'generativelanguage.googleapis.com',
    'googleapis.com'
  ];

  for (const pattern of forbiddenPatterns) {
    if (href.includes(pattern) || pathname.includes(pattern)) {
      return true;
    }
  }

  return false;
}

self.addEventListener('install', (event: any) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache: Cache) => {
      for (const asset of APP_SHELL_ASSETS) {
        try {
          const req = new Request(asset, { cache: 'reload' });
          const res = await fetch(req);
          if (res && res.ok) {
            await cache.put(asset, res);
          }
        } catch (_err) {
          // ข้ามไฟล์ที่โหลดไม่สำเร็จขณะออฟไลน์โดยไม่ทำให้การติดตั้งล้มเหลว
        }
      }
    })
  );
  (self as any).skipWaiting();
});

self.addEventListener('activate', (event: any) => {
  event.waitUntil(
    (async () => {
      const keys: string[] = await caches.keys();
      await Promise.all(
        keys.map((key: string) => {
          if (key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION) {
            return caches.delete(key);
          }
          return Promise.resolve(false);
        })
      );
      await (self as any).clients.claim();
    })()
  );
});

self.addEventListener('message', (event: any) => {
  const data: SwMessageData = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    (self as any).skipWaiting();
  } else if (data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }
});

self.addEventListener('fetch', (event: any) => {
  const { request } = event;
  let url: URL;
  try {
    url = new URL(request.url);
  } catch (_e) {
    return;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  if (isSensitiveOrApiRequest(request, url)) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(CACHE_VERSION);
            cache.put('./index.html', networkResponse.clone());
          }
          return networkResponse;
        } catch (_err) {
          const cache = await caches.open(CACHE_VERSION);
          const cachedIndex = (await cache.match('./index.html')) || (await cache.match('./'));
          if (cachedIndex) return cachedIndex;
          return new Response(
            '<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ออฟไลน์ — SlipSense</title></head><body style="font-family:sans-serif;padding:2rem;text-align:center;"><h1>คุณกำลังออฟไลน์</h1><p>กรุณาเชื่อมต่ออินเทอร์เน็ตในครั้งแรกเพื่อโหลดโครงสร้างแอป SlipSense</p></body></html>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }
      })()
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        const cached = await cache.match(request, { ignoreSearch: true });
        const fetchPromise = fetch(request)
          .then((networkRes) => {
            if (networkRes && networkRes.ok && networkRes.status === 200) {
              cache.put(request, networkRes.clone());
            }
            return networkRes;
          })
          .catch(() => null);

        if (cached) {
          return cached;
        }
        const networkRes = await fetchPromise;
        if (networkRes) {
          return networkRes;
        }
        return new Response('Offline asset unavailable', { status: 504 });
      })()
    );
  }
});
