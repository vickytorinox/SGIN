/**
 * API del Panel Cliente (Administración, Intendencia, supervisores Spartan).
 */

function panelMe_(r) {
  const u = usuario_(r.sesion, APP.ROLES_PANEL);
  const objetivos = readAll_(msheet_('Objetivos')).filter(o => activo_(o.activo));
  const clientes = readAll_(msheet_('Clientes')).filter(c => activo_(c.activo) &&
    (u.rol === 'admin' || u.clientes.indexOf('*') >= 0 || u.clientes.indexOf(c.cliente_id) >= 0));
  return {
    usuario: u,
    clientes: clientes.map(c => ({
      cliente_id: c.cliente_id, nombre: c.nombre,
      objetivos: objetivos.filter(o => o.cliente_id === c.cliente_id).map(o => ({
        objetivo_id: o.objetivo_id, nombre: o.nombre, tipo: o.tipo, config: normalizarConfig_(json_parse_(o.config, null), o.tipo)
      }))
    }))
  };
}

function mapas_() {
  const guardias = {}, puestos = {}, objetivos = {};
  readAll_(msheet_('Guardias')).forEach(g => { guardias[digits_(g.cuil)] = (g.nombre + ' ' + g.apellido).trim(); });
  readAll_(msheet_('Puestos')).forEach(p => { puestos[p.puesto_id] = p.nombre; });
  readAll_(msheet_('Objetivos')).forEach(o => { objetivos[o.objetivo_id] = { nombre: o.nombre, config: normalizarConfig_(json_parse_(o.config, null), o.tipo) }; });
  return { guardias: guardias, puestos: puestos, objetivos: objetivos };
}

function panelMovimientos_(r) {
  const u = usuario_(r.sesion, APP.ROLES_PANEL);
  puedeCliente_(u, r.cliente_id);
  const c = cliente_(r.cliente_id);
  const mp = mapas_();
  const d0 = r.desde ? new Date(r.desde + 'T00:00:00') : new Date(Date.now() - 7 * 86400000);
  const d1 = r.hasta ? new Date(r.hasta + 'T23:59:59') : new Date();
  const dni = digits_(r.dni);
  const words = norm_(r.nombre).split(' ').filter(Boolean);
  const hd = /^\d{2}:\d{2}$/.test(r.hdesde || '') ? r.hdesde : '';
  const hh = /^\d{2}:\d{2}$/.test(r.hhasta || '') ? r.hhasta : '';

  const filas = readAll_(csheet_(c, 'Movimientos')).filter(m => {
    const f = new Date(m.cargado_en);
    if (!(f >= d0 && f <= d1)) return false;
    if (r.objetivo_id && m.objetivo_id !== r.objetivo_id) return false;
    if (r.sentido && m.sentido !== r.sentido) return false;
    if (r.categoria && m.categoria !== r.categoria) return false;
    if (r.solo_alertas && !m.alertas && !m.excepcional) return false;
    if (dni && digits_(m.nro_doc).indexOf(dni) < 0) return false;
    if (words.length) { const n = norm_(m.nombre + ' ' + m.apellido); if (!words.every(w => n.indexOf(w) >= 0)) return false; }
    if (hd || hh) { const h = fecha_(f, 'HH:mm'); if (hd && h < hd) return false; if (hh && h > hh) return false; }
    return true;
  }).sort((a, b) => new Date(b.cargado_en) - new Date(a.cargado_en));

  const ingresos = filas.filter(m => m.sentido === 'INGRESO').length;
  const egresos = filas.filter(m => m.sentido === 'EGRESO');
  const conFoto = egresos.filter(m => m.cacheo_foto_id).length;
  const personas = {};
  filas.forEach(m => { if (m.nro_doc) personas[digits_(m.nro_doc)] = 1; });

  const rows = filas.slice(0, APP.MAX_RESULTADOS_PANEL).map(m => {
    const obj = mp.objetivos[m.objetivo_id] || { nombre: '', config: { categorias: [], etiquetas: {} } };
    const cat = obj.config.categorias.filter(x => x.key === m.categoria)[0];
    const exc = json_parse_(m.excepcional, null);
    const fotos = Object.values(json_parse_(m.foto_ids, {}) || {});
    if (exc && exc.constancia_id) fotos.push(exc.constancia_id);
    return {
      fecha: fecha_(m.cargado_en, 'dd/MM/yyyy'), hora: fecha_(m.cargado_en, 'HH:mm'),
      objetivo: obj.nombre, puesto: mp.puestos[m.puesto_id] || '', categoria: cat ? cat.label : m.categoria, tipo: m.sentido,
      apellido: m.apellido, nombre: m.nombre, dni: String(m.nro_doc || ''), cuil: String(m.guardia_cuil || ''),
      vigilador: mp.guardias[digits_(m.guardia_cuil)] || '', observaciones: m.observaciones,
      autoriza: [m.autoriza_tipo, m.autoriza_lote ? (obj.config.etiquetas.lote || 'Lote') + ' ' + m.autoriza_lote : '', m.autoriza_apellido || m.autoriza_nombre].filter(Boolean).join(' · '),
      motivo: m.motivo, patente: m.patente, salida: m.salida_en ? fecha_(m.salida_en, 'dd/MM HH:mm') : '',
      cacheo: m.cacheo_resultado, foto_cacheo: m.cacheo_foto_id || '', fotos: fotos,
      excepcional: exc ? (exc.autoriza_tipo + ' ' + [exc.nombre, exc.apellido].filter(Boolean).join(' ') + (exc.lote ? ' lote ' + exc.lote : '') + ' · ' + exc.medio + (exc.motivo ? ' · ' + exc.motivo : '')) : '',
      alertas: String(m.alertas || '')
    };
  });

  return {
    metricas: { total: filas.length, ingresos: ingresos, egresos: egresos.length, personas: Object.keys(personas).length, egresos_con_foto: egresos.length ? Math.round(conFoto * 100 / egresos.length) : null },
    rows: rows,
    truncado: filas.length > APP.MAX_RESULTADOS_PANEL
  };
}

