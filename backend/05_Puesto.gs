/**
 * API de la App Puesto. Todas las acciones exigen token de dispositivo + CUIL habilitado.
 */

function puestoAuth_(r) {
  const ctx = dispositivoCtx_(r.token);
  const g = guardia_(ctx, r.cuil);
  return { ctx: ctx, g: g };
}

function puestoLogin_(r) {
  const a = puestoAuth_(r);
  append_(msheet_('Sesiones'), { sesion_id: uid_(), guardia_cuil: a.g.cuil, dispositivo_id: a.ctx.dispositivo_id, puesto_id: a.ctx.puesto.puesto_id, inicio: now_() });
  return bundle_(a.ctx, a.g);
}

function puestoSync_(r) {
  const a = puestoAuth_(r);
  return bundle_(a.ctx, a.g);
}

/** Todo lo que el celular necesita para trabajar, incluso sin señal. */
function bundle_(ctx, g) {
  const ss = clienteSs_(ctx.cliente);
  const salt = ctx.objetivo.salt;
  const prohibidos = { docs: [], patentes: [] };
  readAll_(sheet_(ss, 'Personas', CLIENTE_SCHEMA)).forEach(p => {
    if (p.estado !== 'PROHIBIDO') return;
    prohibidos.docs.push(sha256_(salt + '|' + digits_(p.nro_doc)));
    String(p.patentes || '').split(',').map(patente_).filter(Boolean).forEach(x => prohibidos.patentes.push(sha256_(salt + '|' + x)));
  });
  const residentes = readAll_(sheet_(ss, 'Residentes', CLIENTE_SCHEMA))
    .filter(x => x.objetivo_id === ctx.objetivo.objetivo_id && activo_(x.activo))
    .map(x => ({ lote: String(x.lote), apellido: x.apellido }));
  return {
    puesto: ctx.puesto.nombre,
    objetivo: { nombre: ctx.objetivo.nombre, tipo: ctx.objetivo.tipo },
    cliente: ctx.cliente.nombre,
    guardia: g,
    config: ctx.objetivo.config,
    salt: salt,
    prohibidos: prohibidos,
    residentes: residentes,
    servidor: new Date().toISOString()
  };
}

function resumenPersona_(p) {
  return {
    persona_id: p.persona_id, tipo_doc: p.tipo_doc, nro_doc: String(p.nro_doc), nombre: p.nombre, apellido: p.apellido,
    categoria: p.categoria, subtipo: p.subtipo, empresa: p.empresa, estado: p.estado,
    patentes: String(p.patentes || '').split(',').filter(Boolean), telefono: String(p.telefono || '')
  };
}

function docsPersona_(ss, persona_id) {
  const porTipo = {};
  findBy_(sheet_(ss, 'Documentos', CLIENTE_SCHEMA), 'persona_id', persona_id).forEach(d => {
    const prev = porTipo[d.tipo];
    if (!prev || new Date(d.cargado_en) > new Date(prev.cargado_en)) porTipo[d.tipo] = d;
  });
  const hoy = now_();
  return Object.keys(porTipo).map(t => {
    const d = porTipo[t];
    let estado = d.estado === 'whatsapp' ? 'whatsapp' : 'incorporado';
    if (estado === 'incorporado' && d.vencimiento && new Date(d.vencimiento) < hoy) estado = 'vencido';
    return { tipo: t, estado: estado, vencimiento: d.vencimiento ? fecha_(d.vencimiento, 'dd/MM/yyyy') : '', archivo: !!d.archivo_id };
  });
}

function detallePersona_(ss, p) {
  const out = resumenPersona_(p);
  out.docs = docsPersona_(ss, p.persona_id);
  const movs = findBy_(sheet_(ss, 'Movimientos', CLIENTE_SCHEMA), 'persona_id', p.persona_id);
  const ult = movs[movs.length - 1];
  out.ultimo = ult ? {
    fecha: fecha_(ult.cargado_en), autoriza_tipo: ult.autoriza_tipo, autoriza_lote: String(ult.autoriza_lote || ''),
    autoriza_apellido: ult.autoriza_apellido, autoriza_nombre: ult.autoriza_nombre, motivo: ult.motivo, patente: ult.patente
  } : null;
  if (p.estado === 'PROHIBIDO') {
    const h = findBy_(sheet_(ss, 'HistorialEstados', CLIENTE_SCHEMA), 'persona_id', p.persona_id).filter(x => x.estado_nuevo === 'PROHIBIDO').pop();
    out.prohibicion = h ? { ordenado_tipo: h.ordenado_tipo, ordenado_nombre: h.ordenado_nombre, ordenado_lote: String(h.ordenado_lote || ''), motivo: h.motivo, fecha: fecha_(h.fecha, 'dd/MM/yyyy') } : {};
  }
  return out;
}

