// SG Ingresos · Panel Cliente y Admin Spartan
import { api } from '../puesto/api.js';
import { h, chips, badge, toast } from '../puesto/ui.js';

const P = { sesion: null, usuario: null, clientes: [], cliente_id: '', view: 'movimientos', est: null };
const $app = document.getElementById('app');
const ROL_LABEL = { admin: 'Admin Spartan', supervisor: 'Supervisor Spartan', administracion: 'Administración', intendencia: 'Intendencia' };
const PUEDE_ESTADO = ['admin', 'supervisor', 'administracion', 'intendencia'];

/* ---------------- sesión ---------------- */
async function call(action, payload) {
  try {
    return await api(action, Object.assign({ sesion: P.sesion }, payload || {}));
  } catch (e) {
    if (e.code === 'sesion_vencida') { salir(); throw e; }
    throw e;
  }
}
function salir() {
  if (P.sesion) api('panel.logout', { sesion: P.sesion }).catch(() => {});
  sessionStorage.removeItem('sg_panel');
  P.sesion = null;
  if (window.google && google.accounts) google.accounts.id.disableAutoSelect();
  pantallaLogin();
}

function pantallaLogin(msg) {
  const btn = h('div', { id: 'gbtn' });
  const err = h('div', { class: 'banner bad', hidden: !msg }, msg || '');
  $app.replaceChildren(h('div', { class: 'login' },
    h('div', { class: 'h logo' }, 'SG INGRESOS'),
    h('p', {}, 'Panel de clientes y Admin Spartan'),
    h('div', { class: 'card' }, h('p', { class: 'muted' }, 'Ingresá con tu cuenta de Google autorizada.'), btn, err)));
  const iniciar = () => {
    if (!window.google || !google.accounts) return setTimeout(iniciar, 200);
    google.accounts.id.initialize({
      client_id: window.SG_CONFIG.GOOGLE_CLIENT_ID,
      callback: async r => {
        try {
          const res = await api('panel.login', { idToken: r.credential });
          P.sesion = res.sesion;
          sessionStorage.setItem('sg_panel', res.sesion);
          await cargar();
        } catch (e) { err.textContent = e.message; err.hidden = false; }
      }
    });
    google.accounts.id.renderButton(btn, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'es' });
  };
  if (window.SG_CONFIG.DEV_LOGIN) {
    // Solo en el servidor local de prueba (dev/server.js). El backend real rechaza estos tokens.
    const em = h('input', { class: 'in', type: 'email', placeholder: 'admin@spartan.test', value: 'admin@spartan.test' });
    const ir = h('button', { class: 'btn', type: 'button' }, 'Ingreso de prueba');
    ir.onclick = async () => {
      try {
        const res = await api('panel.login', { idToken: 'test:' + em.value.trim() });
        P.sesion = res.sesion; sessionStorage.setItem('sg_panel', res.sesion); await cargar();
      } catch (e) { err.textContent = e.message; err.hidden = false; }
    };
    btn.replaceWith(h('div', { style: 'display:flex;flex-direction:column;gap:8px;width:100%' }, em, ir));
    return;
  }
  iniciar();
}

async function cargar() {
  const me = await call('panel.me');
  P.usuario = me.usuario;
  P.clientes = me.clientes;
  if (!P.cliente_id || !P.clientes.some(c => c.cliente_id === P.cliente_id)) P.cliente_id = P.clientes[0] ? P.clientes[0].cliente_id : '';
  render();
}

const esAdmin = () => P.usuario && P.usuario.rol === 'admin';
const clienteActual = () => P.clientes.filter(c => c.cliente_id === P.cliente_id)[0];

/* ---------------- layout ---------------- */
const VISTAS = {};
function go(v) { P.view = v; render(); }
function render() {
  const nav = (key, label) => h('button', { type: 'button', class: 'nav' + (P.view === key ? ' on' : ''), onclick: () => go(key) }, label);
  const side = h('aside', { class: 'side' },
    h('div', { class: 'h brand' }, 'SG INGRESOS'),
    h('div', { class: 'sub' }, ROL_LABEL[P.usuario.rol] || ''),
    nav('movimientos', 'Movimientos'), nav('adentro', 'Adentro ahora'), nav('personas', 'Personas y prohibidos'),
    esAdmin() ? [h('div', { class: 'navsep' }, 'Admin Spartan'), nav('estructura', 'Clientes y puestos'), nav('formulario', 'Formulario por objetivo'), nav('guardias', 'Vigiladores'), nav('usuarios', 'Usuarios del panel'), nav('auditoria', 'Auditoría')] : null,
    h('div', { class: 'who' }, P.usuario.nombre, h('br'), P.usuario.email, h('br'), h('button', { type: 'button', onclick: salir }, 'Cerrar sesión')));
  const selCliente = P.clientes.length > 1 && ['movimientos', 'adentro', 'personas'].indexOf(P.view) >= 0
    ? h('select', { class: 'in', style: 'max-width:320px', onchange: e => { P.cliente_id = e.target.value; render(); } }, P.clientes.map(c => h('option', { value: c.cliente_id }, c.nombre)))
    : null;
  if (selCliente) selCliente.value = P.cliente_id;
  const main = h('main', { class: 'main' }, selCliente, (VISTAS[P.view] || VISTAS.movimientos)());
  $app.replaceChildren(h('div', { class: 'layout' }, side, main));
}

