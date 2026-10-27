const CACHE_PREFIX='slipsense-app-shell-';
const CACHE_VERSION=`${CACHE_PREFIX}v1.0.0`;
const APP_SHELL_ASSETS=[
'./',
'./index.html',
'./manifest.json',
'./icons/icon-192.png',
'./icons/icon-512.png',
'./apple-touch-icon.png',
'./vendor/supabase.min.js'
];
function isSensitiveOrApiRequest(request,url){
if(request.method!=='GET')return true;
if(request.headers.has('authorization')||request.headers.has('apikey')){
return true;
}
const href=url.href.toLowerCase();
const pathname=url.pathname.toLowerCase();
const forbiddenPatterns=[
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
for(const pattern of forbiddenPatterns){
if(href.includes(pattern)||pathname.includes(pattern)){
return true;
}
}
return false;
}
self.addEventListener('install',(event)=>{
event.waitUntil(
caches.open(CACHE_VERSION).then(async(cache)=>{
for(const asset of APP_SHELL_ASSETS){
try{
const req=new Request(asset,{cache:'reload'});
const res=await fetch(req);
if(res&&res.ok){
await cache.put(asset,res);
}
}catch(_err){
}
}
})
);
(self).skipWaiting();
});
self.addEventListener('activate',(event)=>{
event.waitUntil(
(async()=>{
const keys=await caches.keys();
await Promise.all(
keys.map((key)=>{
if(key.startsWith(CACHE_PREFIX)&&key!==CACHE_VERSION){
return caches.delete(key);
}
return Promise.resolve(false);
})
);
await(self).clients.claim();
})()
);
});
self.addEventListener('message',(event)=>{
const data=event.data||{};
if(data.type==='SKIP_WAITING'){
(self).skipWaiting();
}else if(data.type==='GET_VERSION'&&event.ports&&event.ports[0]){
event.ports[0].postMessage({version:CACHE_VERSION});
}
});
self.addEventListener('fetch',(event)=>{
const{request}=event;
let url;
try{
url=new URL(request.url);
}catch(_e){
return;
}
if(url.protocol!=='http:'&&url.protocol!=='https:'){
return;
}
if(isSensitiveOrApiRequest(request,url)){
return;
}
if(request.mode==='navigate'){
event.respondWith(
(async()=>{
try{
const networkResponse=await fetch(request);
if(networkResponse&&networkResponse.ok){
const cache=await caches.open(CACHE_VERSION);
cache.put('./index.html',networkResponse.clone());
}
return networkResponse;
}catch(_err){
const cache=await caches.open(CACHE_VERSION);
const cachedIndex=(await cache.match('./index.html'))||(await cache.match('./'));
if(cachedIndex)return cachedIndex;
return new Response(
'<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ออฟไลน์ — SlipSense</title></head><body style="font-family:sans-serif;padding:2rem;text-align:center;"><h1>คุณกำลังออฟไลน์</h1><p>กรุณาเชื่อมต่ออินเทอร์เน็ตในครั้งแรกเพื่อโหลดโครงสร้างแอป SlipSense</p></body></html>',
{status:503,headers:{'Content-Type':'text/html; charset=utf-8'}}
);
}
})()
);
return;
}
if(url.origin===self.location.origin){
event.respondWith(
(async()=>{
const cache=await caches.open(CACHE_VERSION);
const cached=await cache.match(request,{ignoreSearch:true});
const fetchPromise=fetch(request)
.then((networkRes)=>{
if(networkRes&&networkRes.ok&&networkRes.status===200){
cache.put(request,networkRes.clone());
}
return networkRes;
})
.catch(()=>null);
if(cached){
return cached;
}
const networkRes=await fetchPromise;
if(networkRes){
return networkRes;
}
return new Response('Offline asset unavailable',{status:504});
})()
);
}
});
