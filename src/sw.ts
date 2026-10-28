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
const CACHE_VERSION: string = `${CACHE_PREFIX}v4-aurora-1`;

const SHARE_TTL = 24 * 60 * 60 * 1000;
function openShareInbox(): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('slipsense_share_inbox', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('images', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function receiveSharedReceipt(request: Request): Promise<Response> {
  const headers = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' };
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) return new Response('ต้องแชร์ไฟล์ภาพ', { status: 415, headers });
  if (Number(request.headers.get('content-length')) > 21 * 1024 * 1024) return new Response('ไฟล์ใหญ่เกินกำหนด', { status: 413, headers });
  let db;
  try {
    const data = await request.formData();
    const files = data.getAll('receipt');
    const file: any = files[0];
    if (files.length !== 1 || !file || typeof file === 'string' || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return new Response('รองรับภาพ JPEG, PNG หรือ WebP หนึ่งภาพ', { status: 415, headers });
    if (!file.size || file.size > 20 * 1024 * 1024) return new Response('ขนาดภาพต้องไม่เกิน 20 MB', { status: 413, headers });
    const id = crypto.randomUUID();
    const now = Date.now();
    db = await openShareInbox();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('images', 'readwrite');
      const store = tx.objectStore('images');
      const req = store.getAll();
      req.onsuccess = () => {
        const alive = req.result.filter(row => row.expires > now && row.state !== 'acked');
        req.result.filter(row => row.expires <= now).forEach(row => store.delete(row.id));
        if (alive.length >= 5 || alive.reduce((sum, row) => sum + (row.file?.size || 0), file.size) > 40 * 1024 * 1024) { tx.abort(); return; }
        store.put({ id, file, created: now, expires: now + SHARE_TTL, state: 'pending', owner: null, transactionId: crypto.randomUUID() });
      };
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(new Error('quota'));
    });
    return Response.redirect(new URL(`./index.html?share=${encodeURIComponent(id)}`, (self as any).registration.scope).href, 303);
  } catch (_) {
    return new Response('รับภาพไม่สำเร็จ พื้นที่อาจเต็ม กรุณาเลือกภาพจากอัลบั้ม', { status: 507, headers });
  } finally { db?.close(); }
}

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

  const shareAction = new URL('./share-target', (self as any).registration.scope);
  if (request.method === 'POST' && url.origin === shareAction.origin && url.pathname === shareAction.pathname) {
    const response = receiveSharedReceipt(request);
    event.respondWith(response);
    event.waitUntil(response.then(() => undefined));
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