function modal(...contenido) {
  const bg = h('div', { class: 'modalbg', onclick: e => { if (e.target === bg) cerrar(); } });
  const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, contenido);
  const cerrar = () => bg.remove();
  bg.append(box);
  document.body.append(bg);
  const esc = e => { if (e.key === 'Escape') { cerrar(); document.removeEventListener('keydown', esc); } };
  document.addEventListener('keydown', esc);
  return cerrar;
}
function campo(label, el, req) {
  if (!el.id) el.id = 'p' + Math.random().toString(36).slice(2, 9);
  return h('div', { class: 'field' }, h('label', { class: 'lbl', for: el.id }, label, req ? h('span', { class: 'req' }, ' *') : null), el);
}
function input(attrs) { return h('input', Object.assign({ class: 'in' }, attrs || {})); }
function select(opciones, valor) {
  const s = h('select', { class: 'in' }, opciones.map(o => h('option', { value: typeof o === 'object' ? o.value : o }, typeof o === 'object' ? o.label : o)));
  if (valor !== undefined) s.value = valor;
  return s;
}
function tabla(cols, rows, onRow) {
  return h('div', { class: 'tablebox' }, h('table', {},
    h('thead', {}, h('tr', {}, cols.map(c => h('th', {}, c.label)))),
    h('tbody', {}, rows.length ? rows.map(r => h('tr', { class: onRow ? 'click' : '', onclick: onRow ? () => onRow(r) : null }, cols.map(c => h('td', {}, c.render ? c.render(r) : (r[c.key] == null ? '' : String(r[c.key]))))))
      : h('tr', {}, h('td', { colspan: String(cols.length), class: 'muted' }, 'Sin resultados.')))));
}
function descargarCsv(nombre, cols, rows) {
  const esc = v => { let s = String(v == null ? '' : v); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const csv = '﻿' + [cols.map(c => esc(c.label)).join(';')].concat(rows.map(r => cols.map(c => esc(c.csv ? c.csv(r) : r[c.key])).join(';'))).join('\r\n');
  const a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: nombre });
  document.body.append(a); a.click(); a.remove();
}
async function verArchivo(archivo_id) {
  const cerrar = modal(h('p', { class: 'muted' }, 'Cargando…'));
  try {
    const f = await call('panel.foto', { cliente_id: P.cliente_id, archivo_id: archivo_id });
    cerrar();
    const bytes = Uint8Array.from(atob(f.b64), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: f.mime }));
    if (f.mime === 'application/pdf') { window.open(url, '_blank', 'noopener'); return; }
    modal(h('div', { class: 'spread' }, h('strong', {}, f.nombre), h('a', { class: 'btnsm', href: url, download: f.nombre }, 'Descargar')), h('img', { src: url, alt: f.nombre }));
  } catch (e) { cerrar(); toast(e.message, 'bad'); }
}
function hoy(offsetDias) { const d = new Date(Date.now() + (offsetDias || 0) * 86400000); return d.toISOString().slice(0, 10); }

/* ---------------- Movimientos ---------------- */
VISTAS.movimientos = () => {
  const cli = clienteActual();
  if (!cli) return h('p', { class: 'muted' }, 'No tenés clientes asignados.');
  const cats = [];
  cli.objetivos.forEach(o => o.config.categorias.forEach(c => { if (!cats.some(x => x.value === c.key)) cats.push({ value: c.key, label: c.label }); }));
  const F = P.filtros || (P.filtros = { desde: hoy(-7), hasta: hoy(0) });
  const f = {
    objetivo: select([{ value: '', label: 'Todos' }].concat(cli.objetivos.map(o => ({ value: o.objetivo_id, label: o.nombre }))), F.objetivo_id || ''),
    desde: input({ type: 'date', value: F.desde }), hasta: input({ type: 'date', value: F.hasta }),
    dni: input({ inputmode: 'numeric', placeholder: 'Con o sin puntos', value: F.dni || '' }),
    nombre: input({ placeholder: 'Nombre o apellido', value: F.nombre || '' }),
    sentido: select([{ value: '', label: 'Todos' }, { value: 'INGRESO', label: 'Ingreso' }, { value: 'EGRESO', label: 'Egreso' }], F.sentido || ''),
    categoria: select([{ value: '', label: 'Todas' }].concat(cats), F.categoria || ''),
    hdesde: input({ type: 'time', value: F.hdesde || '' }), hhasta: input({ type: 'time', value: F.hhasta || '' }),
    alertas: select([{ value: '', label: 'Todos' }, { value: '1', label: 'Solo alertas y excepciones' }], F.solo_alertas ? '1' : '')
  };
  const res = h('div', { style: 'display:flex;flex-direction:column;gap:16px' });
  const cols = [
    { label: 'Fecha', key: 'fecha' }, { label: 'Hora', key: 'hora' }, { label: 'Objetivo', key: 'objetivo' }, { label: 'Puesto', key: 'puesto' },
    { label: 'Categoría', key: 'categoria' }, { label: 'Tipo', key: 'tipo', render: r => badge(r.tipo, r.tipo === 'EGRESO' ? 'dark' : 'ok') },
    { label: 'Apellido', key: 'apellido' }, { label: 'Nombre', key: 'nombre' }, { label: 'DNI', key: 'dni' }, { label: 'CUIL', key: 'cuil' },
    { label: 'Vigilador', key: 'vigilador' }, { label: 'Autoriza', key: 'autoriza' }, { label: 'Motivo', key: 'motivo' }, { label: 'Patente', key: 'patente' },
    { label: 'Observaciones', key: 'observaciones' }, { label: 'Salida', key: 'salida' }, { label: 'Cacheo', key: 'cacheo' },
    { label: 'Foto de cacheo', key: 'foto_cacheo', render: r => r.foto_cacheo ? h('button', { class: 'link', type: 'button', onclick: e => { e.stopPropagation(); verArchivo(r.foto_cacheo); } }, 'Ver foto') : '', csv: r => r.foto_cacheo ? 'sí' : '' },
    { label: 'Otras fotos', key: 'fotos', render: r => r.fotos.length ? h('span', { class: 'row' }, r.fotos.map((id, i) => h('button', { class: 'link', type: 'button', onclick: e => { e.stopPropagation(); verArchivo(id); } }, 'Ver ' + (i + 1)))) : '', csv: r => r.fotos.length },
    { label: 'Alertas', key: 'alertas', render: r => [r.excepcional ? badge('Excepcional', 'bad') : null, r.alertas ? badge(r.alertas.replace(/_/g, ' '), 'warn') : null], csv: r => [r.excepcional, r.alertas].filter(Boolean).join(' | ') }
  ];
  const buscar = async () => {
    Object.assign(F, { objetivo_id: f.objetivo.value, desde: f.desde.value, hasta: f.hasta.value, dni: f.dni.value, nombre: f.nombre.value, sentido: f.sentido.value, categoria: f.categoria.value, hdesde: f.hdesde.value, hhasta: f.hhasta.value, solo_alertas: f.alertas.value === '1' });
    res.replaceChildren(h('p', { class: 'muted' }, 'Buscando…'));
    try {
      const r = await call('panel.movimientos', Object.assign({ cliente_id: P.cliente_id }, F));
      const m = r.metricas;
      res.replaceChildren(
        h('div', { class: 'metrics' },
          [['Registros', m.total], ['Ingresos', m.ingresos], ['Egresos', m.egresos], ['Personas distintas', m.personas], ['Egresos con foto', m.egresos_con_foto === null ? '—' : m.egresos_con_foto + '%']]
            .map(x => h('div', { class: 'metric' }, h('div', { class: 'v' }, String(x[1])), h('div', { class: 'k' }, x[0])))),
        h('div', { class: 'spread' }, h('p', { class: 'muted' }, r.truncado ? 'Se muestran los primeros ' + r.rows.length + ' registros. Acotá el filtro para ver el resto.' : r.rows.length + ' registros'),
          h('button', { class: 'btn2', type: 'button', onclick: () => descargarCsv('movimientos_' + F.desde + '_' + F.hasta + '.csv', cols, r.rows) }, 'Descargar CSV')),
        tabla(cols, r.rows, row => modal(h('h2', { class: 'sect' }, row.apellido + (row.nombre ? ', ' + row.nombre : '')),
          ...cols.filter(c => row[c.key] && (!Array.isArray(row[c.key]) || row[c.key].length)).map(c => h('div', {}, h('strong', {}, c.label + ': '), c.render ? c.render(row) : String(row[c.key]))),
          row.excepcional ? h('div', { class: 'banner bad' }, 'Ingreso excepcional: ' + row.excepcional) : null)));
    } catch (e) { res.replaceChildren(h('div', { class: 'banner bad' }, e.message)); }
  };
  setTimeout(buscar, 0);
  return h('div', { style: 'display:flex;flex-direction:column;gap:16px' },
    h('h1', { class: 'h title' }, 'Movimientos'),
    h('div', { class: 'card' }, h('div', { class: 'grid-f' },
      campo('Objetivo', f.objetivo), campo('Desde', f.desde), campo('Hasta', f.hasta), campo('DNI', f.dni), campo('Nombre o apellido', f.nombre),
      campo('Movimiento', f.sentido), campo('Categoría', f.categoria), campo('Hora desde', f.hdesde), campo('Hora hasta', f.hhasta), campo('Mostrar', f.alertas),
      h('button', { class: 'btn', type: 'button', onclick: buscar }, 'Filtrar'))),
    res);
};

