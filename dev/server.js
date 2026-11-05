// Servidor local de prueba: sirve web/ y simula la API de Apps Script con el backend real (backend/*.gs).
// Uso:  node dev/server.js   →  http://localhost:8080/puesto/  y  http://localhost:8080/panel/
// Los datos viven en memoria y se pierden al cerrar. Solo para desarrollo.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { crearEntorno } = require('./gas-mock');

const PORT = Number(process.env.PORT || 8080);
const WEB = path.join(__dirname, '..', 'web');
const env = crearEntorno({ adminEmail: 'admin@spartan.test' });

/* ---------- datos de demostración ---------- */
env.run('instalar');
env.run('configurarClientId', 'demo.apps.googleusercontent.com');
const api = (action, body) => {
  const r = env.post(Object.assign({ action: action }, body));
  if (!r.ok) throw new Error(action + ': ' + r.message);
  return r.data;
};
const ses = api('panel.login', { idToken: 'test:admin@spartan.test' }).sesion;
const cBarrio = api('admin.cliente.guardar', { sesion: ses, nombre: 'Barrio Los Álamos', avisos: 'administracion@alamos.test' }).cliente_id;
const oBarrio = api('admin.objetivo.guardar', { sesion: ses, cliente_id: cBarrio, nombre: 'Barrio Los Álamos', tipo: 'country', direccion: 'Ruta 1 km 5' }).objetivo_id;
const pBarrio = api('admin.puesto.guardar', { sesion: ses, objetivo_id: oBarrio, nombre: 'Acceso principal' }).puesto_id;
const cResto = api('admin.cliente.guardar', { sesion: ses, nombre: 'Restaurante La Esquina' }).cliente_id;
const oResto = api('admin.objetivo.guardar', { sesion: ses, cliente_id: cResto, nombre: 'Restaurante La Esquina', tipo: 'control_personal' }).objetivo_id;
const pResto = api('admin.puesto.guardar', { sesion: ses, objetivo_id: oResto, nombre: 'Puerta de personal' }).puesto_id;
api('admin.guardia.guardar', { sesion: ses, cuil: '20123456789', nombre: 'Martín', apellido: 'López', puestos: '*' });
api('admin.usuario.guardar', { sesion: ses, email: 'admin@alamos.test', nombre: 'Administración Los Álamos', rol: 'administracion', clientes: cBarrio });
api('admin.usuario.guardar', { sesion: ses, email: 'supervisor@spartan.test', nombre: 'Supervisor Spartan', rol: 'supervisor', clientes: '*' });
api('panel.estado', { sesion: ses, cliente_id: cBarrio, nro_doc: '28999888', nombre: 'Martín', apellido: 'Díaz', patente: 'AC456BD', estado_nuevo: 'PROHIBIDO', ordenado_tipo: 'Administración', ordenado_nombre: 'Laura Fernández', medio: 'Mail', motivo: 'Incidente con un residente' });
const codigos = {
  barrio: api('admin.dispositivo.codigo', { sesion: ses, puesto_id: pBarrio }).codigo,
  resto: api('admin.dispositivo.codigo', { sesion: ses, puesto_id: pResto }).codigo
};

/* ---------- servidor ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/api') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 60e6) req.destroy(); });
    req.on('end', () => {
      let out;
      try { out = env.ctx.doPost({ postData: { contents: body } }).getContent(); } catch (e) { out = JSON.stringify({ ok: false, error: 'error_interno', message: String(e) }); }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(out);
    });
    return;
  }
  if (url.pathname === '/dev/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ codigos: codigos, cuil: '20123456789', admin: 'admin@spartan.test', mails: env.mails.length }));
    return;
  }
  if (url.pathname === '/config.js') {
    res.writeHead(200, { 'Content-Type': MIME['.js'] });
    res.end("window.SG_CONFIG = { API_URL: '/api', GOOGLE_CLIENT_ID: 'demo.apps.googleusercontent.com', DEV_LOGIN: true };");
    return;
  }
  let p = path.normalize(path.join(WEB, decodeURIComponent(url.pathname)));
  if (!p.startsWith(WEB)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); res.end('No encontrado'); return; }
  let data = fs.readFileSync(p);
  if (p.endsWith('.html')) data = Buffer.from(String(data).replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')); // la CSP real apunta a Google
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(data);
});
if (require.main === module) server.listen(PORT, () => {
  console.log('SG Ingresos (local) en http://localhost:' + PORT);
  console.log('  App Puesto: http://localhost:' + PORT + '/puesto/   código barrio ' + codigos.barrio + ' · restaurante ' + codigos.resto + ' · CUIL 20123456789');
  console.log('  Panel:      http://localhost:' + PORT + '/panel/    ingreso de prueba con admin@spartan.test, admin@alamos.test o supervisor@spartan.test');
});
module.exports = { server, env, codigos };
