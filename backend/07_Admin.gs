/**
 * API de Admin Spartan: clientes, objetivos, puestos, dispositivos, guardias, usuarios y configuración.
 * Solo rol "admin".
 */

const ROLES_VALIDOS = ['admin', 'supervisor', 'administracion', 'intendencia'];
const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

function admin_(r) { return usuario_(r.sesion, ['admin']); }

function adminEstructura_(r) {
  admin_(r);
  const map = (rows, keys) => rows.map(x => { const o = {}; keys.forEach(k => { o[k] = x[k] instanceof Date ? fecha_(x[k]) : x[k]; }); return o; });
  return {
    clientes: map(readAll_(msheet_('Clientes')), ['cliente_id', 'nombre', 'avisos', 'activo']),
    objetivos: map(readAll_(msheet_('Objetivos')), ['objetivo_id', 'cliente_id', 'nombre', 'tipo', 'direccion', 'activo']),
    puestos: map(readAll_(msheet_('Puestos')), ['puesto_id', 'objetivo_id', 'nombre', 'activo']),
    dispositivos: map(readAll_(msheet_('Dispositivos')), ['dispositivo_id', 'puesto_id', 'etiqueta', 'estado', 'codigo_vence', 'activado_en', 'ultimo_uso']),
    tipos: Object.keys(PLANTILLAS)
  };
}

function adminClienteGuardar_(r) {
  const u = admin_(r);
  const nombre = txt_(r.nombre, 80);
  const avisos = String(r.avisos || '').split(/[,;\s]+/).map(s => s.trim().toLowerCase()).filter(s => EMAIL_RE.test(s)).join(',');
  const sh = msheet_('Clientes');
  if (r.cliente_id) {
    const c = findBy_(sh, 'cliente_id', r.cliente_id)[0];
    if (!c) throw apiError_('no_encontrado', 'Cliente inexistente.');
    const cambios = { avisos: avisos, activo: r.activo !== false };
    if (nombre) cambios.nombre = nombre;
    update_(sh, c._row, cambios);
    auditGlobal_(u.email, 'editar_cliente', 'Clientes', c.cliente_id, c.nombre, JSON.stringify(cambios));
    return { cliente_id: c.cliente_id };
  }
  if (!nombre) throw apiError_('datos_incompletos', 'Falta el nombre del cliente.');
  const root = DriveApp.getFolderById(prop_('ROOT_FOLDER_ID'));
  const carpeta = root.createFolder('Cliente · ' + nombre);
  const backups = carpeta.createFolder('Backups');
  const ss = SpreadsheetApp.create('SG Ingresos · ' + nombre);
  DriveApp.getFileById(ss.getId()).moveTo(carpeta);
  ensureSchema_(ss, CLIENTE_SCHEMA);
  protegerHoja_(ss.getSheetByName('Auditoria'));
  protegerHoja_(ss.getSheetByName('HistorialEstados'));
  const id = uid_();
  append_(sh, { cliente_id: id, nombre: nombre, planilla_id: ss.getId(), carpeta_id: carpeta.getId(), backup_carpeta_id: backups.getId(), avisos: avisos, activo: true, creado_en: now_(), creado_por: u.email });
  auditGlobal_(u.email, 'crear_cliente', 'Clientes', id, '', nombre);
  return { cliente_id: id };
}

function adminObjetivoGuardar_(r) {
  const u = admin_(r);
  const sh = msheet_('Objetivos');
  if (r.objetivo_id) {
    const o = findBy_(sh, 'objetivo_id', r.objetivo_id)[0];
    if (!o) throw apiError_('no_encontrado', 'Objetivo inexistente.');
    const cambios = { direccion: txt_(r.direccion, 120), activo: r.activo !== false, actualizado_en: now_(), actualizado_por: u.email };
    if (txt_(r.nombre, 80)) cambios.nombre = txt_(r.nombre, 80);
    update_(sh, o._row, cambios);
    auditGlobal_(u.email, 'editar_objetivo', 'Objetivos', o.objetivo_id, o.nombre, JSON.stringify(cambios));
    return { objetivo_id: o.objetivo_id };
  }
  cliente_(r.cliente_id);
  const nombre = txt_(r.nombre, 80);
  if (!nombre) throw apiError_('datos_incompletos', 'Falta el nombre del objetivo.');
  const tipo = String(r.tipo || '');
  const cfg = plantilla_(tipo);
  const id = uid_();
  append_(sh, {
    objetivo_id: id, cliente_id: r.cliente_id, nombre: nombre, tipo: tipo, direccion: txt_(r.direccion, 120),
    salt: tokenAleatorio_().slice(0, 32), config: JSON.stringify(cfg), activo: true, creado_en: now_(), creado_por: u.email, actualizado_en: now_(), actualizado_por: u.email
  });
  auditGlobal_(u.email, 'crear_objetivo', 'Objetivos', id, '', nombre + ' (' + tipo + ')');
  return { objetivo_id: id };
}