/* ---------------- Adentro ahora ---------------- */
VISTAS.adentro = () => {
  const box = h('div', {}, h('p', { class: 'muted' }, 'Cargando…'));
  call('panel.adentro', { cliente_id: P.cliente_id }).then(r => {
    box.replaceChildren(h('p', { class: 'muted' }, r.adentro.length + ' personas sin salida registrada (últimos 7 días)'),
      tabla([{ label: 'Persona', key: 'nombre' }, { label: 'DNI', key: 'dni' }, { label: 'Categoría', key: 'categoria' }, { label: 'Autoriza', key: 'autoriza' }, { label: 'Desde', key: 'desde' }, { label: 'Objetivo', key: 'objetivo' }, { label: 'Puesto', key: 'puesto' }], r.adentro));
  }).catch(e => box.replaceChildren(h('div', { class: 'banner bad' }, e.message)));
  return h('div', { style: 'display:flex;flex-direction:column;gap:16px' }, h('h1', { class: 'h title' }, 'Adentro ahora'), box);
};

/* ---------------- Personas y prohibidos ---------------- */
VISTAS.personas = () => {
  const q = input({ placeholder: 'DNI, nombre, apellido, empresa o patente' });
  const est = select([{ value: '', label: 'Todos' }, { value: 'PROHIBIDO', label: 'Prohibidos' }, { value: 'AUTORIZADO', label: 'Autorizados' }, { value: 'EVENTUAL', label: 'Eventuales' }], 'PROHIBIDO');
  const box = h('div', {});
  const buscar = async () => {
    box.replaceChildren(h('p', { class: 'muted' }, 'Buscando…'));
    try {
      const r = await call('panel.personas', { cliente_id: P.cliente_id, q: q.value, estado: est.value });
      box.replaceChildren(tabla([
        { label: 'Apellido', key: 'apellido' }, { label: 'Nombre', key: 'nombre' }, { label: 'Documento', key: 'nro_doc' }, { label: 'Categoría', key: 'categoria' },
        { label: 'Empresa / servicio', key: 'empresa', render: p => p.empresa || p.subtipo || '' }, { label: 'Patentes', key: 'patentes', render: p => p.patentes.join(', ') },
        { label: 'Estado', key: 'estado', render: p => badge(p.estado || '—', p.estado === 'PROHIBIDO' ? 'bad' : (p.estado === 'EVENTUAL' ? 'warn' : 'ok')) }
      ], r.personas, p => detallePersona(p.persona_id, buscar)));
    } catch (e) { box.replaceChildren(h('div', { class: 'banner bad' }, e.message)); }
  };
  q.addEventListener('keydown', e => { if (e.key === 'Enter') buscar(); });
  est.addEventListener('change', buscar);
  setTimeout(buscar, 0);
  return h('div', { style: 'display:flex;flex-direction:column;gap:16px' },
    h('div', { class: 'spread' }, h('h1', { class: 'h title' }, 'Personas y prohibidos'),
      PUEDE_ESTADO.indexOf(P.usuario.rol) >= 0 ? h('button', { class: 'btnred', type: 'button', onclick: () => formEstado(null, 'PROHIBIDO', buscar) }, 'Prohibir a una persona nueva') : null),
    h('div', { class: 'card' }, h('div', { class: 'grid-f' }, campo('Buscar', q), campo('Estado', est), h('button', { class: 'btn', type: 'button', onclick: buscar }, 'Buscar'))),
    box);
};

