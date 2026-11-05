/**
 * Auditoría (solo agregado) y archivos en Drive (siempre privados).
 */

function auditGlobal_(actor, accion, entidad, entidad_id, antes, despues) {
  try {
    append_(msheet_('AuditoriaGlobal'), { fecha: now_(), actor: actor, accion: accion, entidad: entidad, entidad_id: entidad_id, antes: antes, despues: despues });
  } catch (e) { console.error('auditGlobal_', e); }
}

function auditCliente_(ss, actor, dispositivo, accion, entidad, entidad_id, antes, despues) {
  try {
    append_(sheet_(ss, 'Auditoria', CLIENTE_SCHEMA), {
      fecha: now_(), actor: actor, dispositivo: dispositivo || '', accion: accion, entidad: entidad, entidad_id: entidad_id, antes: antes, despues: despues
    });
  } catch (e) { console.error('auditCliente_', e); }
}

function clienteSs_(cliente) {
  return openSs_(cliente.planilla_id);
}

function csheet_(cliente, name) {
  return sheet_(clienteSs_(cliente), name, CLIENTE_SCHEMA);
}

function cliente_(cliente_id) {
  const c = findBy_(msheet_('Clientes'), 'cliente_id', cliente_id)[0];
  if (!c) throw apiError_('cliente_inexistente', 'Cliente inexistente.');
  return c;
}

function subcarpeta_(parent, nombre) {
  const it = parent.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : parent.createFolder(nombre);
}

const MIMES_OK = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/**
 * Guarda un archivo { b64, mime } en la carpeta privada del cliente.
 * ruta: array de subcarpetas. Devuelve el ID del archivo o ''.
 */
function guardarArchivo_(cliente, ruta, nombre, archivo) {
  if (!archivo || !archivo.b64) return '';
  const b64 = String(archivo.b64).replace(/^data:[^,]+,/, '');
  const bytes = Utilities.base64Decode(b64);
  if (bytes.length > APP.MAX_ARCHIVO_BYTES) throw apiError_('archivo_grande', 'Archivo demasiado grande (máx. 5 MB).');
  const mime = MIMES_OK.indexOf(archivo.mime) >= 0 ? archivo.mime : 'image/jpeg';
  let carpeta = DriveApp.getFolderById(cliente.carpeta_id);
  ruta.forEach(n => { carpeta = subcarpeta_(carpeta, String(n).replace(/[\/\\]/g, '-')); });
  const ext = mime === 'application/pdf' ? '.pdf' : (mime === 'image/png' ? '.png' : (mime === 'image/webp' ? '.webp' : '.jpg'));
  const file = carpeta.createFile(Utilities.newBlob(bytes, mime, nombre.replace(/\.[a-z]+$/i, '') + ext));
  return file.getId();
}

/** Verifica que un archivo esté dentro de la carpeta del cliente antes de servirlo. */
function archivoDelCliente_(cliente, archivo_id) {
  const f = DriveApp.getFileById(archivo_id);
  let frontera = [f.getParents()];
  for (let nivel = 0; nivel < 6 && frontera.length; nivel++) {
    const sig = [];
    for (const it of frontera) {
      while (it.hasNext()) {
        const p = it.next();
        if (p.getId() === cliente.carpeta_id) return f;
        sig.push(p.getParents());
      }
    }
    frontera = sig;
  }
  throw apiError_('sin_permiso', 'Archivo fuera del cliente.');
}
