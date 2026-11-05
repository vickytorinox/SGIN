/**
 * Punto de entrada de la API. Todas las llamadas son POST con cuerpo JSON (Content-Type text/plain,
 * para evitar el preflight de CORS). Respuesta: { ok, data } o { ok:false, error, message }.
 */

const ROUTES = {
  // App Puesto (token de dispositivo + CUIL)
  'puesto.activar': r => activarDispositivo_(r.codigo),
  'puesto.login': r => puestoLogin_(r),
  'puesto.sync': r => puestoSync_(r),
  'puesto.buscar': r => puestoBuscar_(r),
  'puesto.registrar': r => puestoRegistrar_(r),
  'puesto.salida': r => puestoSalida_(r),
  'puesto.adentro': r => puestoAdentro_(r),
  'puesto.prohibir': r => puestoProhibir_(r),

  // Panel Cliente (sesión Google)
  'panel.login': r => loginGoogle_(r.idToken),
  'panel.logout': r => logout_(r.sesion),
  'panel.me': r => panelMe_(r),
  'panel.movimientos': r => panelMovimientos_(r),
  'panel.adentro': r => panelAdentro_(r),
  'panel.foto': r => panelFoto_(r),
  'panel.personas': r => panelPersonas_(r),
  'panel.persona': r => panelPersona_(r),
  'panel.estado': r => panelEstado_(r),

  // Admin Spartan (rol admin)
  'admin.estructura': r => adminEstructura_(r),
  'admin.cliente.guardar': r => adminClienteGuardar_(r),
  'admin.objetivo.guardar': r => adminObjetivoGuardar_(r),
  'admin.objetivo.config': r => adminObjetivoConfig_(r),
  'admin.puesto.guardar': r => adminPuestoGuardar_(r),
  'admin.puesto.eliminar': r => adminPuestoEliminar_(r),
  'admin.objetivo.eliminar': r => adminObjetivoEliminar_(r),
  'admin.dispositivo.codigo': r => adminDispositivoCodigo_(r),
  'admin.dispositivo.revocar': r => adminDispositivoRevocar_(r),
  'admin.guardias': r => adminGuardias_(r),
  'admin.guardia.guardar': r => adminGuardiaGuardar_(r),
  'admin.usuarios': r => adminUsuarios_(r),
  'admin.usuario.guardar': r => adminUsuarioGuardar_(r),
  'admin.auditoria': r => adminAuditoria_(r)
};

function doGet() {
  return salida_({ ok: true, servicio: 'SG Ingresos API' });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e && e.postData ? e.postData.contents : '');
  } catch (err) {
    return salida_({ ok: false, error: 'json_invalido', message: 'Pedido inválido.' });
  }
  try {
    const fn = Object.prototype.hasOwnProperty.call(ROUTES, req.action) ? ROUTES[req.action] : null;
    if (!fn) throw apiError_('accion_desconocida', 'Acción desconocida.');
    return salida_({ ok: true, data: fn(req) });
  } catch (err) {
    if (err && err.code) return salida_({ ok: false, error: err.code, message: err.message });
    console.error(req.action, err && err.stack ? err.stack : err);
    return salida_({ ok: false, error: 'error_interno', message: 'Error interno. Se reintenta solo.' });
  }
}

function salida_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
