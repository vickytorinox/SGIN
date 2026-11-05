# SG Ingresos

Plataforma multicliente de Spartan S.A. / SG Seguridad para registrar ingresos y egresos en los objetivos custodiados: countries y barrios, control de personal (restaurantes, locales, plantas) y los tipos que se sumen después.

- **App Puesto** (`web/puesto/`): PWA para el celular del puesto. Funciona **sin conexión**: abre sin señal, guarda los registros en el celular y los envía solos cuando vuelve la señal.
- **Panel** (`web/panel/`): consulta para Administración, Intendencia y supervisores Spartan, más las secciones de **Admin Spartan** (clientes, objetivos, puestos, vigiladores, usuarios, formulario por objetivo y auditoría).
- **Backend** (`backend/`): API en Google Apps Script. Toda la información queda tabulada en Google Sheets, y los archivos en Drive, siempre privados.

La especificación funcional completa está en el documento "SG Ingresos — Especificación funcional y técnica v1".

## Estructura

```
backend/            Apps Script (se publica con clasp)
  00_Config.gs        constantes y propiedades del script
  01_Db.gs            esquema de planillas, lectura y escritura, anti inyección de fórmulas
  02_Auth.gs          tokens de dispositivo, CUIL, login con Google, límites de intentos
  03_Plantillas.gs    tipos de objetivo (country, control_personal) y validación de la config
  04_Auditoria_Archivos.gs  auditoría de solo agregado y archivos privados en Drive
  05_Puesto.gs        API de la App Puesto (registrar idempotente, salidas, adentro, búsqueda)
  06_Panel.gs         API del panel (movimientos, métricas, fotos, prohibidos)
  07_Admin.gs         API de Admin Spartan
  08_Main.gs          router doPost / doGet
  09_Setup_Backup.gs  instalar(), configurarClientId(), backupDiario()
web/                GitHub Pages
  config.js           URL de la API y Client ID de Google (públicos, sin secretos)
  puesto/             App Puesto: app.js, store.js (IndexedDB), api.js, ui.js, sw.js, manifest.json
  panel/              Panel y Admin Spartan
dev/                simulador local de Apps Script, servidor de prueba y pruebas
.github/workflows/  publicación automática de backend y web
```

## Probar en la compu, sin Google

Requiere Node 18 o más.

```bash
npm run dev     # http://localhost:8080/puesto/  y  http://localhost:8080/panel/
npm test        # 40+ pruebas del backend real contra el simulador
```

El servidor local carga datos de ejemplo (un barrio, un restaurante, un vigilador con CUIL 20123456789 y una persona prohibida con DNI 28999888). Al arrancar muestra los códigos de activación de los dos puestos. El panel local tiene un "Ingreso de prueba" que solo existe en el simulador: el backend real lo rechaza.

## Puesta en marcha

Se hace una sola vez y lleva una hora, aproximadamente.

### 1. Cuenta dueña

Usar una cuenta de Google exclusiva del sistema, por ejemplo `sistemas@sgseguridad.com`. Esa cuenta es dueña del script, de las planillas y de las carpetas. No se comparte con nadie.

### 2. Proyecto de Apps Script

1. Con la cuenta dueña, entrar a <https://script.google.com> y crear un proyecto llamado "SG Ingresos API".
2. En Configuración del proyecto, activar "Mostrar el archivo de manifiesto appsscript.json" y copiar el **ID de la secuencia de comandos**.
3. En la compu, instalar clasp y subir el código:
   ```bash
   npm install -g @google/clasp
   clasp login                       # con la cuenta dueña
   echo '{"scriptId":"ID_COPIADO","rootDir":"backend"}' > .clasp.json
   clasp push --force
   ```
4. En el editor, ejecutar la función `instalar` y aceptar los permisos. Crea la planilla maestra, la carpeta privada en Drive, el secreto interno, el backup diario y te da de alta como Admin Spartan.

### 3. Iniciar sesión con Google (Panel)