function puestoBuscar_(r) {
  const a = puestoAuth_(r);
  const ss = clienteSs_(a.ctx.cliente);
  const sh = sheet_(ss, 'Personas', CLIENTE_SCHEMA);
  let found = [];
  if (r.persona_id) {
    found = findBy_(sh, 'persona_id', txt_(r.persona_id, 64));
  } else {
    const q = txt_(r.q, 80);
    const soloNumeros = q.replace(/[\s.\-]/g, '');
    if (/^\d{6,11}$/.test(soloNumeros)) {
      found = findBy_(sh, 'nro_doc', soloNumeros);
    } else if (q.length >= 2) {
      const all = readAll_(sh);
      const pat = patente_(q);
      if (pat.length >= 6 && /\d/.test(pat) && /[A-Z]/.test(pat)) {
        found = all.filter(p => String(p.patentes || '').split(',').indexOf(pat) >= 0);
      }
      if (!found.length) {
        const words = norm_(q).split(' ').filter(Boolean);
        found = all.filter(p => { const n = norm_(p.nombre + ' ' + p.apellido); return words.every(w => n.indexOf(w) >= 0); }).slice(0, 10);
      }
    }
  }
  if (found.length === 0) return { encontrados: [] };
  if (found.length > 1) return { encontrados: found.slice(0, 10).map(resumenPersona_) };
  const det = detallePersona_(ss, found[0]);
  if (det.estado === 'PROHIBIDO') {
    auditCliente_(ss, a.g.cuil, a.ctx.dispositivo_id, 'consulta_prohibido', 'Personas', det.persona_id, '', a.ctx.puesto.nombre);
  }
  return { persona: det };
}

function fechaCliente_(iso, recibido) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d.getTime())) return { fecha: recibido, ajustada: true };
  if (d.getTime() > recibido.getTime() + APP.RELOJ_TOLERANCIA_MIN * 60000) return { fecha: recibido, ajustada: true };
  return { fecha: d, ajustada: false };
}

function num_(v) {
  const n = Number(v);
  return v === '' || v === null || v === undefined || !isFinite(n) ? '' : Math.round(n * 1e6) / 1e6;
}

function sumarMeses_(d, meses) {
  const x = new Date(d.getTime());
  x.setMonth(x.getMonth() + meses);
  return x;
}

function histEstado_(ss, persona, anterior, nuevo, orden, medio, motivo, actor) {
  append_(sheet_(ss, 'HistorialEstados', CLIENTE_SCHEMA), {
    cambio_id: uid_(), persona_id: persona.persona_id, nro_doc: String(persona.nro_doc), estado_anterior: anterior, estado_nuevo: nuevo,
    ordenado_tipo: txt_(orden.tipo, 30), ordenado_nombre: txt_(orden.nombre, 80), ordenado_lote: txt_(orden.lote, 20),
    medio: txt_(medio, 30), motivo: txt_(motivo, 300), ejecutado_por: actor, fecha: now_()
  });
}

