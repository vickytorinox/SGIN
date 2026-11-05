// SG Ingresos · App Puesto (PWA offline-first)
import { kv, cola } from './store.js';
import { api } from './api.js';
import { h, icon, chips, labeled, badge, fotoBoton, blobToB64, toast, setKids } from './ui.js';

const LOCK_MS = 10 * 60 * 1000;           // bloqueo por inactividad
const SYNC_MS = 30 * 1000;                // reintento de envíos
const REFRESH_MS = 10 * 60 * 1000;        // refresco de config y prohibidos
const PENDIENTE_VIEJO_MS = 2 * 3600 * 1000;
const ERRORES_TRANSITORIOS = ['red', 'reintentar', 'ocupado', 'error_interno', 'demasiados_intentos'];

const S = { token: null, bundle: null, screen: 'cargando', ctx: {}, F: null, sentido: 'INGRESO', pos: null };
const $app = document.getElementById('app');

/* ---------------- utilidades ---------------- */
const digits = v => String(v == null ? '' : v).replace(/\D/g, '');
const patente = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
const online = () => navigator.onLine;
const cfg = () => (S.bundle && S.bundle.config) || { categorias: [], autoriza: [], modulos: {}, etiquetas: {} };
const esCountry = () => cfg().modo_salida === 'cerrar';
const horaCorta = (d = new Date()) => d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
}
function nuevoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const a = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(a).map(x => x.toString(16).padStart(2, '0')).join('');
}
async function esProhibidoLocal(doc, pat) {
  const b = S.bundle;
  if (!b || !b.prohibidos) return false;
  if (doc && digits(doc).length >= 6 && b.prohibidos.docs.indexOf(await sha(b.salt + '|' + digits(doc))) >= 0) return true;
  if (pat && patente(pat).length >= 6 && b.prohibidos.patentes.indexOf(await sha(b.salt + '|' + patente(pat))) >= 0) return true;
  return false;
}
function pedirPosicion() {
  S.pos = new Promise(resolve => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve({}),
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 120000 }
    );
  });
}
async function posicion() {
  if (!S.pos) pedirPosicion();
  return Promise.race([S.pos, new Promise(r => setTimeout(() => r({}), 1500))]);
}

/* ---------------- caché local de fichas (búsqueda instantánea) ----------------
 * Guarda las fichas consultadas o cargadas en este celular (máx. 800, 30 días).
 * Al buscar, si la ficha está en caché se abre al instante y se actualiza desde el servidor en segundo plano.
 */
const FICHAS_MAX = 800, FICHAS_DIAS = 30;
async function fichas() {
  const f = (await kv.get('fichas')) || {};
  const lim = Date.now() - FICHAS_DIAS * 86400000;
  Object.keys(f).forEach(k => { if (!f[k] || f[k]._ts < lim) delete f[k]; });
  return f;
}
async function guardarFicha(p) {
  if (!p || !p.nro_doc) return;
  const f = await fichas();
  f[digits(p.nro_doc)] = Object.assign({}, p, { _ts: Date.now() });
  const keys = Object.keys(f);
  if (keys.length > FICHAS_MAX) keys.sort((a, b) => f[a]._ts - f[b]._ts).slice(0, keys.length - FICHAS_MAX).forEach(k => delete f[k]);
  await kv.set('fichas', f);
}
async function buscarLocal(q) {
  const f = await fichas();
  const d = /^[\d.\s-]+$/.test(q) ? digits(q) : '';
  if (d) return f[d] ? [f[d]] : [];
  const pat = patente(q);
  const porPat = Object.values(f).filter(p => (p.patentes || []).indexOf(pat) >= 0);
  if (pat.length >= 6 && porPat.length) return porPat;
  const norm = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const words = norm(q).split(/\s+/).filter(Boolean);
  return Object.values(f).filter(p => { const n = norm(p.nombre + ' ' + p.apellido); return words.every(w => n.indexOf(w) >= 0); });
}

/* ---------------- sesión del guardia (10 min, persiste al recargar) ---------------- */
function getSesion() { try { return JSON.parse(localStorage.getItem('sg_sesion') || 'null'); } catch (e) { return null; } }
function setSesion(s) { if (s) localStorage.setItem('sg_sesion', JSON.stringify(s)); else localStorage.removeItem('sg_sesion'); }
function sesionValida() { const s = getSesion(); return s && Date.now() - s.ts < LOCK_MS ? s : null; }
function tocar() { const s = getSesion(); if (s && Date.now() - s.ts < LOCK_MS) { s.ts = Date.now(); setSesion(s); } }
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, tocar, { passive: true }));
setInterval(() => {
  if (['activar', 'login', 'cargando'].indexOf(S.screen) < 0 && !sesionValida()) go('login', { bloqueo: true });
}, 15000);

/* ---------------- navegación ---------------- */
const SCREENS = {};
function go(screen, ctx) {
  S.screen = screen;
  S.ctx = ctx || {};
  render();
  window.scrollTo(0, 0);
}
function render() {
  const fn = SCREENS[S.screen] || SCREENS.cargando;
  const conHeader = ['activar', 'login', 'cargando'].indexOf(S.screen) < 0;
  setKids($app, ...(conHeader ? [header(), fn()] : [fn()]));
  actualizarIndicadores();
}

function header() {
  const s = getSesion();
  const b = S.bundle || {};
  const titulos = { home: esCountry() ? 'Nuevo ingreso' : 'Control de personal', form: S.F ? (catActual() || {}).label || 'Carga' : 'Carga', prohibido: 'Alerta', excepcion: 'Ingreso excepcional', ok: 'Listo', adentro: 'Adentro ahora', pendientes: 'Pendientes de envío', elegir: 'Resultados', prohibir: 'Registrar prohibición' };
  return h('header', { class: 'top' },
    h('div', { class: 'toprow' },
      S.screen !== 'home' ? h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Volver', onclick: () => go('home') }, icon('back', 22)) : null,
      h('div', { class: 'toptitle' },
        h('div', { class: 'h t1' }, titulos[S.screen] || ''),
        h('div', { class: 't2' }, (b.puesto || '') + (s ? ' · ' + s.nombre : ''))
      ),
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Bloquear pantalla', onclick: () => { setSesion(null); go('login', { bloqueo: true }); } }, icon('lock', 20))
    ),
    h('div', { class: 'pills' },
      h('span', { class: 'pill', id: 'pill-red' }, ''),
      h('button', { class: 'pill', id: 'pill-cola', type: 'button', onclick: () => go('pendientes') }, '')
    )
  );
}

async function actualizarIndicadores() {
  const red = document.getElementById('pill-red');
  const pc = document.getElementById('pill-cola');
  if (red) { red.textContent = online() ? 'En línea' : 'Sin conexión'; red.className = 'pill ' + (online() ? 'ok' : 'warn'); }
  if (!pc) return;
  const items = await cola.all();
  if (!items.length) { pc.textContent = 'Todo enviado'; pc.className = 'pill ok'; return; }
  const viejo = items.some(i => Date.now() - i.creado > PENDIENTE_VIEJO_MS);
  pc.textContent = items.length + (items.length === 1 ? ' pendiente de envío' : ' pendientes de envío');
  pc.className = 'pill ' + (viejo ? 'bad' : 'warn');
}
window.addEventListener('online', () => { actualizarIndicadores(); sync(); refrescar(); });
window.addEventListener('offline', actualizarIndicadores);