async function detallePersona(persona_id, alCambiar) {
  const cerrar = modal(h('p', { class: 'muted' }, 'Cargando…'));
  let p;
  try { p = (await call('panel.persona', { cliente_id: P.cliente_id, persona_id: persona_id })).persona; } catch (e) { cerrar(); toast(e.message, 'bad'); return; }
  cerrar();
  const puede = PUEDE_ESTADO.indexOf(P.usuario.rol) >= 0;
  const cerrar2 = modal(
    h('div', { class: 'spread' }, h('h2', { class: 'h title', style: 'font-size:32px' }, p.nombre + ' ' + p.apellido), badge(p.estado || '—', p.estado === 'PROHIBIDO' ? 'bad' : 'ok')),
    h('p', { class: 'muted' }, (p.tipo_doc || 'DNI') + ' ' + p.nro_doc + (p.patentes.length ? ' · ' + p.patentes.join(', ') : '') + (p.empresa ? ' · ' + p.empresa : '') + (p.subtipo ? ' · ' + p.subtipo : '')),
    p.prohibicion ? h('div', { class: 'banner bad' }, 'Prohibido desde ' + (p.prohibicion.fecha || '—') + ' · ordenó ' + [p.prohibicion.ordenado_tipo, p.prohibicion.ordenado_nombre, p.prohibicion.ordenado_lote ? 'lote ' + p.prohibicion.ordenado_lote : ''].filter(Boolean).join(' ') + (p.prohibicion.motivo ? ' · ' + p.prohibicion.motivo : '')) : null,
    h('h3', { class: 'sect' }, 'Documentación'),
    p.docs.length ? p.docs.map(d => h('div', { class: 'row' }, h('strong', {}, d.tipo.replace(/_/g, ' ')), badge(d.estado === 'whatsapp' ? 'Captura de WhatsApp · falta original' : d.estado, d.estado === 'incorporado' ? 'ok' : (d.estado === 'vencido' ? 'bad' : 'warn')), d.vencimiento ? h('span', { class: 'muted' }, 'vence ' + d.vencimiento) : null)) : h('p', { class: 'muted' }, 'Sin documentación cargada.'),
    h('h3', { class: 'sect' }, 'Historial de estados'),
    p.historial.length ? tabla([{ label: 'Fecha', key: 'fecha' }, { label: 'De', key: 'de' }, { label: 'A', key: 'a' }, { label: 'Ordenó', key: 'ordenado' }, { label: 'Medio', key: 'medio' }, { label: 'Motivo', key: 'motivo' }, { label: 'Cargó', key: 'por' }], p.historial) : h('p', { class: 'muted' }, 'Sin cambios de estado.'),
    h('h3', { class: 'sect' }, 'Últimos movimientos'),
    tabla([{ label: 'Fecha', key: 'fecha' }, { label: 'Tipo', key: 'tipo' }, { label: 'Salida', key: 'salida' }, { label: 'Autoriza', key: 'autoriza' }], p.movimientos),
    puede ? h('div', { class: 'row' },
      p.estado === 'PROHIBIDO'
        ? h('button', { class: 'btn', type: 'button', onclick: () => { cerrar2(); formEstado(p, 'AUTORIZADO', alCambiar); } }, 'Levantar prohibición')
        : h('button', { class: 'btnred', type: 'button', onclick: () => { cerrar2(); formEstado(p, 'PROHIBIDO', alCambiar); } }, 'Prohibir ingreso')) : null
  );
}

function formEstado(persona, nuevo, alCambiar) {
  const E = { tipo: P.usuario.rol === 'administracion' ? 'Administración' : (P.usuario.rol === 'intendencia' ? 'Intendencia' : 'Residente'), medio: 'WhatsApp' };
  const nro = input({ inputmode: 'numeric' }), nom = input(), ape = input(), pat = input({ style: 'text-transform:uppercase' });
  const oNom = input(), oLote = input({ inputmode: 'numeric' }), mot = h('textarea', { class: 'in', rows: '3' });
  const err = h('div', { class: 'banner bad', hidden: true });
  const cuerpo = h('div', { style: 'display:flex;flex-direction:column;gap:12px' });
  const pintar = () => cuerpo.replaceChildren(
    h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Quién lo ordena'), chips(['Residente', 'Administración', 'Intendencia'], E.tipo, v => { E.tipo = v; pintar(); })),
    E.tipo === 'Residente' ? h('div', { class: 'grid-f' }, campo('Nombre y apellido del residente', oNom, true), campo('Lote', oLote, true)) : campo('Nombre de quien lo ordena', oNom),
    h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Medio'), chips(['WhatsApp', 'Llamada', 'Mail', 'Presencial'], E.medio, v => { E.medio = v; pintar(); })),
    campo('Motivo', mot));
  pintar();
  const ok = h('button', { class: nuevo === 'PROHIBIDO' ? 'btnred' : 'btn', type: 'button' }, nuevo === 'PROHIBIDO' ? 'Confirmar prohibición' : 'Confirmar levantamiento');
  const cerrar = modal(
    h('h2', { class: 'sect' }, (nuevo === 'PROHIBIDO' ? 'Prohibir ingreso' : 'Levantar prohibición') + (persona ? ' · ' + persona.nombre + ' ' + persona.apellido : '')),
    P.usuario.rol === 'supervisor' ? h('p', { class: 'muted' }, 'Como supervisor Spartan, registrás el pedido de quien lo ordena. Queda tu usuario como ejecutor.') : null,
    persona ? null : h('div', { class: 'grid-f' }, campo('DNI', nro, true), campo('Nombre', nom, true), campo('Apellido', ape, true), campo('Patente', pat)),
    cuerpo, err, h('div', { class: 'row' }, ok, h('button', { class: 'btn2', type: 'button', onclick: () => cerrar() }, 'Cancelar')));
  ok.onclick = async () => {
    ok.disabled = true; err.hidden = true;
    try {
      await call('panel.estado', {
        cliente_id: P.cliente_id, persona_id: persona ? persona.persona_id : '', nro_doc: nro.value, nombre: nom.value, apellido: ape.value, patente: pat.value,
        estado_nuevo: nuevo, ordenado_tipo: E.tipo, ordenado_nombre: oNom.value, ordenado_lote: oLote.value, medio: E.medio, motivo: mot.value
      });
      cerrar();
      toast(nuevo === 'PROHIBIDO' ? 'Prohibición registrada. Los puestos la reciben en la próxima sincronización.' : 'Prohibición levantada.');
      if (alCambiar) alCambiar();
    } catch (e) { err.textContent = e.message; err.hidden = false; ok.disabled = false; }
  };
}

/* ---------------- Admin: estructura ---------------- */
async function estructura(force) {
  if (!P.est || force) P.est = await call('admin.estructura');
  return P.est;
}
const TIPO_LABEL = { country: 'Country / barrio', control_personal: 'Control de personal' };