function upsertPersona_(ss, cat, p, actor) {
  const sh = sheet_(ss, 'Personas', CLIENTE_SCHEMA);
  const ex = findBy_(sh, 'nro_doc', p.nro_doc)[0];
  const ahora = now_();
  const elegido = ['AUTORIZADO', 'EVENTUAL'].indexOf(p.estado_elegido) >= 0 ? p.estado_elegido : '';
  if (ex) {
    const cambios = { nombre: p.nombre || ex.nombre, apellido: p.apellido || ex.apellido, actualizado_en: ahora, actualizado_por: actor };
    if (p.subtipo) cambios.subtipo = p.subtipo;
    if (p.empresa) cambios.empresa = p.empresa;
    if (p.telefono) cambios.telefono = p.telefono;
    if (!ex.categoria) cambios.categoria = cat.key;
    if (p.patente) {
      const pats = String(ex.patentes || '').split(',').filter(Boolean);
      if (pats.indexOf(p.patente) < 0) { pats.push(p.patente); cambios.patentes = pats.slice(-5).join(','); }
    }
    // El puesto nunca levanta ni aplica una prohibición.
    if (cat.estados && elegido && ex.estado !== 'PROHIBIDO' && elegido !== ex.estado) {
      cambios.estado = elegido;
      histEstado_(ss, ex, ex.estado, elegido, { tipo: 'Puesto', nombre: actor }, '', 'Cambio desde el puesto', actor);
    }
    update_(sh, ex._row, cambios);
    return Object.assign({}, ex, cambios);
  }
  const nueva = {
    persona_id: uid_(), tipo_doc: p.tipo_doc || 'DNI', nro_doc: p.nro_doc, nombre: p.nombre, apellido: p.apellido, categoria: cat.key,
    subtipo: p.subtipo || '', empresa: p.empresa || '', estado: (cat.estados && elegido) || cat.estado_default || 'AUTORIZADO',
    patentes: p.patente || '', telefono: p.telefono || '', extra: '', creado_en: ahora, creado_por: actor, actualizado_en: ahora, actualizado_por: actor
  };
  append_(sh, nueva);
  return nueva;
}

function guardarDocumento_(ss, cli, persona, cat, d, actor, fecha) {
  const def = cat.docs.filter(x => x.key === d.tipo)[0];
  if (!def) return;
  const medio = ['foto', 'archivo', 'whatsapp'].indexOf(d.medio) >= 0 ? d.medio : 'foto';
  const nombre = fecha_(fecha, 'dd-MM-yyyy_HHmm') + '_' + persona.nro_doc + '_' + def.key + (medio === 'whatsapp' ? '_captura_whatsapp' : '');
  const archivo_id = d.archivo ? guardarArchivo_(cli, ['personas', String(persona.nro_doc)], nombre, d.archivo) : '';
  let venc = '';
  if (medio !== 'whatsapp') {
    if (d.vence && /^\d{4}-\d{2}-\d{2}$/.test(d.vence)) venc = new Date(d.vence + 'T12:00:00');
    else if (def.vigencia_meses) venc = sumarMeses_(fecha, def.vigencia_meses);
  }
  append_(sheet_(ss, 'Documentos', CLIENTE_SCHEMA), {
    documento_id: uid_(), persona_id: persona.persona_id, nro_doc: String(persona.nro_doc), tipo: def.key,
    estado: medio === 'whatsapp' ? 'whatsapp' : 'incorporado', vencimiento: venc, archivo_id: archivo_id, medio: medio, cargado_por: actor, cargado_en: now_()
  });
}

