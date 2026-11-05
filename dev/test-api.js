// Pruebas del backend real (backend/*.gs) contra el simulador de Apps Script.  Uso: npm test
const { env, codigos } = require('./server.js');
const P = (a,b)=>env.post(Object.assign({action:a},b));
const ok=(c,m)=>{ if(!c){ console.log('FAIL',m); process.exitCode=1;} else console.log('ok  ',m); };
let r = P('puesto.activar',{codigo:'XXXXX-YYYYY'}); ok(!r.ok && r.error==='codigo_invalido','código inválido rechazado');
r = P('puesto.activar',{codigo:codigos.barrio.toLowerCase()}); ok(r.ok && r.data.token.length>60,'activar barrio');
const tB=r.data.token;
r = P('puesto.activar',{codigo:codigos.barrio}); ok(!r.ok,'código de un solo uso');
r = P('puesto.login',{token:tB,cuil:'20-11111111-1'}); ok(!r.ok && r.error==='cuil_invalido','CUIL no habilitado');
r = P('puesto.login',{token:'x'.repeat(60),cuil:'20123456789'}); ok(!r.ok && r.error==='dispositivo_invalido','token falso');
r = P('puesto.login',{token:tB,cuil:'20123456789'}); ok(r.ok && r.data.config.tipo==='country' && r.data.prohibidos.docs.length===1,'login + bundle con 1 prohibido');
const b=r.data;
const crypto=require('crypto'); ok(b.prohibidos.docs[0]===crypto.createHash('sha256').update(b.salt+'|28999888').digest('hex'),'hash de prohibido coincide con el cliente');
r = P('puesto.buscar',{token:tB,cuil:'20123456789',q:'28.999.888'}); ok(r.ok && r.data.persona.estado==='PROHIBIDO' && r.data.persona.prohibicion.ordenado_tipo==='Administración','buscar prohibido con detalle');
const img='/9j/4AAQSkZJRgABAQ=='; // bytes cualquiera
const mov={reg_id:'reg-0001-abcdef',categoria:'empleado',sentido:'INGRESO',cargado_en:new Date().toISOString(),lat:-31.63,lng:-60.7,
 persona:{tipo_doc:'DNI',nro_doc:'30111222',nombre:'Juan',apellido:'Pérez',estado:'AUTORIZADO'},
 campos:{subtipo:'Jardinería',patente:'ab123cd',motivo:'=cmd()',telefono:'3415551234'},
 autoriza:{tipo:'Residente',lote:'42',apellido:'Gómez'}, acompanantes:[{nro_doc:'40111222',nombre:'Ana',apellido:'Sosa'}],
 docs:[{tipo:'seguro_vida',medio:'foto',archivo:{b64:img,mime:'image/jpeg'}},{tipo:'seguro_auto',medio:'whatsapp',archivo:{b64:img,mime:'image/jpeg'}}]};
