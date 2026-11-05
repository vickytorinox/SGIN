/**
 * Instalación y respaldo.
 * Ejecutar instalar() UNA vez desde el editor de Apps Script con la cuenta dueña (por ejemplo sistemas@sgseguridad.com).
 */

function instalar() {
  const email = (Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (!PROP.getProperty('SECRET_PEPPER')) PROP.setProperty('SECRET_PEPPER', tokenAleatorio_());
  if (!PROP.getProperty('ROOT_FOLDER_ID')) {
    const f = DriveApp.createFolder('SG Ingresos (privado, no compartir)');
    f.createFolder('Backups maestra');
    PROP.setProperty('ROOT_FOLDER_ID', f.getId());
  }
  if (!PROP.getProperty('MASTER_ID')) {
    const ss = SpreadsheetApp.create('SG Ingresos · Maestra');
    DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(PROP.getProperty('ROOT_FOLDER_ID')));
    PROP.setProperty('MASTER_ID', ss.getId());
    ensureSchema_(ss, MASTER_SCHEMA);
    protegerHoja_(ss.getSheetByName('AuditoriaGlobal'));
  } else {
    ensureSchema_(master_(), MASTER_SCHEMA);
  }
  const sh = msheet_('UsuariosPanel');
  if (email && !findBy_(sh, 'email', email).length) {
    append_(sh, { usuario_id: uid_(), email: email, nombre: 'Admin Spartan', rol: 'admin', clientes: '*', activo: true, creado_en: now_(), creado_por: 'instalar' });
  }
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'backupDiario').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('backupDiario').timeBased().everyDays(1).atHour(3).create();
  Logger.log('Instalación lista. Admin: ' + email + '. Falta configurarClientId("<tu OAuth client id>").');
}

/** Guarda el OAuth Client ID usado por "Iniciar sesión con Google". */
function configurarClientId(clientId) {
  if (!/\.apps\.googleusercontent\.com$/.test(String(clientId))) throw new Error('Client ID inválido.');
  PROP.setProperty('GOOGLE_CLIENT_ID', clientId);
  Logger.log('GOOGLE_CLIENT_ID configurado.');
}

/** Respaldo diario: copia la maestra y cada planilla de cliente; conserva APP.BACKUP_DIAS días. */
function backupDiario() {
  const hoy = fecha_(now_(), 'yyyy-MM-dd');
  const limite = Date.now() - APP.BACKUP_DIAS * 86400000;
  const root = DriveApp.getFolderById(prop_('ROOT_FOLDER_ID'));
  const copiar = (fileId, carpeta, nombre) => {
    DriveApp.getFileById(fileId).makeCopy(nombre + ' · ' + hoy, carpeta);
    const it = carpeta.getFiles();
    while (it.hasNext()) {
      const f = it.next();
      if (f.getDateCreated().getTime() < limite) f.setTrashed(true);
    }
  };
  try { copiar(prop_('MASTER_ID'), subcarpeta_(root, 'Backups maestra'), 'Maestra'); } catch (e) { console.error('backup maestra', e); }
  readAll_(msheet_('Clientes')).filter(c => activo_(c.activo)).forEach(c => {
    try { copiar(c.planilla_id, DriveApp.getFolderById(c.backup_carpeta_id), c.nombre); } catch (e) { console.error('backup ' + c.nombre, e); }
  });
  auditGlobal_('sistema', 'backup', 'Drive', '', '', hoy);
}