function panelAdentro_(r) {
  const u = usuario_(r.sesion, APP.ROLES_PANEL);
  puedeCliente_(u, r.cliente_id);
  const c = cliente_(r.cliente_id);
  const mp = mapas_();
  const desde = Date.now() - 7 * 86400000;
  const rows = readAll_(csheet_(c, 'Movimientos'))
    .filter(m => m.sentido === 'INGRESO' && !m.salida_en && m.persona_id && (!r.objetivo_id || m.objetivo_id === r.objetivo_id) && new Date(m.cargado_en).getTime() > desde)
    .filter(m => { const o = mp.objetivos[m.objetivo_id]; return o && o.config.modo_salida === 'cerrar'; })
    .sort((a, b) => new Date(b.cargado_en) - new Date(a.cargado_en))
    .map(m => {
      const o = mp.objetivos[m.objetivo_id];
      const cat = o.config.categorias.filter(x => x.key === m.categoria)[0];
      return {
        nombre: m.apellido + ', ' + m.nombre, dni: String(m.nro_doc), categoria: cat ? cat.label : m.categoria,
        autoriza: [m.autoriza_tipo, m.autoriza_lote ? (o.config.etiquetas.lote || 'Lote') + ' ' + m.autoriza_lote : ''].filter(Boolean).join(' · '),
        desde: fecha_(m.cargado_en, 'dd/MM HH:mm'), objetivo: o.nombre, puesto: mp.puestos[m.puesto_id] || ''
      };
    });
  return { adentro: rows };
}

function panelFoto_(r) {
  const u = usuario_(r.sesion, APP.ROLES_PANEL);
  puedeCliente_(u, r.cliente_id);
  const c = cliente_(r.cliente_id);
  if (!/^[A-Za-z0-9_-]{10,}$/.test(String(r.archivo_id || ''))) throw apiError_('archivo_invalido', 'Archivo inválido.');
  const f = archivoDelCliente_(c, r.archivo_id);
  const blob = f.getBlob();
  const bytes = blob.getBytes();
  if (bytes.length > APP.MAX_ARCHIVO_BYTES) throw apiError_('archivo_grande', 'Archivo demasiado grande para mostrar.');
  auditCliente_(clienteSs_(c), u.email, '', 'ver_archivo', 'Drive', r.archivo_id, '', '');
  return { mime: blob.getContentType(), nombre: f.getName(), b64: Utilities.base64Encode(bytes) };
}

function panelPersonas_(r) {
  const u = usuario_(r.sesion, APP.ROLES_PANEL);
  puedeCliente_(u, r.cliente_id);
  const c = cliente_(r.cliente_id);
  const q = txt_(r.q, 80);
  const d = digits_(q);
  const words = norm_(q).split(' ').filter(Boolean);
  const pat = patente_(q);
  const lista = readAll_(csheet_(c, 'Personas')).filter(p => {
    if (r.estado && p.estado !== r.estado) return false;
    if (!q) return true;
    if (d.length >= 4 && digits_(p.nro_doc).indexOf(d) >= 0) return true;
    if (pat.length >= 5 && String(p.patentes || '').indexOf(pat) >= 0) return true;
    const n = norm_(p.nombre + ' ' + p.apellido + ' ' + p.empresa);
    return words.length && words.every(w => n.indexOf(w) >= 0);
  }).slice(0, 300).map(resumenPersona_);
  return { personas: lista };
}