function adminObjetivoConfig_(r) {
  const u = admin_(r);
  const sh = msheet_('Objetivos');
  const o = findBy_(sh, 'objetivo_id', r.objetivo_id)[0];
  if (!o) throw apiError_('no_encontrado', 'Objetivo inexistente.');
  if (r.config) {
    const antes = o.config;
    const cfg = normalizarConfig_(r.config, o.tipo, true);
    update_(sh, o._row, { config: JSON.stringify(cfg), actualizado_en: now_(), actualizado_por: u.email });
    auditGlobal_(u.email, 'config_objetivo', 'Objetivos', o.objetivo_id, String(antes).slice(0, 20000), JSON.stringify(cfg).slice(0, 20000));
    return { tipo: o.tipo, config: cfg };
  }
  return { tipo: o.tipo, config: normalizarConfig_(json_parse_(o.config, null), o.tipo, true) };
}

function adminPuestoGuardar_(r) {
  const u = admin_(r);
  const sh = msheet_('Puestos');
  if (r.puesto_id) {
    const p = findBy_(sh, 'puesto_id', r.puesto_id)[0];
    if (!p) throw apiError_('no_encontrado', 'Puesto inexistente.');
    const cambios = { activo: r.activo !== false };
    if (txt_(r.nombre, 80)) cambios.nombre = txt_(r.nombre, 80);
    update_(sh, p._row, cambios);
    auditGlobal_(u.email, 'editar_puesto', 'Puestos', p.puesto_id, p.nombre, JSON.stringify(cambios));
    return { puesto_id: p.puesto_id };
  }
  if (!findBy_(msheet_('Objetivos'), 'objetivo_id', r.objetivo_id)[0]) throw apiError_('no_encontrado', 'Objetivo inexistente.');
  const nombre = txt_(r.nombre, 80);
  if (!nombre) throw apiError_('datos_incompletos', 'Falta el nombre del puesto.');
  const id = uid_();
  append_(sh, { puesto_id: id, objetivo_id: r.objetivo_id, nombre: nombre, activo: true, creado_en: now_(), creado_por: u.email });
  auditGlobal_(u.email, 'crear_puesto', 'Puestos', id, '', nombre);
  return { puesto_id: id };
}

function adminDispositivoCodigo_(r) {
  const u = admin_(r);
  if (!findBy_(msheet_('Puestos'), 'puesto_id', r.puesto_id)[0]) throw apiError_('no_encontrado', 'Puesto inexistente.');
  const codigo = nuevoCodigo_();
  const vence = new Date(Date.now() + APP.CODIGO_VIGENCIA_HORAS * 3600000);
  const id = uid_();
  append_(msheet_('Dispositivos'), {
    dispositivo_id: id, puesto_id: r.puesto_id, etiqueta: txt_(r.etiqueta, 60) || 'Celular del puesto', codigo_hash: hashSecreto_(normCodigo_(codigo)),
    codigo_vence: vence, token_hash: '', estado: 'pendiente', activado_en: '', ultimo_uso: '', creado_en: now_(), creado_por: u.email
  });
  auditGlobal_(u.email, 'generar_codigo', 'Dispositivos', id, '', r.puesto_id);
  return { dispositivo_id: id, codigo: codigo, vence: fecha_(vence) };
}

function adminDispositivoRevocar_(r) {
  const u = admin_(r);
  const sh = msheet_('Dispositivos');
  const d = findBy_(sh, 'dispositivo_id', r.dispositivo_id)[0];
  if (!d) throw apiError_('no_encontrado', 'Dispositivo inexistente.');
  olvidarDispositivoCache_(d.token_hash);
  update_(sh, d._row, { estado: 'revocado', token_hash: '', codigo_hash: '' });
  auditGlobal_(u.email, 'revocar_dispositivo', 'Dispositivos', d.dispositivo_id, d.estado, 'revocado');
  return { ok: true };
}

function adminGuardias_(r) {
  admin_(r);
  return { guardias: readAll_(msheet_('Guardias')).map(g => ({ cuil: String(g.cuil), nombre: g.nombre, apellido: g.apellido, puestos: g.puestos, activo: activo_(g.activo) })) };
}