r = P('puesto.registrar',{token:tB,cuil:'20123456789',mov}); ok(r.ok && r.data.mov_id,'registrar ingreso con docs y acompañante');
r = P('puesto.registrar',{token:tB,cuil:'20123456789',mov}); ok(r.ok && r.data.duplicado,'reenvío idempotente (reg_id)');
r = P('puesto.buscar',{token:tB,cuil:'20123456789',q:'30111222'}); ok(r.ok && r.data.persona.docs.length===2 && r.data.persona.ultimo.autoriza_lote==='42','ficha recuperada con docs y último ingreso');
ok(r.data.persona.docs.find(d=>d.tipo==='seguro_auto').estado==='whatsapp','doc WhatsApp queda como captura pendiente');
r = P('puesto.buscar',{token:tB,cuil:'20123456789',q:'AB123CD'}); ok(r.ok && r.data.persona && r.data.persona.nro_doc==='30111222','buscar por patente');
r = P('puesto.buscar',{token:tB,cuil:'20123456789',q:'perez juan'}); ok(r.ok && r.data.persona,'buscar por nombre sin tildes');
r = P('puesto.adentro',{token:tB,cuil:'20123456789'}); ok(r.ok && r.data.adentro.length===1,'adentro ahora (acompañante agrupado)');
r = P('puesto.salida',{token:tB,cuil:'20123456789',ref_reg_id:'reg-0001-abcdef',salida_en:new Date().toISOString()}); ok(r.ok,'salida');
r = P('puesto.adentro',{token:tB,cuil:'20123456789'}); ok(r.ok && r.data.adentro.length===0,'adentro vacío tras salida');
r = P('puesto.salida',{token:tB,cuil:'20123456789',ref_reg_id:'no-existe-1234'}); ok(!r.ok && r.error==='reintentar','salida de ingreso aún no sincronizado → reintentar');
// prohibido sin excepción (llegó desde la cola offline) → se guarda con alerta y avisa
const nMails=env.mails.length;
r = P('puesto.registrar',{token:tB,cuil:'20123456789',mov:{reg_id:'reg-0002-abcdef',categoria:'visita',sentido:'INGRESO',cargado_en:new Date().toISOString(),persona:{nro_doc:'28999888',nombre:'Martín',apellido:'Díaz'},campos:{},autoriza:{tipo:'Administración'}}});
ok(r.ok && r.data.alertas.indexOf('prohibido_sin_excepcion')>=0 && env.mails.length===nMails+1,'prohibido sin excepción: guardado con alerta + mail');
r = P('puesto.registrar',{token:tB,cuil:'20123456789',mov:{reg_id:'reg-0003-abcdef',categoria:'visita',sentido:'INGRESO',cargado_en:new Date(Date.now()+3600e3).toISOString(),persona:{nro_doc:'28999888',nombre:'Martín',apellido:'Díaz'},campos:{},autoriza:{tipo:'Administración'},excepcional:{autoriza_tipo:'Intendencia',nombre:'Pedro',medio:'Llamada',motivo:'Retira pertenencias'}}});
ok(r.ok && r.data.alertas.indexOf('reloj_dispositivo')>=0 && r.data.alertas.indexOf('prohibido_sin_excepcion')<0,'excepcional + reloj adelantado detectado');
// control de personal con cacheo
r = P('puesto.activar',{codigo:codigos.resto}); const tR=r.data.token;
r = P('puesto.login',{token:tR,cuil:'20123456789'}); ok(r.ok && r.data.config.tipo==='control_personal' && r.data.prohibidos.docs.length===0,'restaurante: bundle aislado del barrio');
r = P('puesto.registrar',{token:tR,cuil:'20123456789',mov:{reg_id:'reg-0004-abcdef',categoria:'personal',sentido:'EGRESO',cargado_en:new Date().toISOString(),persona:{nro_doc:'35444555',nombre:'Ana',apellido:'Ruiz'},campos:{observaciones:'ok'},cacheo:{foto:{b64:img,mime:'image/jpeg'},resultado:'Sin novedad'}}});
ok(r.ok && r.data.alertas.length===0,'egreso con cacheo');
const fname=Object.values(env.files).map(f=>f.name).find(n=>/_35444555_cacheo\.jpg$/.test(n)); ok(/^\d{2}-\d{2}-\d{4}_\d{4}_35444555_cacheo\.jpg$/.test(fname||''),'nombre de foto DD-MM-AAAA_HHMM_DNI_cacheo.jpg ('+fname+')');
r = P('puesto.registrar',{token:tR,cuil:'20123456789',mov:{reg_id:'reg-0005-abcdef',categoria:'personal',sentido:'EGRESO',cargado_en:new Date().toISOString(),persona:{nro_doc:'35444555',nombre:'Ana',apellido:'Ruiz'},campos:{}}});
ok(r.ok && r.data.alertas.indexOf('cacheo_sin_foto')>=0,'egreso sin foto queda marcado');
r = P('puesto.registrar',{token:tR,cuil:'20123456789',mov:{reg_id:'reg-0006-abcdef',categoria:'mercaderia',sentido:'INGRESO',cargado_en:new Date().toISOString(),campos:{proveedor:'Distribuidora Sur',chofer_dni:'28999888',chofer_nombre:'X'}}});
ok(r.ok,'mercadería (sin ficha de persona)');
// panel
const sA=P('panel.login',{idToken:'test:admin@alamos.test'}).data.sesion;
r=P('panel.me',{sesion:sA}); ok(r.ok && r.data.clientes.length===1,'administración ve solo su cliente');
const cB=r.data.clientes[0].cliente_id;
r=P('panel.movimientos',{sesion:sA,cliente_id:cB}); ok(r.ok && r.data.metricas.total===4 && r.data.rows[0].vigilador==='Martín López','movimientos + vigilador por CUIL ('+r.data.metricas.total+')');
const row=r.data.rows.find(x=>x.motivo); ok(row && row.motivo==='=cmd()','texto con = guardado como texto (sin fórmula)');
r=P('panel.movimientos',{sesion:sA,cliente_id:cB,dni:'30.111'}); ok(r.ok && r.data.metricas.total===1,'filtro DNI con puntos');
r=P('panel.movimientos',{sesion:sA,cliente_id:cB,nombre:'diaz martin'}); ok(r.ok && r.data.metricas.total===2,'filtro nombre en cualquier orden y sin tildes');
const otros=P('panel.me',{sesion:P('panel.login',{idToken:'test:admin@spartan.test'}).data.sesion}).data.clientes.find(c=>c.nombre.startsWith('Restaurante'));
r=P('panel.movimientos',{sesion:sA,cliente_id:otros.cliente_id}); ok(!r.ok && r.error==='sin_permiso','administración no ve otro cliente');
r=P('admin.estructura',{sesion:sA}); ok(!r.ok && r.error==='sin_permiso','administración no entra a Admin');
const sAd=P('panel.login',{idToken:'test:admin@spartan.test'}).data.sesion;
r=P('panel.movimientos',{sesion:sAd,cliente_id:otros.cliente_id}); ok(r.ok && r.data.metricas.egresos===2 && r.data.metricas.egresos_con_foto===50,'métrica egresos con foto = 50%');
r=P('panel.foto',{sesion:sAd,cliente_id:otros.cliente_id,archivo_id:r.data.rows.find(x=>x.foto_cacheo).foto_cacheo}); ok(r.ok && r.data.b64,'ver foto de cacheo');
const fotoBarrio=Object.values(env.files).find(f=>/seguro_vida/.test(f.name)).id;
r=P('panel.foto',{sesion:sAd,cliente_id:otros.cliente_id,archivo_id:fotoBarrio}); ok(!r.ok && r.error==='sin_permiso','no se puede ver un archivo de otro cliente');
r=P('panel.login',{idToken:'test:intruso@gmail.com'}); ok(!r.ok && r.error==='no_autorizado','cuenta Google no autorizada');
r=P('panel.persona',{sesion:sA,cliente_id:cB,persona_id:P('panel.personas',{sesion:sA,cliente_id:cB,q:'28999888'}).data.personas[0].persona_id}); ok(r.ok && r.data.persona.historial.length===1,'historial de estados');
r=P('panel.estado',{sesion:sA,cliente_id:cB,nro_doc:'28999888',estado_nuevo:'AUTORIZADO',ordenado_tipo:'Residente'}); ok(!r.ok && r.error==='orden_invalida','residente exige nombre y lote');
r=P('panel.estado',{sesion:sA,cliente_id:cB,nro_doc:'28999888',estado_nuevo:'AUTORIZADO',medio:'Mail',motivo:'Acuerdo'}); ok(r.ok,'administración levanta prohibición');
r=P('puesto.sync',{token:tB,cuil:'20123456789'}); ok(r.ok && r.data.prohibidos.docs.length===0,'sync del puesto ya sin prohibidos');
// config
r=P('admin.objetivo.config',{sesion:sAd,objetivo_id:otros.objetivos[0].objetivo_id}); const cfg=r.data.config;
cfg.categorias[0].campos.push({key:'locker',label:'N° de locker',tipo:'numero',extra:true,visible:true,obligatorio:true}); cfg.modulos.cacheo.aleatorio_cada=5;
r=P('admin.objetivo.config',{sesion:sAd,objetivo_id:otros.objetivos[0].objetivo_id,config:cfg}); ok(r.ok && r.data.config.categorias[0].campos.some(f=>f.key==='x_locker') && r.data.config.modulos.cacheo.aleatorio_cada===5,'config: campo extra + cacheo aleatorio');

