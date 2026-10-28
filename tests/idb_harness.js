'use strict';
// Small asynchronous IDB harness: serial transactions, completion after all
// requests, copy-on-write rollback, structuredClone preserves shared Blobs.
function createIndexedDB() {
  const databases = new Map();
  const api = { failWrites: false, open(name, version = 1) {
    const req = {};
    setImmediate(() => {
      const fresh = !databases.has(name);
      if (fresh) databases.set(name, { stores: new Map(), version, queue: [], busy: false });
      const state = databases.get(name);
      const upgrade = fresh || version > state.version;
      state.version = Math.max(version, state.version);
      const db = { close() {}, objectStoreNames: { contains: n => state.stores.has(n) },
        createObjectStore(n) { state.stores.set(n, new Map()); return { createIndex() {} }; },
        transaction(names, mode = 'readonly') {
          names = Array.isArray(names) ? names : [names];
          const operations = [];
          let started = false, ended = false, pending = 0, copies;
          const tx = { error: null, abort() {
            if (ended) return;
            ended = true;
            setImmediate(() => { tx.onabort?.(); finish(); });
          }, objectStore(n) {
            if (!names.includes(n) || !state.stores.has(n)) throw new Error('NotFoundError');
            const request = (op, key, value) => {
              const r = {}; pending++;
              const run = () => setImmediate(() => {
                if (ended) return;
                try {
                  const store = copies.get(n);
                  if (['put', 'delete', 'clear'].includes(op) && api.failWrites) throw new Error('QuotaExceededError');
                  if (op === 'get') r.result = structuredClone(store.get(key));
                  if (op === 'getAll') r.result = [...store.values()].map(v => structuredClone(v));
                  if (op === 'put') { store.set(value.id, structuredClone(value)); r.result = value.id; }
                  if (op === 'delete') store.delete(key);
                  if (op === 'clear') store.clear();
                  r.onsuccess?.({ target: r });
                } catch (error) { tx.error = error; r.onerror?.(); tx.abort(); }
                pending--; check();
              });
              if (started) run(); else operations.push(run);
              return r;
            };
            return { get: key => request('get', key), getAll: () => request('getAll'),
              put: value => request('put', null, value), delete: key => request('delete', key), clear: () => request('clear') };
          } };
          function finish() { state.busy = false; next(); }
          function check() {
            if (pending || ended) return;
            setImmediate(() => {
              if (pending || ended) return;
              ended = true;
              if (mode === 'readwrite') copies.forEach((store, name) => state.stores.set(name, store));
              tx.oncomplete?.(); finish();
            });
          }
          function start() {
            started = true;
            copies = new Map(names.map(n => [n, new Map(state.stores.get(n))]));
            operations.forEach(run => run()); check();
          }
          function next() {
            if (state.busy || !state.queue.length) return;
            state.busy = true; setImmediate(state.queue.shift());
          }
          state.queue.push(start); next(); return tx;
        }
      };
      req.result = db;
      if (upgrade) req.onupgradeneeded?.({ target: req });
      req.onsuccess?.({ target: req });
    });
    return req;
  } };
  return api;
}
module.exports = { createIndexedDB };