function panelPersona_(r) {
  const u = usuario_(r.sesion, APP.ROLES_PANEL);
  puedeCliente_(u, r.cliente_id);
  const c = cliente_(r.cliente_id);
  const ss = clienteSs_(c);
  const p = findBy_(sheet_(ss, 'Personas', CLIENTE_SCHEMA), 'persona_id', String(r.persona_id || ''))[0];
  if (!p) throw apiError_('no_encontrado', 'Persona no encontrada.');
  const det = detallePersona_(ss, p);
  det.historial = findBy_(sheet_(ss, 'HistorialEstados', CLIENTE_SCHEMA), 'persona_id', p.persona_id).reverse().map(h => ({
    fecha: fecha_(h.fecha), de: h.estado_anterior, a: h.estado_nuevo, ordenado: [h.ordenado_tipo, h.ordenado_nombre, h.ordenado_lote ? 'lote ' + h.ordenado_lote : ''].filter(Boolean).join(' '),
    medio: h.medio, motivo: h.motivo, por: h.ejecutado_por
  }));
  det.movimientos = findBy_(sheet_(ss, 'Movimientos', CLIENTE_SCHEMA), 'persona_id', p.persona_id).slice(-30).reverse().map(m => ({
    fecha: fecha_(m.cargado_en), tipo: m.sentido, salida: m.salida_en ? fecha_(m.salida_en, 'dd/MM HH:mm') : '', autoriza: [m.autoriza_tipo, m.autoriza_lote].filter(Boolean).join(' ')
  }));
  return { persona: det };
}

/** Aplicar o levantar una prohibición (o cambiar AUTORIZADO/EVENTUAL) desde el Panel. */
function panelEstado_(r) {
  const u = usuario_(r.sesion, APP.ROLES_ESTADO);
  puedeCliente_(u, r.cliente_id);
  const c = cliente_(r.cliente_id);
  const ss = clienteSs_(c);
  const nuevo = String(r.estado_nuevo || '');
  if (['PROHIBIDO', 'AUTORIZADO', 'EVENTUAL'].indexOf(nuevo) < 0) throw apiError_('estado_invalido', 'Estado inválido.');
  let tipo = txt_(r.ordenado_tipo, 30);
  if (u.rol === 'administracion') tipo = tipo || 'Administración';
  if (u.rol === 'intendencia') tipo = tipo || 'Intendencia';
  if (['Residente', 'Administración', 'Intendencia'].indexOf(tipo) < 0) throw apiError_('orden_invalida', 'Indicá quién lo ordena: Residente, Administración o Intendencia.');
  if (tipo === 'Residente' && (!txt_(r.ordenado_nombre) || !txt_(r.ordenado_lote))) throw apiError_('orden_invalida', 'Indicá nombre y lote del residente.');
  return withLock_(() => {
    const sh = sheet_(ss, 'Personas', CLIENTE_SCHEMA);
    let p = r.persona_id ? findBy_(sh, 'persona_id', String(r.persona_id))[0] : findBy_(sh, 'nro_doc', digits_(r.nro_doc))[0];
    if (!p) {
      const nro = digits_(r.nro_doc);
      if (nuevo !== 'PROHIBIDO' || nro.length < 6 || !txt_(r.nombre) || !txt_(r.apellido)) throw apiError_('no_encontrado', 'Persona no encontrada. Para prohibir a alguien nuevo cargá documento, nombre y apellido.');
      p = { persona_id: uid_(), tipo_doc: 'DNI', nro_doc: nro, nombre: txt_(r.nombre, 80), apellido: txt_(r.apellido, 80), categoria: '', subtipo: '', empresa: '', estado: '', patentes: patente_(r.patente), telefono: '', extra: '', creado_en: now_(), creado_por: u.email, actualizado_en: now_(), actualizado_por: u.email };
      append_(sh, p);
      p = findBy_(sh, 'persona_id', p.persona_id)[0];
    }
    const anterior = p.estado;
    if (anterior === nuevo) return { sin_cambios: true };
    update_(sh, p._row, { estado: nuevo, actualizado_en: now_(), actualizado_por: u.email });
    histEstado_(ss, p, anterior, nuevo, { tipo: tipo, nombre: r.ordenado_nombre, lote: r.ordenado_lote }, r.medio, r.motivo, u.email);
    auditCliente_(ss, u.email, '', 'cambio_estado', 'Personas', p.persona_id, anterior, nuevo + ' (ordenó ' + tipo + ')');
    return { ok: true, estado: nuevo };
  });
}
