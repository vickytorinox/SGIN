// Almacenamiento local: kv (token, config, sesión de trabajo) y cola de envíos pendientes.
const DB_NAME = 'sg-puesto';
const DB_VER = 1;
let dbp = null;

function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if (!d.objectStoreNames.contains('cola')) d.createObjectStore('cola', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return db().then(d => new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => resolve(r ? r.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const kv = {
  get: k => tx('kv', 'readonly', s => s.get(k)),
  set: (k, v) => tx('kv', 'readwrite', s => s.put(v, k)),
  del: k => tx('kv', 'readwrite', s => s.delete(k)),
  clear: () => tx('kv', 'readwrite', s => s.clear())
};

export const cola = {
  put: item => tx('cola', 'readwrite', s => s.put(item)),
  del: id => tx('cola', 'readwrite', s => s.delete(id)),
  all: () => tx('cola', 'readonly', s => s.getAll()).then(a => (a || []).sort((x, y) => x.creado - y.creado)),
  count: () => tx('cola', 'readonly', s => s.count())
};