VISTAS.estructura = () => {
  const box = h('div', { style: 'display:flex;flex-direction:column;gap:16px' }, h('p', { class: 'muted' }, 'Cargando…'));
  const recargar = async () => { await estructura(true); await cargar(); };
  estructura().then(E => {
    box.replaceChildren(
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => formCliente(null, recargar) }, '+ Nuevo cliente')),
      E.clientes.length ? null : h('p', { class: 'muted' }, 'Todavía no hay clientes.'),
      ...E.clientes.map(c => h('div', { class: 'card' },
        h('div', { class: 'spread' },
          h('div', {}, h('h2', { class: 'sect' }, c.nombre), h('p', { class: 'muted' }, 'Avisos: ' + (c.avisos || 'sin mails configurados'))),
          h('div', { class: 'row' }, c.activo === true || c.activo === 'TRUE' ? badge('Activo', 'ok') : badge('Inactivo', 'warn'),
            h('button', { class: 'btnsm', type: 'button', onclick: () => formCliente(c, recargar) }, 'Editar'),
            h('button', { class: 'btnsm', type: 'button', onclick: () => formObjetivo(c, recargar) }, '+ Objetivo'))),
        h('div', { class: 'tree-o' }, E.objetivos.filter(o => o.cliente_id === c.cliente_id).map(o => h('div', {},
          h('div', { class: 'spread' },
            h('div', {}, h('strong', {}, o.nombre), ' ', badge(TIPO_LABEL[o.tipo] || o.tipo, 'dark'), o.direccion ? h('span', { class: 'muted' }, ' · ' + o.direccion) : null),
            h('div', { class: 'row' },
              h('button', { class: 'btnsm', type: 'button', onclick: () => { P.cfgObjetivo = o.objetivo_id; go('formulario'); } }, 'Formulario'),
              h('button', { class: 'btnsm', type: 'button', onclick: () => formPuesto(o, recargar) }, '+ Puesto'))),
          h('div', { class: 'tree-p' }, E.puestos.filter(p => p.objetivo_id === o.objetivo_id).map(p => {
            const devs = E.dispositivos.filter(d => d.puesto_id === p.puesto_id && d.estado !== 'revocado');
            return h('div', { class: 'spread' },
              h('div', {}, h('strong', {}, p.nombre), h('div', { class: 'row' }, devs.length ? devs.map(d => h('span', { class: 'row' },
                badge(d.etiqueta + ' · ' + (d.estado === 'activo' ? 'activo' : 'código pendiente'), d.estado === 'activo' ? 'ok' : 'warn'),
                d.ultimo_uso ? h('span', { class: 'muted' }, 'último uso ' + d.ultimo_uso) : null,
                h('button', { class: 'btnsm red', type: 'button', onclick: async () => { if (!confirm('¿Revocar este dispositivo? Deja de funcionar al instante.')) return; await call('admin.dispositivo.revocar', { dispositivo_id: d.dispositivo_id }); toast('Dispositivo revocado'); recargar(); } }, 'Revocar')))
                : h('span', { class: 'muted' }, 'Sin celular activado'))),
              h('button', { class: 'btnsm', type: 'button', onclick: () => generarCodigo(p, recargar) }, 'Activar celular'));
          }))))))));
  }).catch(e => box.replaceChildren(h('div', { class: 'banner bad' }, e.message)));
  return h('div', { style: 'display:flex;flex-direction:column;gap:16px' }, h('h1', { class: 'h title' }, 'Clientes, objetivos y puestos'), box);
};

function formSimple(titulo, campos, onSave) {
  const err = h('div', { class: 'banner bad', hidden: true });
  const ok = h('button', { class: 'btn', type: 'button' }, 'Guardar');
  const cerrar = modal(h('h2', { class: 'sect' }, titulo), ...campos, err, h('div', { class: 'row' }, ok, h('button', { class: 'btn2', type: 'button', onclick: () => cerrar() }, 'Cancelar')));
  ok.onclick = async () => {
    ok.disabled = true; err.hidden = true;
    try { await onSave(); cerrar(); } catch (e) { err.textContent = e.message; err.hidden = false; ok.disabled = false; }
  };
}
function formCliente(c, alGuardar) {
  const nom = input({ value: c ? c.nombre : '' }), av = input({ value: c ? c.avisos : '', placeholder: 'mail1@..., mail2@...' });
  const act = select([{ value: '1', label: 'Activo' }, { value: '0', label: 'Inactivo' }], c && !(c.activo === true || c.activo === 'TRUE') ? '0' : '1');
  formSimple(c ? 'Editar cliente' : 'Nuevo cliente', [campo('Nombre', nom, true), campo('Mails de aviso (excepciones y alertas)', av), c ? campo('Estado', act) : null,
    c ? null : h('p', { class: 'muted' }, 'Se crea su planilla de datos y su carpeta privada en Drive.')],
    async () => { await call('admin.cliente.guardar', { cliente_id: c ? c.cliente_id : '', nombre: nom.value, avisos: av.value, activo: act.value === '1' }); toast('Cliente guardado'); alGuardar(); });
}
function formObjetivo(c, alGuardar) {
  const nom = input(), dir = input(), tipo = select(P.est.tipos.map(t => ({ value: t, label: TIPO_LABEL[t] || t })));
  formSimple('Nuevo objetivo · ' + c.nombre, [campo('Nombre', nom, true), campo('Tipo de objetivo', tipo, true), campo('Dirección', dir),
    h('p', { class: 'muted' }, 'El tipo carga la plantilla inicial del formulario. Después se ajusta campo por campo.')],
    async () => { await call('admin.objetivo.guardar', { cliente_id: c.cliente_id, nombre: nom.value, tipo: tipo.value, direccion: dir.value }); toast('Objetivo creado'); alGuardar(); });
}
function formPuesto(o, alGuardar) {
  const nom = input({ placeholder: 'Ej: Acceso principal' });
  formSimple('Nuevo puesto · ' + o.nombre, [campo('Nombre del puesto', nom, true)],
    async () => { await call('admin.puesto.guardar', { objetivo_id: o.objetivo_id, nombre: nom.value }); toast('Puesto creado'); alGuardar(); });
}
async function generarCodigo(p, alGuardar) {
  const et = input({ value: 'Celular del puesto' });
  formSimple('Activar celular · ' + p.nombre, [campo('Etiqueta del dispositivo', et), h('p', { class: 'muted' }, 'Se genera un código de un solo uso, válido por 48 horas.')], async () => {
    const r = await call('admin.dispositivo.codigo', { puesto_id: p.puesto_id, etiqueta: et.value });
    modal(h('h2', { class: 'sect' }, 'Código de activación'), h('div', { class: 'code' }, r.codigo),
      h('p', {}, 'Abrí la App Puesto en el celular del puesto y cargá este código. Vence el ' + r.vence + '.'),
      h('div', { class: 'banner warn' }, 'Este código se muestra una sola vez. No lo envíes por grupos ni lo dejes escrito.'));
    alGuardar();
  });
}

/* ---------------- Admin: formulario por objetivo ---------------- */
const TIPOS_EXTRA = [{ value: 'texto', label: 'Texto' }, { value: 'numero', label: 'Número' }, { value: 'lista', label: 'Lista' }, { value: 'texto_largo', label: 'Texto largo' }, { value: 'foto', label: 'Foto' }, { value: 'fecha', label: 'Fecha' }];
const LABEL_TIPO = { texto: 'Texto', numero: 'Número', lista: 'Lista', texto_largo: 'Texto largo', foto: 'Foto', patente: 'Patente', fecha: 'Fecha' };

