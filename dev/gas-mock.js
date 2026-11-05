// Simulador en memoria de los servicios de Apps Script usados por el backend.
// Sirve para probar el código real de backend/*.gs en Node, sin Google. Solo para desarrollo.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function crearEntorno(opts) {
  const o = opts || {};
  let seq = 0;
  const nid = p => (p || 'id') + '_' + (++seq).toString(36) + crypto.randomBytes(6).toString('hex');
  const files = {};       // id -> file
  const folders = {};     // id -> folder
  const props = {};
  const cache = {};
  const mails = [];

  /* ---------- Sheets ---------- */
  class Range {
    constructor(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr || 1; this.nc = nc || 1; }
    getValues() {
      const out = [];
      for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sh._get(this.r + i, this.c + j)); out.push(row); }
      return out;
    }
    setValues(v) { v.forEach((row, i) => row.forEach((x, j) => this.sh._set(this.r + i, this.c + j, x))); return this; }
    setValue(v) { this.sh._set(this.r, this.c, v); return this; }
    setFontWeight() { return this; }
    setNumberFormat() { return this; }
    getRow() { return this.r; }
    createTextFinder(text) {
      const rng = this; let entire = false;
      const f = {
        matchEntireCell(b) { entire = b; return f; },
        findAll() {
          const out = [];
          for (let i = 0; i < rng.nr; i++) for (let j = 0; j < rng.nc; j++) {
            const v = rng.sh._get(rng.r + i, rng.c + j);
            const s = v instanceof Date ? v.toISOString() : String(v);
            if (entire ? s === text : s.indexOf(text) >= 0) out.push(new Range(rng.sh, rng.r + i, rng.c + j));
          }
          return out;
        }
      };
      return f;
    }
  }
  class Sheet {
    constructor(name) { this.name = name; this.rows = []; }
    _get(r, c) { const row = this.rows[r - 1]; const v = row ? row[c - 1] : undefined; return v === undefined ? '' : v; }
    _set(r, c, v) {
      while (this.rows.length < r) this.rows.push([]);
      if (typeof v === 'string' && v.startsWith("'")) v = v.slice(1);          // como Sheets: el apóstrofo fuerza texto
      else if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && v.length < 15 && !/^0\d/.test(v)) v = Number(v); // Sheets convierte números
      this.rows[r - 1][c - 1] = v;
    }
    getName() { return this.name; }
    getRange(r, c, nr, nc) { return new Range(this, r, c, nr, nc); }
    getDataRange() { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
    getLastRow() { let n = this.rows.length; while (n > 0 && !(this.rows[n - 1] || []).some(x => x !== '' && x !== undefined)) n--; return n; }
    getLastColumn() { return this.rows.reduce((m, r) => Math.max(m, (r || []).length), 0); }
    getMaxRows() { return 1000; }
    appendRow(vals) { const r = this.getLastRow() + 1; vals.forEach((v, j) => this._set(r, j + 1, v)); return this; }
    setFrozenRows() { return this; }
    protect() { const p = { setDescription: () => p, removeEditors: () => p, getEditors: () => [], canDomainEdit: () => false, setDomainEdit: () => p }; return p; }
  }
  class Spreadsheet {
    constructor(name) { this.id = nid('ss'); this.name = name; this.sheets = [new Sheet('Hoja 1')]; files[this.id] = { id: this.id, name: name, parents: [], ss: this, mime: 'application/vnd.google-apps.spreadsheet', created: new Date() }; }
    getId() { return this.id; }
    getSheetByName(n) { return this.sheets.filter(s => s.name === n)[0] || null; }
    insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
    getSheets() { return this.sheets.slice(); }
    deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); }
  }
  const SpreadsheetApp = {
    create: n => new Spreadsheet(n),
    openById: id => { const f = files[id]; if (!f || !f.ss) throw new Error('No existe la planilla ' + id); return f.ss; }
  };

  /* ---------- Drive ---------- */
  const it = arr => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  function mkFolder(name, parent) {
    const f = { id: nid('fo'), name: name, parent: parent ? parent.id : null };
    folders[f.id] = f;
    return folderApi(f);
  }
  function folderApi(f) {
    return {
      getId: () => f.id, getName: () => f.name,
      createFolder: n => mkFolder(n, f),
      getFoldersByName: n => it(Object.values(folders).filter(x => x.parent === f.id && x.name === n).map(folderApi)),
      createFile: blob => { const id = nid('fi'); files[id] = { id: id, name: blob.getName(), parents: [f.id], bytes: blob.getBytes(), mime: blob.getContentType(), created: new Date() }; return fileApi(files[id]); },
      getFiles: () => it(Object.values(files).filter(x => x.parents.indexOf(f.id) >= 0).map(fileApi)),
      getParents: () => it(f.parent ? [folderApi(folders[f.parent])] : [])
    };
  }
  function fileApi(fl) {
    return {
      getId: () => fl.id, getName: () => fl.name,
      moveTo: folder => { fl.parents = [folder.getId()]; },
      getParents: () => it(fl.parents.map(id => folderApi(folders[id]))),
      getBlob: () => blobApi(fl.bytes || Buffer.from(''), fl.mime, fl.name),
      makeCopy: (n, folder) => { const id = nid('fi'); files[id] = Object.assign({}, fl, { id: id, name: n, parents: [folder.getId()], created: new Date() }); return fileApi(files[id]); },
      getDateCreated: () => fl.created,
      setTrashed: () => { delete files[fl.id]; }
    };
  }
  const DriveApp = {
    createFolder: n => mkFolder(n, null),
    getFolderById: id => { if (!folders[id]) throw new Error('No existe la carpeta ' + id); return folderApi(folders[id]); },
    getFileById: id => { if (!files[id]) throw new Error('No existe el archivo ' + id); return fileApi(files[id]); }
  };

  /* ---------- Utilities y demás ---------- */
  function blobApi(bytes, mime, name) { return { getBytes: () => Array.from(bytes), getContentType: () => mime, getName: () => name }; }
  const Utilities = {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(String(s), 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)),
    getUuid: () => crypto.randomUUID(),
    base64Decode: s => Array.from(Buffer.from(s, 'base64')),
    base64Encode: b => Buffer.from(b.map(x => x & 255)).toString('base64'),
    newBlob: (bytes, mime, name) => blobApi(Buffer.from(bytes.map(x => x & 255)), mime, name),
    formatDate: (d, tz, fmt) => {
      const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
        .formatToParts(d).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
      return fmt.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour === '24' ? '00' : p.hour).replace('mm', p.minute).replace('ss', p.second);
    }
  };
  const PropertiesService = { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) };
  const CacheService = { getScriptCache: () => ({ get: k => { const e = cache[k]; return e && e.exp > Date.now() ? e.v : null; }, put: (k, v, s) => { cache[k] = { v: v, exp: Date.now() + (s || 600) * 1000 }; }, remove: k => { delete cache[k]; } }) };
  const LockService = { getScriptLock: () => ({ tryLock: () => true, waitLock: () => true, releaseLock: () => {} }) };
  const ContentService = { MimeType: { JSON: 'json' }, createTextOutput: s => ({ _s: s, setMimeType() { return this; }, getContent() { return this._s; } }) };
  const MailApp = { sendEmail: m => mails.push(m) };
  const Session = { getActiveUser: () => ({ getEmail: () => o.adminEmail || 'admin@example.com' }), getEffectiveUser: () => ({ getEmail: () => o.adminEmail || 'admin@example.com' }) };
  // Tokens de Google simulados: "test:<email>" se acepta como válido.
  const UrlFetchApp = {
    fetch: url => {
      const tok = decodeURIComponent(String(url).split('id_token=')[1] || '');
      if (!tok.startsWith('test:')) return { getResponseCode: () => 400, getContentText: () => '{}' };
      const body = { aud: props.GOOGLE_CLIENT_ID, iss: 'accounts.google.com', email: tok.slice(5), email_verified: 'true', exp: String(Math.floor(Date.now() / 1000) + 3600) };
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify(body) };
    }
  };
  const ScriptApp = { getProjectTriggers: () => [], deleteTrigger: () => {}, newTrigger: () => { const t = { timeBased: () => t, everyDays: () => t, atHour: () => t, create: () => t }; return t; } };
  const Logger = { log: () => {} };

  const ctx = { SpreadsheetApp, DriveApp, Utilities, PropertiesService, CacheService, LockService, ContentService, MailApp, Session, UrlFetchApp, ScriptApp, Logger, console };
  vm.createContext(ctx);
  const dir = path.join(__dirname, '..', 'backend');
  fs.readdirSync(dir).filter(f => f.endsWith('.gs')).sort().forEach(f => vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }));
  // Los const de nivel superior no quedan en el contexto: se exponen explícitamente.
  vm.runInContext('globalThis.__exp = { PLANTILLAS, APP, ROUTES };', ctx);

  return {
    ctx: ctx, props: props, mails: mails, files: files,
    post: body => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).getContent()),
    run: (fn, ...args) => ctx[fn].apply(null, args)
  };
}

module.exports = { crearEntorno };