1. En <https://console.cloud.google.com>, con la cuenta dueña: APIs y servicios › Pantalla de consentimiento (tipo Externo, solo nombre y mail de soporte) › Credenciales › Crear ID de cliente OAuth › Aplicación web.
2. En "Orígenes autorizados de JavaScript", cargar el dominio donde va a vivir la web, por ejemplo `https://ingresos.sgseguridad.com` (y `https://<usuario>.github.io` si se usa ese).
3. Copiar el Client ID. En el editor de Apps Script ejecutar `configurarClientId("xxxx.apps.googleusercontent.com")`. Se puede crear una función temporal que lo llame y después borrarla.

### 4. Publicar la API

En el editor: Implementar › Nueva implementación › Aplicación web.

- **Ejecutar como:** yo (la cuenta dueña).
- **Quién tiene acceso:** cualquier persona.

Es necesario para que la PWA funcione desde GitHub Pages. La seguridad la hace el código en cada llamada (ver `docs/seguridad.md`).

Copiar la URL que termina en `/exec` y el **ID de implementación**.

### 5. Configurar y publicar la web

1. En `web/config.js`, poner `API_URL` (la URL `/exec`) y `GOOGLE_CLIENT_ID`.
2. En GitHub: Settings › Pages › Source: **GitHub Actions**. Cada cambio en `web/` se publica solo.
3. Dominio propio (recomendado): en Settings › Pages cargar `ingresos.sgseguridad.com`, y en el DNS de sgseguridad.com crear un CNAME `ingresos` hacia `<usuario>.github.io`. Activar "Enforce HTTPS".

> GitHub Pages desde un repositorio **privado** requiere un plan pago de GitHub (Pro o Team). La alternativa es que este repo sea público: no contiene secretos, y la seguridad no depende de esconder el código.

### 6. Publicación automática del backend (opcional, recomendado)

En Settings › Secrets and variables › Actions, crear:

| Secreto | Valor |
| --- | --- |
| `CLASPRC_JSON` | contenido de `~/.clasprc.json` después de `clasp login` |
| `SCRIPT_ID` | ID de la secuencia de comandos |
| `DEPLOYMENT_ID` | ID de implementación del paso 4 (así la URL `/exec` nunca cambia) |

Cada cambio en `backend/` corre las pruebas y, si pasan, publica.

### 7. Primer cliente

En el Panel, con tu cuenta de Admin Spartan:

1. **Clientes y puestos** › Nuevo cliente. Se crea su planilla y su carpeta privada.
2. **+ Objetivo**: elegir el tipo (Country o Control de personal).
3. **+ Puesto**, y después **Activar celular**: muestra un código de un solo uso, válido 48 h.
4. **Vigiladores**: alta con CUIL y puestos habilitados.
5. **Usuarios del panel**: Administración e Intendencia del cliente (pueden ser Gmail personales), y supervisores.
6. **Formulario por objetivo**: ajustar campos visibles y obligatorios, documentos, cacheo y etiquetas.
7. En el celular del puesto: abrir `https://ingresos.sgseguridad.com/puesto/`, cargar el código, ingresar con CUIL y "Agregar a la pantalla de inicio".

## Mantenimiento

- **Al cambiar cualquier archivo de `web/puesto/`, subir la versión de la caché en `web/puesto/sw.js`** (`sg-puesto-v1` → `v2`). Si no, los celulares siguen con la versión vieja.
- Los cambios de configuración de un objetivo llegan a los puestos en un máximo de 10 minutos. Las prohibiciones, en la próxima sincronización.
- Backup: todos los días a las 3 AM se copia cada planilla. Se conservan 30 días, en la carpeta `Backups` de cada cliente.
- Si se pierde o roban un celular: Panel › Clientes y puestos › **Revocar**. Deja de funcionar al instante.

## Pendientes conocidos

- Carga de Residentes y lotes desde el Panel. Hoy se cargan en la hoja `Residentes` de la planilla del cliente y el puesto las usa para autocompletar.
- Alcance de una prohibición cuando un cliente tiene varios objetivos. Hoy aplica a todo el cliente.
- Plazos de conservación y validación legal (Ley 25.326, AAIP) antes de producción.
- Verde exacto de SG APP (variable `--sg` en los CSS) y logo.
- Con muchos años de datos conviene archivar `Movimientos` por año. Las búsquedas del panel leen la hoja completa.