VISTAS.formulario = () => {
  const box = h('div', { style: 'display:flex;flex-direction:column;gap:16px' }, h('p', { class: 'muted' }, 'Cargando…'));
  estructura().then(async E => {
    if (!E.objetivos.length) { box.replaceChildren(h('p', { class: 'muted' }, 'Primero creá un objetivo.')); return; }
    if (!P.cfgObjetivo) P.cfgObjetivo = E.objetivos[0].objetivo_id;
    const sel = select(E.objetivos.map(o => ({ value: o.objetivo_id, label: (E.clientes.filter(c => c.cliente_id === o.cliente_id)[0] || {}).nombre + ' › ' + o.nombre })), P.cfgObjetivo);
    sel.onchange = () => { P.cfgObjetivo = sel.value; P.cfg = null; render(); };
    if (!P.cfg || P.cfg._id !== P.cfgObjetivo) {
      const r = await call('admin.objetivo.config', { objetivo_id: P.cfgObjetivo });
      P.cfg = r.config; P.cfg._id = P.cfgObjetivo; P.cfg._tipo = r.tipo; P.cfgTab = P.cfg.categorias[0].key; P.cfgDirty = false;
    }
    pintarConfig(box, sel);
  }).catch(e => box.replaceChildren(h('div', { class: 'banner bad' }, e.message)));
  return h('div', { style: 'display:flex;flex-direction:column;gap:16px' }, h('h1', { class: 'h title' }, 'Formulario por objetivo'),
    h('p', { class: 'muted' }, 'Qué ve y qué completa el guardia según el tipo de ingreso. Documento, nombre, apellido, tipo de ingreso y quién autoriza son fijos.'), box);
};