function puestoRegistrar_(r) {
  const a = puestoAuth_(r);
  const ctx = a.ctx, g = a.g;
  const m = r.mov || {};
  const reg_id = String(m.reg_id || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(reg_id)) throw apiError_('reg_invalido', 'Registro inválido.');
  const cfg = ctx.objetivo.config;
  const cat = cfg.categorias.filter(c => c.key === m.categoria)[0];
  if (!cat) throw apiError_('categoria_invalida', 'Categoría no habilitada en este objetivo.');
  const cli = ctx.cliente;
  const ss = clienteSs_(cli);
  const shM = sheet_(ss, 'Movimientos', CLIENTE_SCHEMA);
  const cache = CacheService.getScriptCache();
  const ck = 'reg:' + cli.cliente_id + ':' + reg_id;
  const previo = cache.get(ck);
  if (previo) return { duplicado: true, mov_id: previo };

  return withLock_(() => {
    const ex = findBy_(shM, 'reg_id', reg_id)[0];
    if (ex) { cache.put(ck, ex.mov_id, 21600); return { duplicado: true, mov_id: ex.mov_id }; }

    const recibido = now_();
    const carga = fechaCliente_(m.cargado_en, recibido);
    const fecha = carga.fecha;
    const alertas = [];
    if (carga.ajustada) alertas.push('reloj_dispositivo');
    const sentido = m.sentido === 'EGRESO' ? 'EGRESO' : 'INGRESO';
    const valores = m.campos || {};
    const extra = {};
    cat.campos.forEach(f => {
      if (f.tipo === 'foto') return;
      const v = valores[f.key];
      if (v !== undefined && v !== null && v !== '') extra[f.key] = f.tipo === 'patente' ? patente_(v) : txt_(v);
    });

    let persona = null;
    if (cat.persona) {
      const p = m.persona || {};
      const nro = digits_(p.nro_doc);
      if (nro.length < 6 || !txt_(p.nombre) || !txt_(p.apellido)) throw apiError_('datos_incompletos', 'Faltan documento, nombre o apellido.');
      persona = upsertPersona_(ss, cat, {
        tipo_doc: txt_(p.tipo_doc, 10) || 'DNI', nro_doc: nro, nombre: txt_(p.nombre, 80), apellido: txt_(p.apellido, 80),
        subtipo: extra.subtipo || '', empresa: extra.empresa || '', telefono: extra.telefono || '', patente: extra.patente || '', estado_elegido: p.estado
      }, g.cuil);
      if (persona.estado === 'PROHIBIDO' && !m.excepcional) alertas.push('prohibido_sin_excepcion');
    }
    const choferDni = digits_(valores.chofer_dni);
    if (choferDni) {
      const pc = findBy_(sheet_(ss, 'Personas', CLIENTE_SCHEMA), 'nro_doc', choferDni)[0];
      if (pc && pc.estado === 'PROHIBIDO' && !m.excepcional) alertas.push('chofer_prohibido');
    }
    const nroDoc = persona ? String(persona.nro_doc) : choferDni;
    const stamp = fecha_(fecha, 'dd-MM-yyyy_HHmm');
    const mes = fecha_(fecha, 'yyyy-MM');

    const fotoIds = {};
    cat.campos.filter(f => f.tipo === 'foto').forEach(f => {
      const arch = (m.fotos || {})[f.key];
      if (arch) fotoIds[f.key] = guardarArchivo_(cli, ['movimientos', mes], stamp + '_' + (nroDoc || cat.key) + '_' + f.key, arch);
    });

    const cac = cfg.modulos.cacheo || {};
    const tocaCacheo = !!cat.cacheo && cac.activo && (cac.momento === 'ambos' || cac.momento === sentido.toLowerCase());
    let cacheoFoto = '', cacheoRes = '', cacheoAle = false;
    if (tocaCacheo && m.cacheo) {
      cacheoRes = m.cacheo.resultado === 'Con novedad' ? 'Con novedad' : 'Sin novedad';
      cacheoAle = !!m.cacheo.aleatorio;
      if (m.cacheo.foto) cacheoFoto = guardarArchivo_(cli, ['cacheos', mes], stamp + '_' + nroDoc + '_cacheo', m.cacheo.foto);
      if (cacheoRes === 'Con novedad') alertas.push('cacheo_con_novedad');
    }
    if (tocaCacheo && cac.obligatoria && !cacheoFoto) alertas.push('cacheo_sin_foto');

    if (persona && Array.isArray(m.docs)) m.docs.slice(0, 10).forEach(d => guardarDocumento_(ss, cli, persona, cat, d, g.cuil, fecha));

    let exc = '';
    if (m.excepcional) {
      const e = m.excepcional;
      const constancia_id = e.constancia ? guardarArchivo_(cli, ['excepciones', mes], stamp + '_' + nroDoc + '_constancia', e.constancia) : '';
      exc = {
        autoriza_tipo: txt_(e.autoriza_tipo, 30), nombre: txt_(e.nombre, 80), lote: txt_(e.lote, 20), apellido: txt_(e.apellido, 80),
        medio: txt_(e.medio, 30), motivo: txt_(e.motivo, 300), constancia_id: constancia_id
      };
    }

    const au = m.autoriza || {};
    const mov_id = uid_();
    const acomp = Array.isArray(m.acompanantes) ? m.acompanantes.slice(0, 20) : [];
    const row = {
      mov_id: mov_id, reg_id: reg_id, objetivo_id: ctx.objetivo.objetivo_id, puesto_id: ctx.puesto.puesto_id, dispositivo_id: ctx.dispositivo_id,
      categoria: cat.key, sentido: sentido, persona_id: persona ? persona.persona_id : '', nro_doc: nroDoc,
      apellido: persona ? persona.apellido : txt_(valores.chofer_nombre || '', 80), nombre: persona ? persona.nombre : '',
      autoriza_tipo: txt_(au.tipo, 30), autoriza_lote: txt_(au.lote, 20), autoriza_apellido: txt_(au.apellido, 80), autoriza_nombre: txt_(au.nombre, 80),
      motivo: extra.motivo || '', patente: extra.patente || '', grupo_id: acomp.length ? reg_id : '', observaciones: extra.observaciones || '',
      extra: extra, foto_ids: Object.keys(fotoIds).length ? fotoIds : '', cacheo_resultado: cacheoRes, cacheo_foto_id: cacheoFoto,
      cacheo_aleatorio: cacheoAle, excepcional: exc, alertas: alertas.join(','), lat: num_(m.lat), lng: num_(m.lng),
      cargado_en: fecha, recibido_en: recibido, guardia_cuil: g.cuil, salida_en: '', salida_guardia: ''
    };
    if (cfg.modo_salida === 'cerrar' && sentido === 'INGRESO' && persona) {
      if (cerrarAbiertos_(shM, persona.persona_id, ctx.objetivo.objetivo_id, fecha)) alertas.push('reingreso_sin_salida');
      row.alertas = alertas.join(',');
    }
    append_(shM, row);

    acomp.forEach((ac, i) => {
      const nro = digits_(ac.nro_doc);
      if (nro.length < 6) return;
      const pa = upsertPersona_(ss, cat, { tipo_doc: 'DNI', nro_doc: nro, nombre: txt_(ac.nombre, 80) || '-', apellido: txt_(ac.apellido, 80) || '-' }, g.cuil);
      if (cfg.modo_salida === 'cerrar' && sentido === 'INGRESO') cerrarAbiertos_(shM, pa.persona_id, ctx.objetivo.objetivo_id, fecha);
      append_(shM, Object.assign({}, row, {
        mov_id: uid_(), reg_id: reg_id + '-a' + (i + 1), persona_id: pa.persona_id, nro_doc: String(pa.nro_doc), apellido: pa.apellido, nombre: pa.nombre,
        patente: '', foto_ids: '', cacheo_resultado: '', cacheo_foto_id: '', excepcional: '', alertas: pa.estado === 'PROHIBIDO' ? 'prohibido_sin_excepcion' : ''
      }));
      if (pa.estado === 'PROHIBIDO') alertas.push('acompanante_prohibido');
    });

    auditCliente_(ss, g.cuil, ctx.dispositivo_id, exc ? 'ingreso_excepcional' : 'registrar', 'Movimientos', mov_id, '',
      cat.key + ' ' + sentido + (alertas.length ? ' [' + alertas.join(',') + ']' : ''));
    cache.put(ck, mov_id, 21600);
    if (exc || alertas.some(x => /prohibido|novedad/.test(x))) avisar_(ctx, row, exc, alertas, g);
    return { mov_id: mov_id, alertas: alertas };
  });
}