/* ---------------- sincronización ---------------- */
let sincronizando = false;
async function serializar(obj) {
  if (obj instanceof Blob) return blobToB64(obj);
  if (Array.isArray(obj)) return Promise.all(obj.map(serializar));
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj)) out[k] = await serializar(obj[k]);
    return out;
  }
  return obj;
}
async function sync() {
  if (sincronizando || !online() || !S.token) return;
  sincronizando = true;
  try {
    const items = await cola.all();
    for (const it of items) {
      try {
        if (it.tipo === 'registrar') {
          await api('puesto.registrar', { token: S.token, cuil: it.cuil, mov: await serializar(it.mov) }, 90000);
        } else if (it.tipo === 'prohibir') {
          await api('puesto.prohibir', { token: S.token, cuil: it.cuil, prohibicion: await serializar(it.prohibicion) }, 60000);
        } else if (it.tipo === 'salida') {
          await api('puesto.salida', { token: S.token, cuil: it.cuil, ref_reg_id: it.ref_reg_id, salida_en: it.salida_en });
        }
        await cola.del(it.id);
      } catch (e) {
        it.intentos = (it.intentos || 0) + 1;
        it.error = e.message;
        await cola.put(it);
        if (ERRORES_TRANSITORIOS.indexOf(e.code) >= 0) break;     // se reintenta más tarde, respetando el orden
        if (e.code === 'dispositivo_invalido') { await desactivado(e.message); break; }
      }
    }
  } finally {
    sincronizando = false;
    actualizarIndicadores();
  }
}
setInterval(sync, SYNC_MS);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { sync(); actualizarIndicadores(); } });

async function refrescar() {
  const s = sesionValida();
  if (!online() || !S.token || !s) return;
  try {
    const b = await api('puesto.sync', { token: S.token, cuil: s.cuil });
    S.bundle = b;
    await kv.set('bundle', b);
    if (esCountry()) {
      // lista "Adentro ahora" al día para avisar reingresos aunque no se abra esa pantalla
      const r = await api('puesto.adentro', { token: S.token, cuil: s.cuil });
      const pendientes = ((await kv.get('adentro')) || []).filter(x => /pendiente/.test(x.detalle || ''));
      await kv.set('adentro', pendientes.concat(r.adentro));
    }
  } catch (e) {
    if (e.code === 'dispositivo_invalido') desactivado(e.message);
  }
}
setInterval(refrescar, REFRESH_MS);

async function desactivado(msg) {
  S.token = null;
  await kv.del('token');
  setSesion(null);
  go('activar', { msg: msg || 'Este celular fue desactivado.' });
}

/* ---------------- pantallas: activación y login ---------------- */
SCREENS.cargando = () => h('main', { class: 'splash' }, h('div', { class: 'h logo' }, 'SG INGRESOS'));