function adminGuardiaGuardar_(r) {
  const u = admin_(r);
  const cuil = digits_(r.cuil);
  if (cuil.length !== 11) throw apiError_('cuil_invalido', 'El CUIL debe tener 11 dígitos.');
  const datos = { nombre: txt_(r.nombre, 60), apellido: txt_(r.apellido, 60), puestos: String(r.puestos || '*').split(',').map(s => s.trim()).filter(Boolean).join(','), activo: r.activo !== false };
  const sh = msheet_('Guardias');
  return withLock_(() => {
    const g = findBy_(sh, 'cuil', cuil)[0];
    olvidarGuardiaCache_(cuil);
    if (g) {
      update_(sh, g._row, datos);
      auditGlobal_(u.email, 'editar_guardia', 'Guardias', cuil, '', JSON.stringify(datos));
    } else {
      append_(sh, Object.assign({ guardia_id: uid_(), cuil: cuil, creado_en: now_(), creado_por: u.email }, datos));
      auditGlobal_(u.email, 'crear_guardia', 'Guardias', cuil, '', JSON.stringify(datos));
    }
    return { ok: true };
  });
}

function adminUsuarios_(r) {
  admin_(r);
  return { usuarios: readAll_(msheet_('UsuariosPanel')).map(x => ({ email: x.email, nombre: x.nombre, rol: x.rol, clientes: x.clientes, activo: activo_(x.activo) })) };
}

function adminUsuarioGuardar_(r) {
  const u = admin_(r);
  const email = String(r.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw apiError_('email_invalido', 'Email inválido.');
  if (ROLES_VALIDOS.indexOf(r.rol) < 0) throw apiError_('rol_invalido', 'Rol inválido.');
  if (email === u.email && (r.rol !== 'admin' || r.activo === false)) throw apiError_('sin_permiso', 'No podés quitarte el rol de admin a vos misma.');
  const datos = { nombre: txt_(r.nombre, 80), rol: r.rol, clientes: String(r.clientes || '').split(',').map(s => s.trim()).filter(Boolean).join(','), activo: r.activo !== false };
  const sh = msheet_('UsuariosPanel');
  return withLock_(() => {
    const x = findBy_(sh, 'email', email)[0];
    if (x) update_(sh, x._row, datos);
    else append_(sh, Object.assign({ usuario_id: uid_(), email: email, creado_en: now_(), creado_por: u.email }, datos));
    auditGlobal_(u.email, x ? 'editar_usuario' : 'crear_usuario', 'UsuariosPanel', email, '', JSON.stringify(datos));
    return { ok: true };
  });
}

function adminAuditoria_(r) {
  admin_(r);
  const sh = msheet_('AuditoriaGlobal');
  const last = sh.getLastRow();
  if (last < 2) return { rows: [] };
  const n = Math.min(400, last - 1);
  const head = head_(sh);
  const vals = sh.getRange(last - n + 1, 1, n, head.length).getValues().reverse();
  return { rows: vals.map(v => ({ fecha: fecha_(v[0]), actor: v[1], accion: v[2], entidad: v[3], entidad_id: v[4], despues: String(v[6]).slice(0, 200) })) };
}

/** Revoca todos los celulares activos o pendientes de un puesto. */
function revocarDispositivosPuesto_(puesto_id) {
  const sh = msheet_('Dispositivos');
  findBy_(sh, 'puesto_id', puesto_id).forEach(d => {
    if (d.estado === 'revocado') return;
    olvidarDispositivoCache_(d.token_hash);
    update_(sh, d._row, { estado: 'revocado', token_hash: '', codigo_hash: '' });
  });
}

/**
 * Eliminar = baja lógica: deja de aparecer y sus celulares dejan de funcionar,
 * pero el historial de movimientos se conserva.
 */
function adminPuestoEliminar_(r) {
  const u = admin_(r);
  const sh = msheet_('Puestos');
  const p = findBy_(sh, 'puesto_id', r.puesto_id)[0];
  if (!p) throw apiError_('no_encontrado', 'Puesto inexistente.');
  update_(sh, p._row, { activo: false });
  revocarDispositivosPuesto_(p.puesto_id);
  auditGlobal_(u.email, 'eliminar_puesto', 'Puestos', p.puesto_id, p.nombre, 'baja');
  return { ok: true };
}

function adminObjetivoEliminar_(r) {
  const u = admin_(r);
  const sh = msheet_('Objetivos');
  const o = findBy_(sh, 'objetivo_id', r.objetivo_id)[0];
  if (!o) throw apiError_('no_encontrado', 'Objetivo inexistente.');
  update_(sh, o._row, { activo: false, actualizado_en: now_(), actualizado_por: u.email });
  const shP = msheet_('Puestos');
  findBy_(shP, 'objetivo_id', o.objetivo_id).forEach(p => {
    if (activo_(p.activo)) update_(shP, p._row, { activo: false });
    revocarDispositivosPuesto_(p.puesto_id);
  });
  auditGlobal_(u.email, 'eliminar_objetivo', 'Objetivos', o.objetivo_id, o.nombre, 'baja');
  return { ok: true };
}