function puestoSalida_(r) {
  const a = puestoAuth_(r);
  const shM = csheet_(a.ctx.cliente, 'Movimientos');
  return withLock_(() => {
    const mv = findBy_(shM, 'reg_id', String(r.ref_reg_id || ''))[0];
    if (!mv) throw apiError_('reintentar', 'El ingreso todavía no llegó al servidor.');
    if (mv.objetivo_id !== a.ctx.objetivo.objetivo_id) throw apiError_('sin_permiso', 'Movimiento de otro objetivo.');
    if (mv.salida_en) return { ya_registrada: true };
    const f = fechaCliente_(r.salida_en, now_()).fecha;
    update_(shM, mv._row, { salida_en: f, salida_guardia: a.g.cuil });
    if (mv.grupo_id) {
      findBy_(shM, 'grupo_id', mv.grupo_id).forEach(x => { if (!x.salida_en) update_(shM, x._row, { salida_en: f, salida_guardia: a.g.cuil }); });
    }
    auditCliente_(clienteSs_(a.ctx.cliente), a.g.cuil, a.ctx.dispositivo_id, 'salida', 'Movimientos', mv.mov_id, '', '');
    return { ok: true };
  });
}

function puestoAdentro_(r) {
  const a = puestoAuth_(r);
  const cfg = a.ctx.objetivo.config;
  const labels = {};
  cfg.categorias.forEach(c => { labels[c.key] = c.label; });
  const desde = Date.now() - 7 * 86400000;
  const vistos = {};
  const lista = readAll_(csheet_(a.ctx.cliente, 'Movimientos'))
    .filter(m => m.objetivo_id === a.ctx.objetivo.objetivo_id && m.sentido === 'INGRESO' && !m.salida_en && m.persona_id && !String(m.reg_id).match(/-a\d+$/) && new Date(m.cargado_en).getTime() > desde)
    .sort((x, y) => new Date(y.cargado_en) - new Date(x.cargado_en))
    .filter(m => { if (vistos[m.persona_id]) return false; vistos[m.persona_id] = 1; return true; })   // una fila por persona
    .slice(0, 500)
    .map(m => ({
      reg_id: m.reg_id, nombre: m.apellido + ', ' + m.nombre, dni: String(m.nro_doc || ''), patente: String(m.patente || ''), lote: String(m.autoriza_lote || ''),
      detalle: (labels[m.categoria] || m.categoria) + (m.autoriza_lote ? ' · ' + (cfg.etiquetas.lote || 'Lote') + ' ' + m.autoriza_lote : (m.autoriza_tipo ? ' · ' + m.autoriza_tipo : '')),
      hora: fecha_(m.cargado_en, 'dd/MM HH:mm')
    }));
  return { adentro: lista };
}