function sw(on, onClick, disabled) {
  return h('button', { type: 'button', class: 'sw' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', disabled: !!disabled, onclick: onClick });
}

function pintarConfig(box, sel) {
  const C = P.cfg;
  const cat = C.categorias.filter(c => c.key === P.cfgTab)[0];
  const sucio = () => { P.cfgDirty = true; pintarConfig(box, sel); };
  const guardar = h('button', { class: 'btn', type: 'button', disabled: !P.cfgDirty }, 'Guardar cambios');
  guardar.onclick = async () => {
    guardar.disabled = true;
    try {
      const enviar = JSON.parse(JSON.stringify(C)); delete enviar._id; delete enviar._tipo;
      const r = await call('admin.objetivo.config', { objetivo_id: C._id, config: enviar });
      P.cfg = Object.assign(r.config, { _id: C._id, _tipo: C._tipo }); P.cfgDirty = false;
      toast('Configuración guardada. Los puestos la reciben en la próxima sincronización.');
      pintarConfig(box, sel);
    } catch (e) { toast(e.message, 'bad'); guardar.disabled = false; }
  };
  const etiq = input({ value: (C.etiquetas && C.etiquetas.lote) || '' });
  etiq.addEventListener('change', () => { C.etiquetas.lote = etiq.value; P.cfgDirty = true; guardar.disabled = false; });

  const mover = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= cat.campos.length) return;
    const t = cat.campos[i]; cat.campos[i] = cat.campos[j]; cat.campos[j] = t;
    sucio();
  };
  const filaCampo = (f, i) => {
    const lab = input({ value: f.label });
    lab.addEventListener('change', () => { f.label = lab.value; P.cfgDirty = true; guardar.disabled = false; });
    return h('div', { class: 'cfggrid', style: 'padding:8px 0;border-top:1px solid #EEF2EF' },
      h('div', {}, lab, f.extra ? badge('EXTRA', 'ok') : null, f.tipo === 'lista' ? h('div', { class: 'muted', style: 'margin-top:4px' }, 'Opciones: ' + (f.opciones || []).join(', ')) : null),
      h('span', { class: 'muted' }, LABEL_TIPO[f.tipo] || f.tipo),
      sw(f.visible, () => { f.visible = !f.visible; if (!f.visible) f.obligatorio = false; sucio(); }),
      sw(f.obligatorio, () => { f.obligatorio = !f.obligatorio; sucio(); }, !f.visible),
      h('div', { class: 'acciones' },
        h('button', { type: 'button', class: 'mini', 'aria-label': 'Subir ' + f.label, title: 'Subir', disabled: i === 0, onclick: () => mover(i, -1) }, '↑'),
        h('button', { type: 'button', class: 'mini', 'aria-label': 'Bajar ' + f.label, title: 'Bajar', disabled: i === cat.campos.length - 1, onclick: () => mover(i, 1) }, '↓'),
        f.extra
          ? h('button', { type: 'button', class: 'mini red', 'aria-label': 'Eliminar ' + f.label, title: 'Eliminar campo extra', onclick: () => {
            if (!confirm('¿Eliminar el campo "' + f.label + '"? Los datos ya cargados en ingresos anteriores se conservan.')) return;
            cat.campos.splice(i, 1); sucio();
          } }, '✕')
          : h('span', { class: 'mini ghost', title: 'Los campos de la plantilla no se eliminan: se ocultan con "Visible"' }, '')));
  };
  const agregarExtra = () => {
    const lab = input(), tipo = select(TIPOS_EXTRA), ops = input({ placeholder: 'Separadas por coma (solo para listas)' });
    formSimple('Campo extra · ' + cat.label, [campo('Nombre del campo', lab, true), campo('Tipo de dato', tipo), campo('Opciones', ops)], async () => {
      if (!lab.value.trim()) throw new Error('Poné un nombre al campo.');
      if (cat.campos.filter(x => x.extra).length >= 6) throw new Error('Máximo 6 campos extra por tipo de ingreso.');
      cat.campos.push({ key: 'x_' + lab.value.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '_').slice(0, 24) + '_' + Date.now().toString(36).slice(-3), label: lab.value.trim(), tipo: tipo.value, extra: true, visible: true, obligatorio: false, opciones: tipo.value === 'lista' ? ops.value.split(',').map(s => s.trim()).filter(Boolean) : undefined });
      sucio();
    });
  };
  const cac = C.modulos.cacheo || {};
  const preview = h('div', { class: 'phone' }, h('div', { class: 'scr' }, h('div', { class: 'ph' }, cat.label),
    h('div', { class: 'pb' },
      (cat.persona ? ['Documento', 'Nombre', 'Apellido'] : []).map(l => h('div', {}, h('div', { class: 'pl' }, l, h('span', { class: 'req' }, ' *')), h('div', { class: 'px' }))),
      cat.campos.filter(f => f.visible).map(f => h('div', {}, h('div', { class: 'pl' }, f.label, f.obligatorio ? h('span', { class: 'req' }, ' *') : null), h('div', { class: 'px' }))),
      C.autoriza && C.autoriza.length && cat.persona ? h('div', {}, h('div', { class: 'pl' }, 'Quién autoriza', h('span', { class: 'req' }, ' *')), h('div', { class: 'muted' }, C.autoriza.join(' · ') + ' (si residente: ' + (C.etiquetas.lote || 'Lote') + ' y apellido)')) : null,
      (cat.docs || []).filter(d => d.activo !== false).map(d => h('div', { class: 'px', style: 'height:auto;padding:6px 8px;font-size:11.5px;font-weight:600' }, d.label, d.bloquea ? h('span', { class: 'req' }, ' · bloquea') : null)),
      cat.cacheo && cac.activo ? h('div', { class: 'px', style: 'height:auto;padding:6px 8px;font-size:11.5px;font-weight:600' }, 'Cacheo (' + cac.momento + ')' + (cac.obligatoria ? ' · foto obligatoria' : '')) : null)));

  box.replaceChildren(
    h('div', { class: 'card' }, h('div', { class: 'grid-f' }, campo('Objetivo', sel), C.etiquetas && 'lote' in C.etiquetas ? campo('Etiqueta de “Lote”', etiq) : null, h('div', { class: 'row' }, guardar)),
      P.cfgDirty ? h('div', { class: 'banner warn' }, 'Hay cambios sin guardar.') : null),
    h('div', { class: 'chips' }, C.categorias.map(c => h('button', { type: 'button', class: 'chip' + (c.key === P.cfgTab ? ' on' : ''), onclick: () => { P.cfgTab = c.key; pintarConfig(box, sel); } }, c.label + (c.activa === false ? ' (oculta)' : '')))),
    h('div', { class: 'split' },
      h('div', { class: 'grow' },
        h('div', { class: 'card' },
          h('div', { class: 'spread' }, h('h2', { class: 'sect' }, cat.label), h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Habilitado en este objetivo'), sw(cat.activa !== false, () => { cat.activa = cat.activa === false; sucio(); }))),
          cat.estados ? h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Estado por defecto de una ficha nueva:'), chips(['AUTORIZADO', 'EVENTUAL'], cat.estado_default, v => { cat.estado_default = v; sucio(); })) : null,
          h('div', { class: 'cfggrid', style: 'font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase' }, h('span', {}, 'Campo'), h('span', {}, 'Tipo'), h('span', {}, 'Visible'), h('span', {}, 'Obligatorio'), h('span', {}, 'Orden')),
          cat.campos.map(filaCampo),
          h('p', { class: 'muted' }, 'El orden de esta lista es el orden en que el guardia ve los campos. Los campos de la plantilla no se eliminan: se ocultan apagando "Visible".'),
          h('div', { class: 'row' }, h('button', { class: 'btn2', type: 'button', onclick: agregarExtra }, '+ Agregar campo extra'), h('span', { class: 'muted' }, cat.campos.filter(x => x.extra).length + ' de 6'))),
        (cat.docs || []).length ? h('div', { class: 'card' }, h('h2', { class: 'sect' }, 'Documentos exigidos'),
          h('div', { class: 'cfggrid docs', style: 'font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase' }, h('span', {}, 'Documento'), h('span', {}, 'Vigencia (meses)'), h('span', {}, 'Pedir'), h('span', {}, 'Bloquea si falta')),
          cat.docs.map(d => {
            const vig = input({ type: 'number', min: '0', max: '60', value: String(d.vigencia_meses || 0) });
            vig.addEventListener('change', () => { d.vigencia_meses = Number(vig.value) || 0; P.cfgDirty = true; guardar.disabled = false; });
            return h('div', { class: 'cfggrid docs' }, h('strong', {}, d.label), vig,
              sw(d.activo !== false, () => { d.activo = d.activo === false; if (d.activo === false) d.bloquea = false; sucio(); }),
              sw(!!d.bloquea, () => { d.bloquea = !d.bloquea; sucio(); }, d.activo === false));
          })) : null,
        cat.cacheo ? h('div', { class: 'card' }, h('h2', { class: 'sect' }, 'Cacheo'),
          h('div', { class: 'row' }, h('span', {}, 'Módulo activo'), sw(!!cac.activo, () => { cac.activo = !cac.activo; sucio(); })),
          h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Momento'), chips([{ value: 'egreso', label: 'Egreso' }, { value: 'ingreso', label: 'Ingreso' }, { value: 'ambos', label: 'Ambos' }], cac.momento, v => { cac.momento = v; sucio(); })),
          h('div', { class: 'row' }, h('span', {}, 'Foto obligatoria (FOTO_CACHEO_OBLIGATORIA)'), sw(!!cac.obligatoria, () => { cac.obligatoria = !cac.obligatoria; sucio(); })),
          (() => { const al = input({ type: 'number', min: '0', max: '50', value: String(cac.aleatorio_cada || 0), style: 'max-width:120px' }); al.addEventListener('change', () => { cac.aleatorio_cada = Number(al.value) || 0; P.cfgDirty = true; guardar.disabled = false; }); return campo('Cacheo aleatorio: 1 de cada (0 = desactivado)', al); })()) : null),
      preview));
}