// orden y eliminación de campos
{
  const oid = otros.objetivos[0].objetivo_id;
  const c1 = P('admin.objetivo.config',{sesion:sAd,objetivo_id:oid}).data.config;
  const merc = c1.categorias.find(c=>c.key==='mercaderia');
  merc.campos.reverse();
  merc.campos.push({key:'temp',label:'Temperatura',tipo:'numero',extra:true,visible:true,obligatorio:false});
  let r2 = P('admin.objetivo.config',{sesion:sAd,objetivo_id:oid,config:c1});
  const m2 = r2.data.config.categorias.find(c=>c.key==='mercaderia');
  ok(m2.campos[0].key==='foto_remito' && m2.campos[m2.campos.length-1].key==='x_temp','config: se respeta el orden elegido');
  m2.campos = m2.campos.filter(f=>f.key!=='x_temp');
  m2.campos.splice(0,1); // intentar borrar un campo de plantilla
  r2 = P('admin.objetivo.config',{sesion:sAd,objetivo_id:oid,config:r2.data.config});
  const m3 = r2.data.config.categorias.find(c=>c.key==='mercaderia');
  ok(!m3.campos.some(f=>f.key==='x_temp') && m3.campos.some(f=>f.key==='foto_remito'),'config: extra eliminado; campo de plantilla no se puede borrar');
}
// revocar
const est=P('admin.estructura',{sesion:sAd}).data; const dev=est.dispositivos.find(d=>d.estado==='activo');
r=P('admin.dispositivo.revocar',{sesion:sAd,dispositivo_id:dev.dispositivo_id}); ok(r.ok,'revocar dispositivo');
const t = dev.puesto_id===est.puestos.find(p=>p.nombre==='Acceso principal').puesto_id ? tB : tR;
r=P('puesto.sync',{token:t,cuil:'20123456789'}); ok(!r.ok && r.error==='dispositivo_invalido','dispositivo revocado deja de funcionar al instante');
env.run('backupDiario'); ok(Object.values(env.files).filter(f=>/· \d{4}-\d{2}-\d{2}$/.test(f.name)).length===3,'backup diario: maestra + 2 clientes');

if (process.exitCode) console.log('\nHAY FALLAS'); else console.log('\nTodas las pruebas pasaron.');