function avisar_(ctx, row, exc, alertas, g) {
  try {
    const dest = String(ctx.cliente.avisos || '').split(',').map(s => s.trim()).filter(Boolean);
    readAll_(msheet_('UsuariosPanel')).forEach(u => {
      if (!activo_(u.activo) || u.rol !== 'supervisor') return;
      const cl = String(u.clientes || '').split(',').map(s => s.trim());
      if (cl.indexOf('*') >= 0 || cl.indexOf(ctx.cliente.cliente_id) >= 0) dest.push(u.email);
    });
    if (!dest.length) return;
    const quien = (row.apellido + ', ' + row.nombre).replace(/^, |, $/g, '') || row.categoria;
    const titulo = exc ? 'Ingreso excepcional' : 'Alerta de seguridad';
    const lineas = [
      titulo + ' en ' + ctx.objetivo.nombre + ' · ' + ctx.puesto.nombre,
      'Fecha: ' + fecha_(row.cargado_en),
      'Persona: ' + quien,
      'Guardia: ' + g.nombre,
      exc ? ('Autorizó: ' + exc.autoriza_tipo + ' ' + [exc.nombre, exc.apellido, exc.lote ? 'lote ' + exc.lote : ''].filter(Boolean).join(' ') + ' · por ' + exc.medio + (exc.motivo ? '\nMotivo: ' + exc.motivo : '')) : '',
      alertas.length ? 'Alertas: ' + alertas.join(', ') : '',
      '',
      'Ver el detalle en el Panel de SG Ingresos.'
    ].filter(x => x !== '');
    MailApp.sendEmail({ to: Array.from(new Set(dest)).join(','), subject: '[SG Ingresos] ' + titulo + ' · ' + ctx.objetivo.nombre, body: lineas.join('\n') });
  } catch (e) { console.error('avisar_', e); }
}

/**
 * Si la persona ya figura adentro (ingreso sin salida) y vuelve a ingresar, el ingreso anterior se cierra
 * como "salida no registrada" (salida_guardia = AUTO) para que no quede duplicada en "Adentro ahora".
 * Devuelve cuántos cerró.
 */
function cerrarAbiertos_(shM, persona_id, objetivo_id, fecha) {
  let n = 0;
  findBy_(shM, 'persona_id', persona_id).forEach(x => {
    if (x.objetivo_id !== objetivo_id || x.sentido !== 'INGRESO' || x.salida_en) return;
    const al = String(x.alertas || '').split(',').filter(Boolean);
    if (al.indexOf('salida_no_registrada') < 0) al.push('salida_no_registrada');
    update_(shM, x._row, { salida_en: fecha, salida_guardia: 'AUTO', alertas: al.join(',') });
    n++;
  });
  return n;
}

