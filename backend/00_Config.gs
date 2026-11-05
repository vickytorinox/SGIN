/**
 * SG Ingresos — configuración general.
 *
 * Propiedades del script (Configuración del proyecto › Propiedades del script):
 *   MASTER_ID         ID de la planilla maestra (lo crea instalar()).
 *   ROOT_FOLDER_ID    Carpeta raíz privada en Drive (lo crea instalar()).
 *   SECRET_PEPPER     Secreto para hashear tokens y códigos (lo crea instalar()).
 *   GOOGLE_CLIENT_ID  OAuth Client ID para "Iniciar sesión con Google" en Panel/Admin.
 *
 * Nunca se suben al repositorio.
 */

const TZ = 'America/Argentina/Buenos_Aires';

const APP = {
  CODIGO_VIGENCIA_HORAS: 48,      // validez de un código de activación de dispositivo
  SESION_PANEL_SEG: 21600,        // 6 h (máximo de CacheService)
  CACHE_DISPOSITIVO_SEG: 300,     // revocar invalida la caché al instante
  BACKUP_DIAS: 30,
  MAX_ARCHIVO_BYTES: 5 * 1024 * 1024,
  MAX_TEXTO: 500,
  MAX_RESULTADOS_PANEL: 2000,
  RELOJ_TOLERANCIA_MIN: 10,       // si el celular adelanta más que esto, se usa la hora del servidor
  ROLES_PANEL: ['admin', 'supervisor', 'administracion', 'intendencia'],
  ROLES_ESTADO: ['admin', 'supervisor', 'administracion', 'intendencia']
};

const PROP = PropertiesService.getScriptProperties();

function prop_(key) {
  const v = PROP.getProperty(key);
  if (!v) throw apiError_('config_incompleta', 'Falta la propiedad ' + key + '. Ejecutá instalar() desde el editor.');
  return v;
}
