/**
 * Autenticación.
 *  - Dispositivos (App Puesto): código de activación de un solo uso → token largo y aleatorio.
 *    El token identifica puesto, objetivo y cliente. Se guarda solo su hash.
 *  - Guardias: CUIL habilitado en ese puesto (encima del token del dispositivo).
 *  - Panel/Admin: "Iniciar sesión con Google" (ID token verificado acá) + lista UsuariosPanel.
 */

function apiError_(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function sha256_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}

function hashSecreto_(s) {
  return sha256_(prop_('SECRET_PEPPER') + '|' + s);
}

function tokenAleatorio_() {
  return (uid_() + uid_() + uid_()).replace(/-/g, '');
}

function nuevoCodigo_() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, uid_() + Date.now() + Math.random());
  let s = '';
  for (let i = 0; i < 10; i++) s += alfabeto[(bytes[i] & 255) % alfabeto.length];
  return s.slice(0, 5) + '-' + s.slice(5);
}

function normCodigo_(c) {
  return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Limita intentos por minuto para una clave (frena fuerza bruta). */
function throttle_(clave, maxPorMinuto) {
  const cache = CacheService.getScriptCache();
  const k = 'thr:' + clave + ':' + Math.floor(Date.now() / 60000);
  const n = Number(cache.get(k) || 0) + 1;
  cache.put(k, String(n), 120);
  if (n > maxPorMinuto) throw apiError_('demasiados_intentos', 'Demasiados intentos. Esperá un minuto.');
}

/* ---------------- Dispositivos ---------------- */

function activarDispositivo_(codigo) {
  throttle_('activar', 20);
  const h = hashSecreto_(normCodigo_(codigo));
  return withLock_(() => {
    const sh = msheet_('Dispositivos');
    const d = findBy_(sh, 'codigo_hash', h)[0];
    if (!d || d.estado !== 'pendiente' || new Date(d.codigo_vence) < now_()) {
      throw apiError_('codigo_invalido', 'Código inválido o vencido. Pedí uno nuevo a Spartan.');
    }
    const ctx = contextoPuesto_(d.puesto_id);
    const token = tokenAleatorio_();
    update_(sh, d._row, { token_hash: hashSecreto_(token), codigo_hash: '', estado: 'activo', activado_en: now_(), ultimo_uso: now_() });
    auditGlobal_('dispositivo:' + d.dispositivo_id, 'activar_dispositivo', 'Dispositivos', d.dispositivo_id, '', ctx.puesto.nombre);
    return { token: token, puesto: ctx.puesto.nombre, objetivo: ctx.objetivo.nombre };
  });
}

/** Contexto completo de un puesto: puesto, objetivo (con config) y cliente. */
function contextoPuesto_(puesto_id) {
  const p = findBy_(msheet_('Puestos'), 'puesto_id', puesto_id)[0];
  if (!p || !activo_(p.activo)) throw apiError_('puesto_inactivo', 'El puesto no está activo.');
  const o = findBy_(msheet_('Objetivos'), 'objetivo_id', p.objetivo_id)[0];
  if (!o || !activo_(o.activo)) throw apiError_('objetivo_inactivo', 'El objetivo no está activo.');
  const c = findBy_(msheet_('Clientes'), 'cliente_id', o.cliente_id)[0];
  if (!c || !activo_(c.activo)) throw apiError_('cliente_inactivo', 'El cliente no está activo.');
  return {
    puesto: { puesto_id: p.puesto_id, nombre: p.nombre },
    objetivo: { objetivo_id: o.objetivo_id, nombre: o.nombre, tipo: o.tipo, salt: o.salt, config: normalizarConfig_(json_parse_(o.config, null), o.tipo) },
    cliente: { cliente_id: c.cliente_id, nombre: c.nombre, planilla_id: c.planilla_id, carpeta_id: c.carpeta_id, avisos: c.avisos }
  };
}

/** Valida el token del dispositivo y devuelve el contexto. Nunca confía en datos de la URL. */
function dispositivoCtx_(token) {
  if (!token || String(token).length < 40) throw apiError_('dispositivo_invalido', 'Este celular no está activado.');
  const th = hashSecreto_(token);
  const cache = CacheService.getScriptCache();
  const ck = 'dev:' + th;
  const hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  const sh = msheet_('Dispositivos');
  const d = findBy_(sh, 'token_hash', th)[0];
  if (!d || d.estado !== 'activo') throw apiError_('dispositivo_invalido', 'Este celular fue desactivado. Pedí un código nuevo a Spartan.');
  const ctx = contextoPuesto_(d.puesto_id);
  ctx.dispositivo_id = d.dispositivo_id;
  update_(sh, d._row, { ultimo_uso: now_() });
  const s = JSON.stringify(ctx);
  if (s.length < 90000) cache.put(ck, s, APP.CACHE_DISPOSITIVO_SEG);
  return ctx;
}

function olvidarDispositivoCache_(token_hash) {
  if (token_hash) CacheService.getScriptCache().remove('dev:' + token_hash);
}

/* ---------------- Guardias ---------------- */

function guardia_(ctx, cuil) {
  const c = digits_(cuil);
  if (c.length < 8) throw apiError_('cuil_invalido', 'Ingresá tu CUIL.');
  throttle_('cuil:' + ctx.dispositivo_id, 30);
  const g = findBy_(msheet_('Guardias'), 'cuil', c)[0];
  if (!g || !activo_(g.activo)) throw apiError_('cuil_invalido', 'CUIL no habilitado.');
  const puestos = String(g.puestos || '').split(',').map(s => s.trim()).filter(Boolean);
  const habilitado = puestos.indexOf('*') >= 0 || puestos.indexOf(ctx.puesto.puesto_id) >= 0 || puestos.indexOf(ctx.objetivo.objetivo_id) >= 0;
  if (!habilitado) throw apiError_('cuil_invalido', 'CUIL no habilitado en este puesto.');
  return { cuil: c, nombre: (g.nombre + ' ' + g.apellido).trim() };
}

/* ---------------- Panel / Admin (Google) ---------------- */

function loginGoogle_(idToken) {
  throttle_('glogin', 60);
  if (!idToken) throw apiError_('google_invalido', 'Falta el inicio de sesión de Google.');
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw apiError_('google_invalido', 'No se pudo verificar la cuenta de Google.');
  const t = JSON.parse(res.getContentText());
  const issOk = t.iss === 'accounts.google.com' || t.iss === 'https://accounts.google.com';
  if (t.aud !== prop_('GOOGLE_CLIENT_ID') || !issOk || String(t.email_verified) !== 'true' || Number(t.exp) * 1000 < Date.now()) {
    throw apiError_('google_invalido', 'Cuenta de Google no válida.');
  }
  const email = String(t.email).toLowerCase();
  const u = findBy_(msheet_('UsuariosPanel'), 'email', email).filter(x => activo_(x.activo))[0];
  if (!u) {
    auditGlobal_(email, 'login_rechazado', 'UsuariosPanel', '', '', '');
    throw apiError_('no_autorizado', 'Tu cuenta (' + email + ') no tiene acceso. Pedíselo a Spartan.');
  }
  const sesion = tokenAleatorio_();
  const user = { email: email, nombre: u.nombre || email, rol: u.rol, clientes: String(u.clientes || '').split(',').map(s => s.trim()).filter(Boolean) };
  CacheService.getScriptCache().put('ses:' + hashSecreto_(sesion), JSON.stringify(user), APP.SESION_PANEL_SEG);
  auditGlobal_(email, 'login', 'UsuariosPanel', u.usuario_id, '', '');
  return { sesion: sesion, usuario: user };
}

function usuario_(sesion, roles) {
  if (!sesion) throw apiError_('sesion_vencida', 'Iniciá sesión de nuevo.');
  const hit = CacheService.getScriptCache().get('ses:' + hashSecreto_(sesion));
  if (!hit) throw apiError_('sesion_vencida', 'Tu sesión venció. Iniciá sesión de nuevo.');
  const u = JSON.parse(hit);
  if (roles && roles.indexOf(u.rol) < 0) throw apiError_('sin_permiso', 'No tenés permiso para esta acción.');
  return u;
}

function logout_(sesion) {
  if (sesion) CacheService.getScriptCache().remove('ses:' + hashSecreto_(sesion));
  return { ok: true };
}

function puedeCliente_(u, cliente_id) {
  if (u.rol === 'admin' || u.clientes.indexOf('*') >= 0 || u.clientes.indexOf(cliente_id) >= 0) return true;
  throw apiError_('sin_permiso', 'No tenés acceso a este cliente.');
}