/**
 * El vigilador registra una prohibición ordenada por Residente, Administración o Intendencia.
 * Solo puede APLICAR una prohibición (lo más restrictivo); levantarla se hace desde el Panel.
 */
function puestoProhibir_(r) {
  const a = puestoAuth_(r);
  const ctx = a.ctx, g = a.g;
  const p = r.prohibicion || {};
  const reg_id = String(p.reg_id || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(reg_id)) throw apiError_('reg_invalido', 'Registro inválido.');
  const tiposValidos = (ctx.objetivo.config.autoriza && ctx.objetivo.config.autoriza.length) ? ctx.objetivo.config.autoriza : ['Encargado del local', 'Supervisor Spartan'];
  const tipo = txt_(p.ordenado_tipo, 30);
  if (tiposValidos.indexOf(tipo) < 0) throw apiError_('orden_invalida', 'Indicá quién ordena la prohibición.');
  if (tipo === 'Residente' ? (!txt_(p.ordenado_lote) || !txt_(p.ordenado_nombre)) : !txt_(p.ordenado_nombre)) throw apiError_('orden_invalida', 'Indicá el nombre (y lote si es residente) de quien la ordena.');
  if (!txt_(p.motivo)) throw apiError_('orden_invalida', 'Indicá el motivo.');
  const nro = digits_(p.nro_doc);
  const cli = ctx.cliente;
  const ss = clienteSs_(cli);
  return withLock_(() => {
    const sh = sheet_(ss, 'Personas', CLIENTE_SCHEMA);
    const per = findBy_(sh, 'nro_doc', nro)[0];
    if (!per) throw apiError_('no_encontrado', 'La persona no tiene ficha. Registrala primero o pedí la prohibición al Panel.');
    if (per.estado === 'PROHIBIDO') return { ya_prohibido: true };
    const fecha = fechaCliente_(p.cargado_en, now_()).fecha;
    const constancia = p.constancia ? guardarArchivo_(cli, ['prohibiciones', fecha_(fecha, 'yyyy-MM')], fecha_(fecha, 'dd-MM-yyyy_HHmm') + '_' + nro + '_constancia', p.constancia) : '';
    update_(sh, per._row, { estado: 'PROHIBIDO', actualizado_en: now_(), actualizado_por: g.cuil });
    histEstado_(ss, per, per.estado, 'PROHIBIDO', { tipo: tipo, nombre: p.ordenado_nombre, lote: p.ordenado_lote }, p.medio,
      txt_(p.motivo, 280) + (constancia ? ' [constancia ' + constancia + ']' : ''), 'vigilador ' + g.cuil);
    auditCliente_(ss, g.cuil, ctx.dispositivo_id, 'prohibir_desde_puesto', 'Personas', per.persona_id, per.estado, 'PROHIBIDO (ordenó ' + tipo + ')');
    try {
      const dest = String(cli.avisos || '').split(',').map(s => s.trim()).filter(Boolean);
      readAll_(msheet_('UsuariosPanel')).forEach(u => {
        const cl = String(u.clientes || '').split(',').map(s => s.trim());
        if (activo_(u.activo) && u.rol === 'supervisor' && (cl.indexOf('*') >= 0 || cl.indexOf(cli.cliente_id) >= 0)) dest.push(u.email);
      });
      if (dest.length) MailApp.sendEmail({
        to: Array.from(new Set(dest)).join(','),
        subject: '[SG Ingresos] Nueva prohibición · ' + ctx.objetivo.nombre,
        body: ['Se registró una prohibición desde el puesto ' + ctx.puesto.nombre + '.', 'Persona: ' + per.apellido + ', ' + per.nombre + ' (DNI ' + nro + ')',
          'Ordenó: ' + tipo + ' ' + txt_(p.ordenado_nombre, 80) + (p.ordenado_lote ? ' · lote ' + txt_(p.ordenado_lote, 20) : '') + ' · por ' + txt_(p.medio, 30),
          'Motivo: ' + txt_(p.motivo, 280), 'Vigilador: ' + g.nombre, '', 'Se puede levantar desde el Panel › Personas y prohibidos.'].join('\n')
      });
    } catch (e) { console.error('aviso prohibicion', e); }
    return { ok: true };
  });
}