/* ---------------- Admin: vigiladores, usuarios, auditoría ---------------- */
VISTAS.guardias = () => {
  const box = h('div', {}, h('p', { class: 'muted' }, 'Cargando…'));
  const cargarG = async () => {
    const [E, r] = await Promise.all([estructura(), call('admin.guardias')]);
    const nombrePuesto = id => { if (id === '*') return 'Todos'; const p = E.puestos.filter(x => x.puesto_id === id)[0]; const o = E.objetivos.filter(x => x.objetivo_id === id)[0]; return p ? p.nombre : (o ? o.nombre + ' (todo el objetivo)' : id); };
    box.replaceChildren(tabla([
      { label: 'CUIL', key: 'cuil' }, { label: 'Apellido', key: 'apellido' }, { label: 'Nombre', key: 'nombre' },
      { label: 'Puestos', key: 'puestos', render: g => String(g.puestos || '').split(',').filter(Boolean).map(nombrePuesto).join(', ') },
      { label: 'Estado', key: 'activo', render: g => badge(g.activo ? 'Activo' : 'Inactivo', g.activo ? 'ok' : 'warn') }
    ], r.guardias, g => formGuardia(g, E, cargarG)));
    P._E = E;
  };
  cargarG().catch(e => box.replaceChildren(h('div', { class: 'banner bad' }, e.message)));
  return h('div', { style: 'display:flex;flex-direction:column;gap:16px' },
    h('div', { class: 'spread' }, h('h1', { class: 'h title' }, 'Vigiladores'), h('button', { class: 'btn', type: 'button', onclick: async () => formGuardia(null, await estructura(), cargarG) }, '+ Nuevo vigilador')),
    h('p', { class: 'muted' }, 'El CUIL es lo que el vigilador ingresa en la App Puesto. Solo puede operar en los puestos habilitados.'), box);
};
function formGuardia(g, E, alGuardar) {
  const cuil = input({ inputmode: 'numeric', value: g ? g.cuil : '', disabled: !!g }), nom = input({ value: g ? g.nombre : '' }), ape = input({ value: g ? g.apellido : '' });
  const actuales = g ? String(g.puestos || '').split(',') : ['*'];
  const opciones = [{ value: '*', label: 'Todos los puestos' }];
  E.objetivos.forEach(o => {
    opciones.push({ value: o.objetivo_id, label: o.nombre + ' (todo el objetivo)' });
    E.puestos.filter(p => p.objetivo_id === o.objetivo_id).forEach(p => opciones.push({ value: p.puesto_id, label: '   ' + o.nombre + ' › ' + p.nombre }));
  });
  const ps = h('select', { class: 'in', multiple: true, size: String(Math.min(8, opciones.length)) }, opciones.map(o => h('option', { value: o.value, selected: actuales.indexOf(o.value) >= 0 }, o.label)));
  const act = select([{ value: '1', label: 'Activo' }, { value: '0', label: 'Inactivo' }], g && !g.activo ? '0' : '1');
  formSimple(g ? 'Editar vigilador' : 'Nuevo vigilador', [campo('CUIL (11 dígitos)', cuil, true), h('div', { class: 'grid-f' }, campo('Nombre', nom, true), campo('Apellido', ape, true)), campo('Puestos habilitados (Ctrl/Cmd para varios)', ps), campo('Estado', act)],
    async () => { await call('admin.guardia.guardar', { cuil: cuil.value, nombre: nom.value, apellido: ape.value, puestos: Array.from(ps.selectedOptions).map(o => o.value).join(','), activo: act.value === '1' }); toast('Vigilador guardado'); alGuardar(); });
}

VISTAS.usuarios = () => {
  const box = h('div', {}, h('p', { class: 'muted' }, 'Cargando…'));
  const cargarU = async () => {
    const [E, r] = await Promise.all([estructura(), call('admin.usuarios')]);
    const nombreCli = id => id === '*' ? 'Todos' : ((E.clientes.filter(c => c.cliente_id === id)[0] || {}).nombre || id);
    box.replaceChildren(tabla([
      { label: 'Email', key: 'email' }, { label: 'Nombre', key: 'nombre' }, { label: 'Rol', key: 'rol', render: u => ROL_LABEL[u.rol] || u.rol },
      { label: 'Clientes', key: 'clientes', render: u => String(u.clientes || '').split(',').filter(Boolean).map(nombreCli).join(', ') },
      { label: 'Estado', key: 'activo', render: u => badge(u.activo ? 'Activo' : 'Inactivo', u.activo ? 'ok' : 'warn') }
    ], r.usuarios, u => formUsuario(u, E, cargarU)));
  };
  cargarU().catch(e => box.replaceChildren(h('div', { class: 'banner bad' }, e.message)));
  return h('div', { style: 'display:flex;flex-direction:column;gap:16px' },
    h('div', { class: 'spread' }, h('h1', { class: 'h title' }, 'Usuarios del panel'), h('button', { class: 'btn', type: 'button', onclick: async () => formUsuario(null, await estructura(), cargarU) }, '+ Nuevo usuario')),
    h('p', { class: 'muted' }, 'Administración e Intendencia ven solo sus clientes. Los supervisores Spartan pueden aplicar y levantar prohibiciones por pedido. Pueden ser cuentas Gmail personales.'), box);
};
function formUsuario(u, E, alGuardar) {
  const em = input({ type: 'email', value: u ? u.email : '', disabled: !!u }), nom = input({ value: u ? u.nombre : '' });
  const rol = select(Object.keys(ROL_LABEL).map(k => ({ value: k, label: ROL_LABEL[k] })), u ? u.rol : 'administracion');
  const actuales = u ? String(u.clientes || '').split(',') : [];
  const cl = h('select', { class: 'in', multiple: true, size: String(Math.min(6, E.clientes.length + 1)) },
    [h('option', { value: '*', selected: actuales.indexOf('*') >= 0 }, 'Todos los clientes')].concat(E.clientes.map(c => h('option', { value: c.cliente_id, selected: actuales.indexOf(c.cliente_id) >= 0 }, c.nombre))));
  const act = select([{ value: '1', label: 'Activo' }, { value: '0', label: 'Inactivo' }], u && !u.activo ? '0' : '1');
  formSimple(u ? 'Editar usuario' : 'Nuevo usuario', [campo('Email de Google', em, true), campo('Nombre', nom), campo('Rol', rol, true), campo('Clientes (Ctrl/Cmd para varios)', cl), campo('Estado', act)],
    async () => { await call('admin.usuario.guardar', { email: em.value, nombre: nom.value, rol: rol.value, clientes: Array.from(cl.selectedOptions).map(o => o.value).join(','), activo: act.value === '1' }); toast('Usuario guardado'); alGuardar(); });
}

VISTAS.auditoria = () => {
  const box = h('div', {}, h('p', { class: 'muted' }, 'Cargando…'));
  call('admin.auditoria').then(r => box.replaceChildren(tabla([{ label: 'Fecha', key: 'fecha' }, { label: 'Quién', key: 'actor' }, { label: 'Acción', key: 'accion' }, { label: 'Entidad', key: 'entidad' }, { label: 'Detalle', key: 'despues' }], r.rows)))
    .catch(e => box.replaceChildren(h('div', { class: 'banner bad' }, e.message)));
  return h('div', { style: 'display:flex;flex-direction:column;gap:16px' }, h('h1', { class: 'h title' }, 'Auditoría'), h('p', { class: 'muted' }, 'Últimas 400 acciones de estructura, accesos y configuración. La auditoría de cada cliente está en su planilla.'), box);
};

/* ---------------- inicio ---------------- */
(async () => {
  P.sesion = sessionStorage.getItem('sg_panel');
  if (!P.sesion) return pantallaLogin();
  try { await cargar(); } catch (e) { pantallaLogin(e.code === 'sesion_vencida' ? '' : e.message); }
})();