function codigoDelLink() {
  const m = /[#&]codigo=([A-Za-z0-9-]+)/.exec(location.hash || '');
  if (m) history.replaceState(null, '', location.pathname);   // el código no queda en el historial
  return m ? decodeURIComponent(m[1]) : '';
}

SCREENS.activar = () => {
  const inp = h('input', { class: 'in big', placeholder: 'XXXXX-XXXXX', autocomplete: 'off', autocapitalize: 'characters', value: S.ctx.codigo || '' });
  const err = h('div', { class: 'banner bad', hidden: !S.ctx.msg }, S.ctx.msg || '');
  const btn = h('button', { class: 'btn', type: 'button' }, 'Activar este celular');
  btn.onclick = async () => {
    btn.disabled = true; err.hidden = true;
    try {
      const r = await api('puesto.activar', { codigo: inp.value });
      S.token = r.token;
      await kv.set('token', r.token);
      toast('Celular activado para ' + r.puesto);
      go('login', {});
    } catch (e) {
      err.textContent = e.code === 'red' ? 'Se necesita conexión para activar el celular.' : e.message;
      err.hidden = false; btn.disabled = false;
    }
  };
  return h('main', { class: 'auth' },
    h('div', { class: 'brand' }, icon('shield', 56), h('h1', { class: 'h' }, 'SG INGRESOS'), h('p', {}, 'Activación del celular del puesto')),
    h('div', { class: 'card' },
      h('p', { class: 'muted' }, 'Ingresá el código de activación que te dio Spartan. Se usa una sola vez.'),
      labeled('Código de activación', inp), err, btn)
  );
};

SCREENS.login = () => {
  const b = S.bundle || {};
  const inp = h('input', { class: 'in big', inputmode: 'numeric', placeholder: '20-12345678-9', autocomplete: 'off' });
  const err = h('div', { class: 'banner bad', hidden: true });
  const btn = h('button', { class: 'btn', type: 'button' }, 'Ingresar al turno');
  const entrar = async () => {
    const cuil = digits(inp.value);
    if (cuil.length !== 11) { err.textContent = 'El CUIL tiene 11 dígitos.'; err.hidden = false; return; }
    btn.disabled = true; err.hidden = true;
    const conocidos = (await kv.get('cuils')) || {};
    try {
      const bundle = await api('puesto.login', { token: S.token, cuil: cuil });
      S.bundle = bundle;
      await kv.set('bundle', bundle);
      conocidos[cuil] = bundle.guardia.nombre;
      await kv.set('cuils', conocidos);
      setSesion({ cuil: cuil, nombre: bundle.guardia.nombre, ts: Date.now() });
      pedirPosicion();
      sync();
      go(S.F ? 'form' : 'home');   // si se bloqueó en medio de una carga, se retoma
    } catch (e) {
      if (e.code === 'red' && S.bundle && conocidos[cuil]) {
        // Sin señal: se acepta un CUIL que ya trabajó en este celular.
        setSesion({ cuil: cuil, nombre: conocidos[cuil], ts: Date.now() });
        go(S.F ? 'form' : 'home');
      } else if (e.code === 'dispositivo_invalido') {
        desactivado(e.message);
      } else {
        err.textContent = e.code === 'red' ? 'Sin conexión: este CUIL todavía no ingresó en este celular.' : e.message;
        err.hidden = false; btn.disabled = false;
      }
    }
  };
  btn.onclick = entrar;
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') entrar(); });
  setTimeout(() => inp.focus(), 50);
  return h('main', { class: 'auth' },
    h('div', { class: 'brand' }, icon('shield', 56), h('h1', { class: 'h' }, 'SG INGRESOS'), h('p', {}, [b.objetivo && b.objetivo.nombre, b.puesto].filter(Boolean).join(' · '))),
    h('div', { class: 'card' },
      S.ctx.bloqueo ? h('div', { class: 'banner warn' }, 'Pantalla bloqueada. Ingresá tu CUIL para seguir.') : null,
      labeled('CUIL del vigilador', inp), err, btn),
    h('p', { class: 'foot-note' }, 'Los registros sin enviar se conservan en el celular.')
  );
};

/* ---------------- home ---------------- */
SCREENS.home = () => (esCountry() ? homeCountry() : homeRegistro());

/** Actualiza en segundo plano la ficha abierta desde la caché. Si resultó prohibida, salta la alerta. */
async function refrescarFicha(nro) {
  if (!online()) return;
  try {
    const r = await api('puesto.buscar', { token: S.token, cuil: getSesion().cuil, q: nro });
    if (!r.persona) return;
    guardarFicha(r.persona);
    if (!S.F || digits(S.F.persona.nro_doc) !== digits(nro)) return;
    if (r.persona.estado === 'PROHIBIDO' && !S.F.excepcional) return go('prohibido', { persona: r.persona });
    S.F.ficha = r.persona;
    S.F.desdeCache = false;
    if (S.screen === 'form') render();
  } catch (e) { /* se queda con la ficha de la caché */ }
}

function homeCountry() {
  const inp = h('input', { class: 'in xl', placeholder: 'DNI, nombre o patente', autocomplete: 'off', enterkeyhint: 'search' });
  const err = h('div', { class: 'banner bad', hidden: true });
  const btn = h('button', { class: 'btn', type: 'button' }, 'Buscar');
  const buscar = async () => {
    const q = inp.value.trim();
    if (q.length < 2) return;
    btn.disabled = true; btn.textContent = 'Buscando…'; err.hidden = true;
    const dni = /^[\d.\s-]+$/.test(q) ? digits(q) : '';
    const pat = dni ? '' : patente(q);
    if (await esProhibidoLocal(dni, pat)) {
      // Prohibido según la lista del celular: alerta inmediata; si hay señal se traen los detalles.
      if (!online()) return go('prohibido', { offline: true, dni: dni, patente: pat });
    }
    const locales = await buscarLocal(q);
    if (locales.length === 1 && locales[0].estado !== 'PROHIBIDO' && !(await esProhibidoLocal(locales[0].nro_doc, ''))) {
      abrirForm({ persona: locales[0], desdeCache: true });
      refrescarFicha(locales[0].nro_doc);
      return;
    }
    try {
      if (!online()) throw Object.assign(new Error(''), { code: 'red' });
      const r = await api('puesto.buscar', { token: S.token, cuil: getSesion().cuil, q: q });
      if (r.persona) {
        guardarFicha(r.persona);
        if (r.persona.estado === 'PROHIBIDO') return go('prohibido', { persona: r.persona });
        return abrirForm({ persona: r.persona });
      }
      if (r.encontrados && r.encontrados.length) return go('elegir', { lista: r.encontrados });
      if (await esProhibidoLocal(dni, pat)) return go('prohibido', { offline: true, dni: dni, patente: pat });
      abrirForm({ dni: dni, patente: pat });
    } catch (e) {
      if (e.code === 'red') {
        if (await esProhibidoLocal(dni, pat)) return go('prohibido', { offline: true, dni: dni, patente: pat });
        abrirForm({ dni: dni, patente: pat, sinConexion: true });
      } else if (e.code === 'dispositivo_invalido') desactivado(e.message);
      else if (e.code === 'cuil_invalido') go('login', {});
      else { err.textContent = e.message; err.hidden = false; btn.disabled = false; btn.textContent = 'Buscar'; }
    }
  };
  btn.onclick = buscar;
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') buscar(); });
  setTimeout(() => inp.focus(), 50);
  return h('main', { class: 'content' },
    h('div', { class: 'card' }, labeled('Buscar por DNI, nombre o patente', inp), err, btn),
    h('button', { class: 'tile-row', type: 'button', onclick: () => go('adentro') },
      h('span', { class: 'tile-title' }, 'Adentro ahora'),
      h('span', { class: 'muted' }, 'Ver quién está adentro y registrar salidas'),
      icon('chevron', 22))
  );
}

function homeRegistro() {
  const seg = h('div', { class: 'seg' }, ['INGRESO', 'EGRESO'].map(s =>
    h('button', { type: 'button', class: 'sg' + (S.sentido === s ? (s === 'EGRESO' ? ' onout' : ' on') : ''), onclick: () => { S.sentido = s; render(); } }, s)));
  const tiles = h('div', { class: 'tiles' }, cfg().categorias.map((c, i) =>
    h('button', { type: 'button', class: 'tile' + (i === 0 ? ' big' : ''), onclick: () => abrirForm({ categoria: c.key }) },
      h('span', { class: 'tile-title' }, c.label), h('span', { class: 'tile-sub' }, S.sentido.toLowerCase()))));
  const lista = h('div', { class: 'card' }, h('h2', { class: 'sect' }, 'Últimos movimientos de este celular'));
  kv.get('recientes').then(rs => {
    (rs || []).slice(0, 8).forEach(r => lista.append(h('div', { class: 'recent' },
      badge(r.sentido, r.sentido === 'EGRESO' ? 'dark' : 'ok'),
      h('div', { class: 'grow' }, h('div', { class: 'strong' }, r.nombre), h('div', { class: 'muted small' }, r.det)),
      h('span', { class: 'muted small' }, r.hora))));
    if (!rs || !rs.length) lista.append(h('p', { class: 'muted' }, 'Todavía no hay movimientos en este turno.'));
  });
  return h('main', { class: 'content' }, seg, tiles, lista);
}

SCREENS.elegir = () => h('main', { class: 'content' },
  h('p', { class: 'muted' }, 'Hay varias coincidencias. Elegí la persona:'),
  S.ctx.lista.map(p => h('button', { type: 'button', class: 'tile-row', onclick: async () => {
    try {
      const r = await api('puesto.buscar', { token: S.token, cuil: getSesion().cuil, persona_id: p.persona_id });
      if (r.persona.estado === 'PROHIBIDO') go('prohibido', { persona: r.persona }); else abrirForm({ persona: r.persona });
    } catch (e) { toast(e.message, 'bad'); }
  } },
    h('span', { class: 'tile-title' }, p.apellido + ', ' + p.nombre),
    h('span', { class: 'muted' }, 'DNI ' + p.nro_doc + ' · ' + (p.estado || '')),
    icon('chevron', 22))),
  h('button', { class: 'btn2', type: 'button', onclick: () => abrirForm({}) }, 'No es ninguna: cargar persona nueva')
);

/* ---------------- formulario dinámico ---------------- */
function catActual() { return S.F ? cfg().categorias.filter(c => c.key === S.F.categoria)[0] : null; }

function abrirForm(o) {
  const p = o.persona || null;
  const cats = cfg().categorias;
  let categoria = o.categoria || (p && cats.some(c => c.key === p.categoria) ? p.categoria : (cats[0] && cats[0].key));
  const ult = (p && p.ultimo) || {};
  S.F = {
    categoria: categoria,
    sentido: esCountry() ? 'INGRESO' : S.sentido,
    ficha: p,
    sinConexion: !!o.sinConexion,
    desdeCache: !!o.desdeCache,
    persona: { tipo_doc: (p && p.tipo_doc) || 'DNI', nro_doc: p ? p.nro_doc : (o.dni || ''), nombre: p ? p.nombre : '', apellido: p ? p.apellido : '', estado: p ? p.estado : '' },
    campos: { patente: o.patente || ult.patente || (p && p.patentes && p.patentes[0]) || '', subtipo: (p && p.subtipo) || '', empresa: (p && p.empresa) || '', telefono: (p && p.telefono) || '', motivo: ult.motivo || '' },
    fotos: {},
    autoriza: { tipo: ult.autoriza_tipo || (cfg().autoriza[0] || ''), lote: ult.autoriza_lote || '', apellido: ult.autoriza_apellido || '', nombre: ult.autoriza_nombre || '' },
    acomp: [],
    docs: {},
    cacheo: { foto: null, resultado: 'Sin novedad' },
    excepcional: o.excepcional || null,
    aleatorio: false,
    error: ''
  };
  const cac = cfg().modulos.cacheo || {};
  if (cac.activo && cac.aleatorio_cada > 0) {
    kv.get('contador_cacheo').then(n => { n = (n || 0) + 1; S.F && (S.F._contador = n); S.F && (S.F.aleatorio = n % cac.aleatorio_cada === 0); if (S.screen === 'form') render(); });
  }
  if (p && esCountry()) {
    kv.get('adentro').then(l => {
      const x = (l || []).filter(a => a.dni && digits(a.dni) === digits(p.nro_doc))[0];
      if (x && S.F && S.F.ficha === p) { S.F._adentro = x; if (S.screen === 'form') render(); }
    });
  }
  pedirPosicion();
  go('form');
}

function tocaCacheo(cat, sentido) {
  const c = cfg().modulos.cacheo || {};
  return !!(cat && cat.cacheo && c.activo && (c.momento === 'ambos' || c.momento === sentido.toLowerCase()));
}

function estadoDoc(def) {
  const F = S.F;
  const nuevo = F.docs[def.key];
  if (nuevo && nuevo.medio === 'whatsapp' && nuevo.archivo) return { label: 'Captura de WhatsApp adjunta · falta el original', kind: 'warn', ok: false };
  if (nuevo && nuevo.archivo) return { label: (nuevo.medio === 'foto' ? 'Foto' : 'Archivo') + ' incorporado', kind: 'ok', ok: true };
  const prev = F.ficha && (F.ficha.docs || []).filter(d => d.tipo === def.key)[0];
  if (prev) {
    if (prev.estado === 'incorporado') return { label: 'Incorporado' + (prev.vencimiento ? ' · vence ' + prev.vencimiento : ''), kind: 'ok', ok: true };
    if (prev.estado === 'vencido') return { label: 'Vencido (' + prev.vencimiento + ')', kind: 'bad', ok: false };
    if (prev.estado === 'whatsapp') return { label: 'Captura de WhatsApp · falta el original', kind: 'warn', ok: false };
  }
  return { label: 'Faltante', kind: 'warn', ok: false };
}

function inputCampo(f) {
  const F = S.F;
  const val = F.campos[f.key] || '';
  const set = v => { F.campos[f.key] = v; };
  if (f.tipo === 'lista') {
    return h('div', { class: 'field' }, h('span', { class: 'lbl' }, f.label, f.obligatorio ? h('span', { class: 'req' }, ' *') : null),
      chips(f.opciones || [], val, v => { set(v); render(); }));
  }
  if (f.tipo === 'foto') {
    return h('div', { class: 'field' }, h('span', { class: 'lbl' }, f.label, f.obligatorio ? h('span', { class: 'req' }, ' *') : null),
      fotoBoton('Sacar foto', !!F.fotos[f.key], blob => { F.fotos[f.key] = blob; render(); }));
  }
  if (f.tipo === 'patente' && F.ficha && F.ficha.patentes && F.ficha.patentes.length) {
    const ops = F.ficha.patentes.concat(['Sin vehículo']);
    const actual = val || 'Sin vehículo';
    const otra = h('input', { class: 'in', placeholder: 'Otra patente', value: ops.indexOf(actual) < 0 ? val : '', style: 'text-transform:uppercase' });
    otra.addEventListener('input', () => set(patente(otra.value)));
    return h('div', { class: 'field' }, h('span', { class: 'lbl' }, f.label, f.obligatorio ? h('span', { class: 'req' }, ' *') : null),
      chips(ops, actual, v => { set(v === 'Sin vehículo' ? '' : v); render(); }), otra);
  }
  const attrs = { class: 'in', value: val };
  if (f.tipo === 'numero') attrs.inputmode = 'numeric';
  if (f.tipo === 'patente') { attrs.style = 'text-transform:uppercase'; attrs.autocapitalize = 'characters'; }
  if (f.tipo === 'fecha') attrs.type = 'date';
  const el = f.tipo === 'texto_largo' ? h('textarea', { class: 'in', rows: '3' }) : h('input', attrs);
  if (f.tipo === 'texto_largo') el.value = val;
  el.addEventListener('input', () => set(f.tipo === 'patente' ? patente(el.value) : el.value));
  if (f.chofer) el.addEventListener('blur', () => autocompletarChofer(el.value));
  return labeled(f.label, el, f.obligatorio);
}

async function autocompletarChofer(dni) {
  if (digits(dni).length < 6 || !online()) return;
  try {
    const r = await api('puesto.buscar', { token: S.token, cuil: getSesion().cuil, q: digits(dni) });
    if (r.persona && S.F && !S.F.campos.chofer_nombre) { S.F.campos.chofer_nombre = r.persona.apellido + ', ' + r.persona.nombre; render(); }
  } catch (e) { /* sin autocompletado */ }
}

async function autocompletarPersona(dni) {
  if (digits(dni).length < 6 || !online() || (S.F.persona.nombre && S.F.persona.apellido)) return;
  try {
    const r = await api('puesto.buscar', { token: S.token, cuil: getSesion().cuil, q: digits(dni) });
    if (r.persona && S.F) {
      if (r.persona.estado === 'PROHIBIDO' && !S.F.excepcional) return go('prohibido', { persona: r.persona });
      S.F.ficha = r.persona;
      Object.assign(S.F.persona, { nombre: r.persona.nombre, apellido: r.persona.apellido, tipo_doc: r.persona.tipo_doc || 'DNI', estado: r.persona.estado });
      render();
    }
  } catch (e) { /* sin autocompletado */ }
}

SCREENS.form = () => {
  const F = S.F;
  const C = cfg();
  const cat = catActual();
  if (!cat) return h('main', { class: 'content' }, h('p', {}, 'Categoría no disponible.'));
  const partes = [];

  if (!esCountry()) {
    partes.push(h('div', { class: 'seg' }, ['INGRESO', 'EGRESO'].map(s =>
      h('button', { type: 'button', class: 'sg' + (F.sentido === s ? (s === 'EGRESO' ? ' onout' : ' on') : ''), onclick: () => { F.sentido = s; S.sentido = s; render(); } }, s))));
  }
  if (F.excepcional) partes.push(h('div', { class: 'banner bad' }, 'Ingreso excepcional de una persona PROHIBIDA · autorizó ' + F.excepcional.autoriza_tipo + (F.excepcional.nombre ? ' ' + F.excepcional.nombre : '') + '. La persona sigue prohibida.'));
  if (F.sinConexion) partes.push(h('div', { class: 'banner warn' }, 'Sin conexión: no se pudo traer la ficha. Cargá todos los datos; se envían al volver la señal.'));
  if (F.error) partes.push(h('div', { class: 'banner bad', role: 'alert' }, F.error));

  // Ficha existente
  if (F.ficha) {
    partes.push(h('div', { class: 'card' },
      h('div', { class: 'row' },
        h('div', { class: 'avatar h' }, ((F.ficha.nombre || ' ')[0] + (F.ficha.apellido || ' ')[0]).toUpperCase()),
        h('div', { class: 'grow' },
          h('div', { class: 'h name' }, F.ficha.nombre + ' ' + F.ficha.apellido),
          h('p', { class: 'muted' }, (F.ficha.tipo_doc || 'DNI') + ' ' + F.ficha.nro_doc + (F.ficha.ultimo ? ' · último ingreso ' + F.ficha.ultimo.fecha : '') + (F.desdeCache ? ' · actualizando…' : '')),
          badge(F.ficha.estado || 'NUEVO', F.ficha.estado === 'EVENTUAL' ? 'warn' : 'ok'))),
      !F.excepcional ? h('button', { type: 'button', class: 'linkred', onclick: () => go('prohibir', { persona: F.ficha }) }, 'Registrar una prohibición para esta persona') : null));
    if (F._adentro) partes.push(h('div', { class: 'banner warn' }, 'Figura adentro desde ' + F._adentro.hora + ' sin salida registrada. Si registrás este ingreso, el anterior se cierra como "salida no registrada".'));
  } else if (esCountry()) {
    partes.push(h('div', { class: 'banner warn' }, 'Persona nueva. Completá toda la ficha ahora: queda guardada para los próximos ingresos.'));
  }

  // Categoría (country)
  if (esCountry()) {
    partes.push(h('div', { class: 'card' }, h('h2', { class: 'sect' }, 'Tipo de ingreso'),
      chips(C.categorias.map(c => ({ value: c.key, label: c.label })), F.categoria, v => { F.categoria = v; F.error = ''; render(); }),
      cat.estados ? h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Estado'),
        chips(['AUTORIZADO', 'EVENTUAL'], F.persona.estado === 'EVENTUAL' ? 'EVENTUAL' : (F.persona.estado || cat.estado_default), v => { F.persona.estado = v; render(); })) : null));
  }

  // Datos de la persona
  if (cat.persona) {
    const tipoDoc = h('select', { class: 'in' }, ['DNI', 'Pasaporte', 'Otro'].map(t => h('option', { value: t }, t)));
    tipoDoc.value = F.persona.tipo_doc || 'DNI';
    tipoDoc.addEventListener('change', () => { F.persona.tipo_doc = tipoDoc.value; });
    const nro = h('input', { class: 'in big', inputmode: F.persona.tipo_doc === 'DNI' ? 'numeric' : 'text', value: F.persona.nro_doc });
    nro.addEventListener('input', () => { F.persona.nro_doc = nro.value; });
    nro.addEventListener('blur', () => { if (!F.ficha) autocompletarPersona(nro.value); });
    const nom = h('input', { class: 'in', value: F.persona.nombre, autocomplete: 'off' });
    nom.addEventListener('input', () => { F.persona.nombre = nom.value; });
    const ape = h('input', { class: 'in', value: F.persona.apellido, autocomplete: 'off' });
    ape.addEventListener('input', () => { F.persona.apellido = ape.value; });
    partes.push(h('div', { class: 'card' }, h('h2', { class: 'sect' }, 'Datos del ingresante'),
      h('div', { class: 'row2' }, labeled('Documento', tipoDoc), labeled('Número', nro, true)),
      h('div', { class: 'row2' }, labeled('Nombre', nom, true), labeled('Apellido', ape, true))));
  }

  // Campos configurables
  const visibles = cat.campos.filter(f => f.visible);
  if (visibles.length) partes.push(h('div', { class: 'card' }, h('h2', { class: 'sect' }, cat.persona ? 'Detalle' : cat.label), visibles.map(inputCampo)));

  // Quién autoriza (country)
  if (C.autoriza && C.autoriza.length && cat.persona) {
    const lote = h('input', { class: 'in', inputmode: 'numeric', value: F.autoriza.lote, list: 'dl-lotes' });
    lote.addEventListener('input', () => {
      F.autoriza.lote = lote.value;
      const r = (S.bundle.residentes || []).filter(x => x.lote === lote.value)[0];
      if (r && !F.autoriza.apellido) { F.autoriza.apellido = r.apellido; apeR.value = r.apellido; }
    });
    const apeR = h('input', { class: 'in', value: F.autoriza.apellido });
    apeR.addEventListener('input', () => { F.autoriza.apellido = apeR.value; });
    const nomA = h('input', { class: 'in', value: F.autoriza.nombre, placeholder: 'Opcional' });
    nomA.addEventListener('input', () => { F.autoriza.nombre = nomA.value; });
    const etiquetaLote = C.etiquetas.lote || 'Lote';
    partes.push(h('div', { class: 'card' }, h('h2', { class: 'sect' }, 'Quién autoriza'),
      chips(C.autoriza, F.autoriza.tipo, v => { F.autoriza.tipo = v; render(); }),
      F.autoriza.tipo === 'Residente'
        ? h('div', { class: 'row2' }, labeled(etiquetaLote, lote, true), labeled('Apellido', apeR, true))
        : labeled('Nombre de quien autoriza', nomA),
      h('datalist', { id: 'dl-lotes' }, (S.bundle.residentes || []).map(r => h('option', { value: r.lote }, r.apellido)))));
  }

  // Acompañantes
  if (C.modulos.acompanantes && cat.persona && esCountry()) {
    partes.push(h('div', { class: 'card' }, h('h2', { class: 'sect' }, 'Acompañantes'),
      h('div', { class: 'step' },
        h('button', { class: 'stepb', type: 'button', 'aria-label': 'Quitar acompañante', onclick: () => { F.acomp.pop(); render(); } }, '−'),
        h('strong', { class: 'stepn' }, String(F.acomp.length)),
        h('button', { class: 'stepb', type: 'button', 'aria-label': 'Agregar acompañante', onclick: () => { if (F.acomp.length < 20) F.acomp.push({ nro_doc: '', nombre: '', apellido: '' }); render(); } }, '+')),
      F.acomp.map((a, i) => {
        const d = h('input', { class: 'in', inputmode: 'numeric', placeholder: 'DNI', value: a.nro_doc, 'aria-label': 'DNI acompañante ' + (i + 1) });
        d.addEventListener('input', () => { a.nro_doc = d.value; });
        const n = h('input', { class: 'in', placeholder: 'Nombre', value: a.nombre, 'aria-label': 'Nombre acompañante ' + (i + 1) });
        n.addEventListener('input', () => { a.nombre = n.value; });
        const ap = h('input', { class: 'in', placeholder: 'Apellido', value: a.apellido, 'aria-label': 'Apellido acompañante ' + (i + 1) });
        ap.addEventListener('input', () => { a.apellido = ap.value; });
        return h('div', { class: 'acomp' }, d, h('div', { class: 'row2' }, n, ap));
      })));
  }

  // Documentación
  if (cat.docs && cat.docs.length) {
    partes.push(h('div', { class: 'card' }, h('h2', { class: 'sect' }, 'Documentación'), cat.docs.map(def => {
      const st = estadoDoc(def);
      const d = F.docs[def.key] || (F.docs[def.key] = { medio: '', archivo: null, vence: '', waAbierto: false });
      const vence = h('input', { class: 'in', type: 'date', value: d.vence });
      vence.addEventListener('change', () => { d.vence = vence.value; });
      return h('div', { class: 'docrow' },
        h('div', { class: 'spread' }, h('strong', {}, def.label), def.bloquea ? badge('Obligatorio', 'bad') : null),
        badge(st.label, st.kind),
        h('div', { class: 'docbtns' },
          fotoBoton('Foto', d.medio === 'foto' && d.archivo, blob => { Object.assign(d, { medio: 'foto', archivo: blob, waAbierto: false }); render(); }, { hechoLabel: 'Foto ✓' }),
          fotoBoton('Archivo', d.medio === 'archivo' && d.archivo, blob => { Object.assign(d, { medio: 'archivo', archivo: blob, waAbierto: false }); render(); }, { accept: 'image/*,application/pdf', capture: false, icono: 'file', hechoLabel: 'Archivo ✓' }),
          h('button', { type: 'button', class: 'docb', onclick: () => { d.waAbierto = !d.waAbierto; render(); } }, icon('chat', 18), 'WhatsApp')),
        d.waAbierto ? h('div', { class: 'wapanel' },
          h('p', {}, h('strong', {}, '¿Llegó por WhatsApp? '), 'Adjuntá una captura de la conversación donde se ve el documento. Queda como constancia hasta que se cargue el original.'),
          fotoBoton('Subir captura de la conversación', false, blob => { Object.assign(d, { medio: 'whatsapp', archivo: blob, waAbierto: false }); render(); }, { capture: false, icono: 'chat' })) : null,
        d.archivo && d.medio !== 'whatsapp' && def.vigencia_meses ? labeled('Vence (opcional)', vence) : null);
    })));
  }

  // Cacheo
  if (tocaCacheo(cat, F.sentido)) {
    const cac = C.modulos.cacheo;
    partes.push(h('div', { class: 'card' },
      h('div', { class: 'spread' }, h('h2', { class: 'sect' }, 'Cacheo'), cac.obligatoria ? badge('Obligatorio', 'warn') : null),
      F.aleatorio ? h('div', { class: 'banner warn' }, 'Cacheo aleatorio: esta persona fue seleccionada para revisión completa.') : null,
      fotoBoton('Sacar foto del bolso', !!F.cacheo.foto, blob => { F.cacheo.foto = blob; F.error = ''; render(); }, { hechoLabel: 'Foto cargada ✓ · repetir' }),
      h('p', { class: 'muted' }, 'Foto del bolso o pertenencias, nunca de la persona.'),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Resultado'), chips(['Sin novedad', 'Con novedad'], F.cacheo.resultado, v => { F.cacheo.resultado = v; render(); }))));
  }

  const btn = h('button', { class: F.excepcional ? 'btnred' : 'btn', type: 'button', onclick: () => enviar(btn) },
    esCountry() ? (F.ficha ? 'Registrar ingreso' : 'Guardar ficha y registrar ingreso') : 'Registrar ' + F.sentido.toLowerCase());
  return h('main', { class: 'form' }, h('div', { class: 'content' }, partes), h('div', { class: 'foot' }, btn));
};

function validar() {
  const F = S.F, C = cfg(), cat = catActual();
  if (cat.persona) {
    if (digits(F.persona.nro_doc).length < 6) return 'Ingresá el número de documento.';
    if (!F.persona.nombre.trim() || !F.persona.apellido.trim()) return 'Completá nombre y apellido.';
  }
  for (const f of cat.campos) {
    if (!f.visible || !f.obligatorio) continue;
    const v = f.tipo === 'foto' ? F.fotos[f.key] : F.campos[f.key];
    if (!v || (typeof v === 'string' && !v.trim())) return 'Completá: ' + f.label + '.';
  }
  if (C.autoriza && C.autoriza.length && cat.persona) {
    if (!F.autoriza.tipo) return 'Indicá quién autoriza.';
    if (F.autoriza.tipo === 'Residente' && (!F.autoriza.lote.trim() || !F.autoriza.apellido.trim())) return 'Indicá ' + (C.etiquetas.lote || 'lote').toLowerCase() + ' y apellido del residente.';
  }
  for (const def of (cat.docs || [])) {
    if (def.bloquea && !estadoDoc(def).ok) {
      const d = F.docs[def.key];
      return 'Falta ' + def.label + ' vigente: es obligatorio para ingresar.' + (d && d.medio === 'whatsapp' ? ' La captura de WhatsApp no reemplaza el documento.' : '');
    }
  }
  if (tocaCacheo(cat, F.sentido) && C.modulos.cacheo.obligatoria && !F.cacheo.foto) return 'La foto de cacheo es obligatoria en el ' + F.sentido.toLowerCase() + '.';
  for (const a of F.acomp) {
    if (digits(a.nro_doc).length < 6 || !a.nombre.trim() || !a.apellido.trim()) return 'Completá DNI, nombre y apellido de cada acompañante (o quitá los vacíos).';
  }
  return '';
}

async function enviar(btn) {
  const F = S.F, C = cfg(), cat = catActual();
  F.error = validar();
  if (F.error) { render(); return; }
  btn.disabled = true;

  // Control de prohibidos con la lista local (funciona sin señal).
  if (!F.excepcional) {
    const docs = [cat.persona ? F.persona.nro_doc : '', F.campos.chofer_dni].concat(F.acomp.map(a => a.nro_doc));
    for (const d of docs) {
      if (await esProhibidoLocal(d, '')) return go('prohibido', { offline: !online(), dni: digits(d), retomar: true });
    }
    if (await esProhibidoLocal('', F.campos.patente)) return go('prohibido', { offline: !online(), patente: F.campos.patente, retomar: true });
  }

  const pos = await posicion();
  const reg_id = nuevoId();
  const docs = Object.keys(F.docs).filter(k => F.docs[k].archivo).map(k => ({ tipo: k, medio: F.docs[k].medio, vence: F.docs[k].vence, archivo: F.docs[k].archivo }));
  const tc = tocaCacheo(cat, F.sentido);
  const mov = {
    reg_id: reg_id, categoria: cat.key, sentido: F.sentido, cargado_en: new Date().toISOString(), lat: pos.lat, lng: pos.lng,
    persona: cat.persona ? { tipo_doc: F.persona.tipo_doc, nro_doc: digits(F.persona.nro_doc), nombre: F.persona.nombre.trim(), apellido: F.persona.apellido.trim(), estado: cat.estados ? (F.persona.estado || cat.estado_default) : '' } : null,
    campos: Object.assign({}, F.campos),
    fotos: Object.assign({}, F.fotos),
    autoriza: C.autoriza && C.autoriza.length && cat.persona ? Object.assign({}, F.autoriza) : null,
    acompanantes: F.acomp.map(a => ({ nro_doc: digits(a.nro_doc), nombre: a.nombre.trim(), apellido: a.apellido.trim() })),
    docs: docs,
    cacheo: tc ? { foto: F.cacheo.foto, resultado: F.cacheo.resultado, aleatorio: F.aleatorio } : null,
    excepcional: F.excepcional
  };
  // Solo se envían los campos visibles.
  Object.keys(mov.campos).forEach(k => { if (!cat.campos.some(f => f.key === k && f.visible)) delete mov.campos[k]; });

  const nombre = cat.persona ? (mov.persona.apellido + ', ' + mov.persona.nombre) : (F.campos.proveedor || F.campos.empresa || cat.label);
  const det = cat.label + (tc ? ' · cacheo ' + F.cacheo.resultado.toLowerCase() : '') + (mov.autoriza && mov.autoriza.lote ? ' · ' + (C.etiquetas.lote || 'Lote') + ' ' + mov.autoriza.lote : '');
  await cola.put({ id: reg_id, tipo: 'registrar', creado: Date.now(), cuil: getSesion().cuil, intentos: 0, error: '', resumen: { nombre: nombre, det: det, sentido: F.sentido }, mov: mov });
  if (F._contador) kv.set('contador_cacheo', F._contador);

  if (cat.persona) {
    const prev = F.ficha || {};
    guardarFicha(Object.assign({}, prev, {
      persona_id: prev.persona_id || '', tipo_doc: mov.persona.tipo_doc, nro_doc: mov.persona.nro_doc, nombre: mov.persona.nombre, apellido: mov.persona.apellido,
      categoria: cat.key, estado: prev.estado || mov.persona.estado || cat.estado_default, subtipo: F.campos.subtipo || prev.subtipo || '', empresa: F.campos.empresa || prev.empresa || '',
      telefono: F.campos.telefono || prev.telefono || '',
      patentes: Array.from(new Set((prev.patentes || []).concat(F.campos.patente ? [patente(F.campos.patente)] : []))),
      docs: (prev.docs || []).filter(d => !docs.some(n => n.tipo === d.tipo)).concat(docs.map(n => ({ tipo: n.tipo, estado: n.medio === 'whatsapp' ? 'whatsapp' : 'incorporado', vencimiento: '', archivo: true }))),
      ultimo: { fecha: new Date().toLocaleString('es-AR'), autoriza_tipo: mov.autoriza ? mov.autoriza.tipo : '', autoriza_lote: mov.autoriza ? mov.autoriza.lote : '', autoriza_apellido: mov.autoriza ? mov.autoriza.apellido : '', autoriza_nombre: mov.autoriza ? mov.autoriza.nombre : '', motivo: F.campos.motivo || '', patente: F.campos.patente || '' }
    }));
  }
  if (esCountry() && cat.persona && F.sentido === 'INGRESO') {
    // si figuraba adentro, se saca de la lista local (el servidor cierra el ingreso anterior)
    const ad = ((await kv.get('adentro')) || []).filter(a => !(a.dni && digits(a.dni) === digits(mov.persona.nro_doc)));
    ad.unshift({ reg_id: reg_id, nombre: mov.persona.apellido + ', ' + mov.persona.nombre, dni: mov.persona.nro_doc, patente: F.campos.patente || '', lote: mov.autoriza ? mov.autoriza.lote : '',
      detalle: cat.label + (mov.autoriza && mov.autoriza.lote ? ' · ' + (C.etiquetas.lote || 'Lote') + ' ' + mov.autoriza.lote : (mov.autoriza && mov.autoriza.tipo ? ' · ' + mov.autoriza.tipo : '')),
      hora: new Date().toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) });
    await kv.set('adentro', ad.slice(0, 1000));
  }
  const rec = (await kv.get('recientes')) || [];
  rec.unshift({ sentido: F.sentido, nombre: nombre, det: det, hora: horaCorta(), reg_id: reg_id, adentro: esCountry() && cat.persona });
  await kv.set('recientes', rec.slice(0, 30));

  S.F = null;
  go('ok', { titulo: (F.sentido === 'EGRESO' ? 'Egreso' : 'Ingreso') + ' registrado', nombre: nombre, det: det, exc: !!mov.excepcional, offline: !online() });
  sync();
}

/* ---------------- prohibido y excepción ---------------- */
SCREENS.prohibido = () => {
  const p = S.ctx.persona;
  const pr = (p && p.prohibicion) || {};
  const quien = p ? (p.nombre + ' ' + p.apellido) : (S.ctx.dni ? 'DNI ' + S.ctx.dni : 'Patente ' + S.ctx.patente);
  const contexto = Object.assign({}, S.ctx);
  return h('main', { class: 'prohibido' },
    h('div', { class: 'pcenter' }, icon('ban', 64), h('div', { class: 'h ptitle' }, 'PROHIBIDO'), h('div', { class: 'h pname' }, quien),
      p ? h('div', { class: 'psub' }, (p.tipo_doc || 'DNI') + ' ' + p.nro_doc + (p.patentes && p.patentes.length ? ' · ' + p.patentes.join(', ') : '')) : null),
    S.ctx.offline || !p
      ? h('div', { class: 'pbox' }, 'Detectado con la lista guardada en el celular. Los detalles de la prohibición se ven con conexión.')
      : h('div', { class: 'pbox' },
        h('div', {}, h('strong', {}, 'Ordenó: '), [pr.ordenado_tipo, pr.ordenado_nombre, pr.ordenado_lote ? 'lote ' + pr.ordenado_lote : ''].filter(Boolean).join(' ') || '—'),
        h('div', {}, h('strong', {}, 'Desde: '), pr.fecha || '—'),
        h('div', {}, h('strong', {}, 'Motivo: '), pr.motivo || '—')),
    h('p', { class: 'pnote' }, 'No se puede registrar el ingreso. El intento queda registrado.'),
    h('div', { class: 'pbtns' },
      h('button', { type: 'button', class: 'pbtn1', onclick: () => go('excepcion', contexto) }, 'Ingreso excepcional'),
      h('button', { type: 'button', class: 'pbtn2', onclick: () => { S.F = null; go('home'); } }, 'No ingresa · volver'))
  );
};

SCREENS.excepcion = () => {
  const C = cfg();
  const tipos = C.autoriza && C.autoriza.length ? C.autoriza : ['Encargado del local', 'Supervisor Spartan'];
  const E = S.ctx.E || (S.ctx.E = { autoriza_tipo: tipos[0], nombre: '', lote: '', apellido: '', medio: 'WhatsApp', motivo: '', constancia: null });
  const err = h('div', { class: 'banner bad', hidden: true });
  const nom = h('input', { class: 'in', value: E.nombre }); nom.addEventListener('input', () => { E.nombre = nom.value; });
  const lote = h('input', { class: 'in', inputmode: 'numeric', value: E.lote }); lote.addEventListener('input', () => { E.lote = lote.value; });
  const ape = h('input', { class: 'in', value: E.apellido }); ape.addEventListener('input', () => { E.apellido = ape.value; });
  const mot = h('textarea', { class: 'in', rows: '3', placeholder: 'Ej: retira pertenencias, acompañado por Intendencia' }); mot.value = E.motivo;
  mot.addEventListener('input', () => { E.motivo = mot.value; });
  const confirmar = () => {
    if (E.autoriza_tipo === 'Residente' ? (!E.lote.trim() || !E.apellido.trim()) : !E.nombre.trim()) { err.textContent = 'Indicá quién autoriza.'; err.hidden = false; return; }
    if (!E.motivo.trim()) { err.textContent = 'Indicá el motivo.'; err.hidden = false; return; }
    const exc = Object.assign({}, E);
    if (S.ctx.retomar && S.F) { S.F.excepcional = exc; S.F.error = ''; go('form'); return; }
    abrirForm({ persona: S.ctx.persona, dni: S.ctx.dni, patente: S.ctx.patente, excepcional: exc, sinConexion: !S.ctx.persona });
  };
  return h('main', { class: 'form' }, h('div', { class: 'content' },
    h('div', { class: 'banner bad' }, 'La persona sigue PROHIBIDA. Esto habilita solo este ingreso y avisa por mail a la administración.'),
    h('div', { class: 'card' }, h('h2', { class: 'sect' }, 'Quién lo autoriza'),
      chips(tipos, E.autoriza_tipo, v => { E.autoriza_tipo = v; render(); }),
      E.autoriza_tipo === 'Residente' ? h('div', { class: 'row2' }, labeled(C.etiquetas.lote || 'Lote', lote, true), labeled('Apellido', ape, true)) : labeled('Nombre de quien autoriza', nom, true),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Medio'), chips(['WhatsApp', 'Llamada', 'Presencial'], E.medio, v => { E.medio = v; render(); })),
      labeled('Motivo', mot, true),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Constancia (captura o foto)'), fotoBoton('Sacar foto o subir captura', !!E.constancia, blob => { E.constancia = blob; render(); }, { capture: false }))),
    err),
    h('div', { class: 'foot' }, h('button', { class: 'btnred', type: 'button', onclick: confirmar }, 'Continuar con el ingreso excepcional')));
};

/* ---------------- resultado, adentro y pendientes ---------------- */
SCREENS.ok = () => h('main', { class: 'okscreen' },
  h('div', { class: 'okicon' }, icon('check', 52)),
  h('div', { class: 'h oktitle' }, S.ctx.titulo.toUpperCase()),
  h('div', { class: 'okname' }, S.ctx.nombre),
  h('p', { class: 'muted' }, S.ctx.det + ' · ' + horaCorta()),
  S.ctx.exc ? h('div', { class: 'banner warn' }, 'Ingreso excepcional: se avisa a la administración y a los supervisores.') : null,
  S.ctx.offline ? h('div', { class: 'banner warn' }, 'Sin conexión: quedó guardado en el celular y se envía solo cuando vuelva la señal.') : null,
  h('div', { class: 'okbtns' },
    h('button', { class: 'btn', type: 'button', onclick: () => go('home') }, esCountry() ? 'Nuevo ingreso' : 'Nuevo movimiento'),
    esCountry() ? h('button', { class: 'btn2', type: 'button', onclick: () => go('adentro') }, 'Ver adentro ahora') : null)
);

SCREENS.adentro = () => {
  const cont = h('div', { class: 'content' }, h('p', { class: 'muted' }, 'Cargando…'));
  const q = h('input', { class: 'in big', placeholder: 'Buscar por nombre, DNI, patente o lote', autocomplete: 'off', enterkeyhint: 'search' });
  const lista$ = h('div', { style: 'display:flex;flex-direction:column;gap:10px' });
  const contador = h('p', { class: 'muted' });
  let lista = [];
  const norm = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const pintar = () => {
    const words = norm(q.value).split(/\s+/).filter(Boolean);
    const qd = digits(q.value);
    const vis = lista.filter(x => {
      if (!words.length) return true;
      const t = norm([x.nombre, x.detalle, x.patente, x.lote ? 'lote ' + x.lote : ''].join(' '));
      return words.every(w => t.indexOf(w) >= 0) || (qd.length >= 3 && digits(x.dni).indexOf(qd) >= 0);
    });
    contador.textContent = (words.length ? vis.length + ' de ' : '') + lista.length + (lista.length === 1 ? ' persona sin salida registrada' : ' personas sin salida registrada');
    setKids(lista$, ...vis.slice(0, 150).map(x => h('div', { class: 'card row' },
      h('div', { class: 'grow' }, h('div', { class: 'strong' }, x.nombre), h('div', { class: 'muted' }, [x.dni ? 'DNI ' + x.dni : '', x.detalle].filter(Boolean).join(' · ')), h('div', { class: 'muted small' }, 'Entró ' + x.hora)),
      h('button', { class: 'btnsm', type: 'button', onclick: async ev => {
        ev.currentTarget.disabled = true;
        await cola.put({ id: 'salida-' + x.reg_id, tipo: 'salida', creado: Date.now(), cuil: getSesion().cuil, ref_reg_id: x.reg_id, salida_en: new Date().toISOString(), resumen: { nombre: x.nombre, det: 'Salida', sentido: 'SALIDA' } });
        await kv.set('adentro', ((await kv.get('adentro')) || []).filter(y => y.reg_id !== x.reg_id));
        lista = lista.filter(y => y.reg_id !== x.reg_id);
        toast('Salida registrada: ' + x.nombre);
        sync();
        pintar();
        q.select();
      } }, 'Salida'))));
    if (vis.length > 150) lista$.append(h('p', { class: 'muted' }, 'Hay ' + (vis.length - 150) + ' más: escribí para filtrar.'));
  };
  q.addEventListener('input', pintar);
  (async () => {
    lista = (await kv.get('adentro')) || [];
    let aviso = '';
    if (online()) {
      try {
        const r = await api('puesto.adentro', { token: S.token, cuil: getSesion().cuil });
        lista = r.adentro;
        await kv.set('adentro', lista);
      } catch (e) { aviso = 'No se pudo actualizar: se muestra la última lista guardada.'; }
    } else aviso = 'Sin conexión: se muestra la última lista guardada.';
    const items = await cola.all();
    const salidas = items.filter(i => i.tipo === 'salida').map(i => i.ref_reg_id);
    const yaEnLista = lista.map(x => x.reg_id);
    items.filter(i => i.tipo === 'registrar' && i.mov.sentido === 'INGRESO' && i.mov.persona && yaEnLista.indexOf(i.id) < 0)
      .forEach(i => lista.unshift({ reg_id: i.id, nombre: i.resumen.nombre, dni: i.mov.persona.nro_doc, patente: (i.mov.campos || {}).patente || '', lote: (i.mov.autoriza || {}).lote || '', detalle: i.resumen.det + ' · pendiente de envío', hora: new Date(i.creado).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }));
    const vistos = {};
    lista = lista.filter(x => salidas.indexOf(x.reg_id) < 0).filter(x => { const k = x.dni ? digits(x.dni) : x.reg_id; if (vistos[k]) return false; vistos[k] = 1; return true; });
    setKids(cont, ...[aviso ? h('div', { class: 'banner warn' }, aviso) : null, labeled('Buscar', q), contador, lista$].filter(Boolean));
    pintar();
    setTimeout(() => q.focus(), 50);
  })();
  return h('main', {}, cont);
};

/* ---------------- prohibición registrada desde el puesto ---------------- */
SCREENS.prohibir = () => {
  const p = S.ctx.persona;
  const C = cfg();
  const tipos = C.autoriza && C.autoriza.length ? C.autoriza : ['Encargado del local', 'Supervisor Spartan'];
  const E = S.ctx.E || (S.ctx.E = { ordenado_tipo: tipos[0], ordenado_nombre: '', ordenado_lote: '', medio: 'WhatsApp', motivo: '', constancia: null });
  const err = h('div', { class: 'banner bad', hidden: true });
  const nom = h('input', { class: 'in', value: E.ordenado_nombre }); nom.addEventListener('input', () => { E.ordenado_nombre = nom.value; });
  const lote = h('input', { class: 'in', inputmode: 'numeric', value: E.ordenado_lote }); lote.addEventListener('input', () => { E.ordenado_lote = lote.value; });
  const mot = h('textarea', { class: 'in', rows: '3', placeholder: 'Ej: el residente pidió que no vuelva a ingresar' }); mot.value = E.motivo;
  mot.addEventListener('input', () => { E.motivo = mot.value; });
  const confirmar = async () => {
    if (!E.ordenado_nombre.trim() || (E.ordenado_tipo === 'Residente' && !E.ordenado_lote.trim())) { err.textContent = 'Indicá quién lo ordena' + (E.ordenado_tipo === 'Residente' ? ' y su lote.' : '.'); err.hidden = false; return; }
    if (!E.motivo.trim()) { err.textContent = 'Indicá el motivo.'; err.hidden = false; return; }
    const id = nuevoId();
    await cola.put({ id: id, tipo: 'prohibir', creado: Date.now(), cuil: getSesion().cuil, resumen: { nombre: p.apellido + ', ' + p.nombre, det: 'Prohibición', sentido: 'PROHIBIR' },
      prohibicion: Object.assign({ reg_id: id, nro_doc: digits(p.nro_doc), cargado_en: new Date().toISOString() }, E) });
    // efecto inmediato en este celular
    if (S.bundle && S.bundle.prohibidos) {
      S.bundle.prohibidos.docs.push(await sha(S.bundle.salt + '|' + digits(p.nro_doc)));
      await kv.set('bundle', S.bundle);
    }
    await guardarFicha(Object.assign({}, p, { estado: 'PROHIBIDO' }));
    S.F = null;
    toast('Prohibición registrada. Se avisa a la administración.');
    sync();
    go('home');
  };
  return h('main', { class: 'form' }, h('div', { class: 'content' },
    h('div', { class: 'banner bad' }, 'Vas a PROHIBIR el ingreso de ' + p.nombre + ' ' + p.apellido + ' (DNI ' + p.nro_doc + '). Solo hacelo si te lo ordenó alguien autorizado. Para levantarla hay que pedirlo a la administración.'),
    h('div', { class: 'card' }, h('h2', { class: 'sect' }, 'Quién lo ordena'),
      chips(tipos, E.ordenado_tipo, v => { E.ordenado_tipo = v; render(); }),
      E.ordenado_tipo === 'Residente'
        ? h('div', { class: 'row2' }, labeled('Nombre y apellido', nom, true), labeled(C.etiquetas.lote || 'Lote', lote, true))
        : labeled('Nombre de quien lo ordena', nom, true),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Medio'), chips(['WhatsApp', 'Llamada', 'Presencial'], E.medio, v => { E.medio = v; render(); })),
      labeled('Motivo', mot, true),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Constancia (captura o foto, recomendado)'), fotoBoton('Subir captura de la orden', !!E.constancia, blob => { E.constancia = blob; render(); }, { capture: false }))),
    err),
    h('div', { class: 'foot' }, h('button', { class: 'btnred', type: 'button', onclick: confirmar }, 'Confirmar prohibición')));
};

SCREENS.pendientes = () => {
  const cont = h('div', { class: 'content' });
  cola.all().then(items => {
    setKids(cont, 
      h('p', { class: 'muted' }, items.length ? 'Estos registros están guardados en el celular y se envían solos cuando hay señal. No borres los datos del navegador ni desinstales la app.' : 'No hay registros pendientes.'),
      ...items.map(i => h('div', { class: 'card' },
        h('div', { class: 'strong' }, (i.resumen && i.resumen.nombre) || i.tipo),
        h('div', { class: 'muted small' }, ((i.resumen && i.resumen.det) || '') + ' · ' + new Date(i.creado).toLocaleString('es-AR')),
        i.error ? h('div', { class: 'banner warn' }, 'Último intento: ' + i.error) : null)),
      ...(items.length ? [h('button', { class: 'btn', type: 'button', onclick: async () => { await sync(); render(); } }, online() ? 'Reintentar ahora' : 'Sin conexión')] : []));
  });
  return h('main', {}, cont);
};

/* ---------------- inicio ---------------- */
async function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  S.token = (await kv.get('token')) || null;
  S.bundle = (await kv.get('bundle')) || null;
  const codigo = codigoDelLink();
  if (!S.token) return go('activar', { codigo: codigo });
  if (codigo) toast('Este celular ya está activado.');
  if (sesionValida() && S.bundle) { go('home'); sync(); refrescar(); return; }
  go('login', {});
  sync();
}
init();
