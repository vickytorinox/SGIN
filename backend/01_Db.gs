/**
 * Acceso a planillas, esquema y utilidades de datos.
 * Una planilla maestra (estructura) + una planilla de datos por cliente.
 */

const MASTER_SCHEMA = {
  Clientes: ['cliente_id', 'nombre', 'planilla_id', 'carpeta_id', 'backup_carpeta_id', 'avisos', 'activo', 'creado_en', 'creado_por'],
  Objetivos: ['objetivo_id', 'cliente_id', 'nombre', 'tipo', 'direccion', 'salt', 'config', 'activo', 'creado_en', 'creado_por', 'actualizado_en', 'actualizado_por'],
  Puestos: ['puesto_id', 'objetivo_id', 'nombre', 'activo', 'creado_en', 'creado_por'],
  Dispositivos: ['dispositivo_id', 'puesto_id', 'etiqueta', 'codigo_hash', 'codigo_vence', 'token_hash', 'estado', 'activado_en', 'ultimo_uso', 'creado_en', 'creado_por'],
  Guardias: ['guardia_id', 'cuil', 'nombre', 'apellido', 'puestos', 'activo', 'creado_en', 'creado_por'],
  UsuariosPanel: ['usuario_id', 'email', 'nombre', 'rol', 'clientes', 'activo', 'creado_en', 'creado_por'],
  Sesiones: ['sesion_id', 'guardia_cuil', 'dispositivo_id', 'puesto_id', 'inicio'],
  AuditoriaGlobal: ['fecha', 'actor', 'accion', 'entidad', 'entidad_id', 'antes', 'despues']
};

const CLIENTE_SCHEMA = {
  Personas: ['persona_id', 'tipo_doc', 'nro_doc', 'nombre', 'apellido', 'categoria', 'subtipo', 'empresa', 'estado', 'patentes', 'telefono', 'extra', 'creado_en', 'creado_por', 'actualizado_en', 'actualizado_por'],
  Documentos: ['documento_id', 'persona_id', 'nro_doc', 'tipo', 'estado', 'vencimiento', 'archivo_id', 'medio', 'cargado_por', 'cargado_en'],
  Movimientos: ['mov_id', 'reg_id', 'objetivo_id', 'puesto_id', 'dispositivo_id', 'categoria', 'sentido', 'persona_id', 'nro_doc', 'apellido', 'nombre',
    'autoriza_tipo', 'autoriza_lote', 'autoriza_apellido', 'autoriza_nombre', 'motivo', 'patente', 'grupo_id', 'observaciones', 'extra', 'foto_ids',
    'cacheo_resultado', 'cacheo_foto_id', 'cacheo_aleatorio', 'excepcional', 'alertas', 'lat', 'lng', 'cargado_en', 'recibido_en', 'guardia_cuil',
    'salida_en', 'salida_guardia'],
  HistorialEstados: ['cambio_id', 'persona_id', 'nro_doc', 'estado_anterior', 'estado_nuevo', 'ordenado_tipo', 'ordenado_nombre', 'ordenado_lote', 'medio', 'motivo', 'ejecutado_por', 'fecha'],
  Residentes: ['residente_id', 'objetivo_id', 'lote', 'apellido', 'nombre', 'telefono', 'activo'],
  Auditoria: ['fecha', 'actor', 'dispositivo', 'accion', 'entidad', 'entidad_id', 'antes', 'despues']
};

const SS_CACHE_ = {};

function openSs_(id) {
  if (!SS_CACHE_[id]) SS_CACHE_[id] = SpreadsheetApp.openById(id);
  return SS_CACHE_[id];
}

function master_() {
  return openSs_(prop_('MASTER_ID'));
}

/** Devuelve la hoja; si no existe la crea con su encabezado. */
function sheet_(ss, name, schema) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    const head = schema[name];
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
    // Columnas de documentos y CUIL como texto, para que Sheets no las convierta en números.
    head.forEach((h, i) => {
      if (/^(nro_doc|cuil|guardia_cuil|lote|autoriza_lote|patente|patentes|reg_id)$/.test(h)) {
        sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@');
      }
    });
  }
  return sh;
}

function msheet_(name) {
  return sheet_(master_(), name, MASTER_SCHEMA);
}

function head_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
}

function readAll_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(1, 1, last, sh.getLastColumn()).getValues();
  const head = values.shift();
  return values.map((r, i) => {
    const o = { _row: i + 2 };
    head.forEach((h, j) => { o[h] = r[j]; });
    return o;
  });
}

function rowObj_(sh, row, head) {
  const vals = sh.getRange(row, 1, 1, head.length).getValues()[0];
  const o = { _row: row };
  head.forEach((h, j) => { o[h] = vals[j]; });
  return o;
}

/** Búsqueda exacta en una columna (rápida, con TextFinder). */
function findBy_(sh, col, value) {
  if (value === '' || value === null || value === undefined) return [];
  const head = head_(sh);
  const c = head.indexOf(col) + 1;
  const last = sh.getLastRow();
  if (!c || last < 2) return [];
  const found = sh.getRange(2, c, last - 1, 1).createTextFinder(String(value)).matchEntireCell(true).findAll();
  return found.map(r => rowObj_(sh, r.getRow(), head));
}

function append_(sh, obj) {
  const head = head_(sh);
  sh.appendRow(head.map(h => cell_(obj[h])));
}

function update_(sh, row, changes) {
  const head = head_(sh);
  Object.keys(changes).forEach(k => {
    const c = head.indexOf(k);
    if (c >= 0) sh.getRange(row, c + 1).setValue(cell_(changes[k]));
  });
}

/** Valor seguro para una celda: neutraliza inyección de fórmulas. */
function cell_(v) {
  if (v === undefined || v === null) return '';
  if (v instanceof Date || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'object') v = JSON.stringify(v);
  v = String(v).slice(0, 45000);
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  return v;
}

function txt_(v, max) {
  return String(v === null || v === undefined ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max || APP.MAX_TEXTO);
}

function digits_(v) {
  return String(v === null || v === undefined ? '' : v).replace(/\D/g, '');
}

function patente_(v) {
  return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
}

function norm_(v) {
  return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function uid_() { return Utilities.getUuid(); }
function now_() { return new Date(); }

function activo_(v) {
  return v === true || /^(true|si|sí|1)$/i.test(String(v));
}

function json_parse_(s, def) {
  if (s === '' || s === null || s === undefined) return def;
  if (typeof s === 'object') return s;
  try { return JSON.parse(s); } catch (e) { return def; }
}

function fecha_(d, fmt) {
  return Utilities.formatDate(d instanceof Date ? d : new Date(d), TZ, fmt || 'dd/MM/yyyy HH:mm');
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw apiError_('ocupado', 'El sistema está ocupado. Se reintenta solo.');
  try { return fn(); } finally { lock.releaseLock(); }
}

/** Crea las hojas faltantes de un esquema y borra la hoja vacía por defecto. */
function ensureSchema_(ss, schema) {
  Object.keys(schema).forEach(n => sheet_(ss, n, schema));
  ss.getSheets().forEach(sh => {
    if (!schema[sh.getName()] && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
}

/** Protege una hoja de auditoría: solo el dueño del script puede escribir. */
function protegerHoja_(sh) {
  const p = sh.protect().setDescription('Solo agregado por el sistema');
  p.removeEditors(p.getEditors());
  if (p.canDomainEdit()) p.setDomainEdit(false);
}
