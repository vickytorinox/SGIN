# Seguridad de SG Ingresos

## Modelo

La API de Apps Script se publica para "cualquier persona" porque la App Puesto es una PWA servida desde GitHub Pages. Por eso **ninguna acción confía en quién dice ser el que llama**: cada pedido se valida en el servidor.

| Quién | Cómo se identifica | Qué se verifica en cada llamada |
| --- | --- | --- |
| Celular del puesto | Token de 96 caracteres, obtenido canjeando un código de un solo uso (vence a las 48 h) | Hash del token en `Dispositivos`, estado activo, puesto, objetivo y cliente activos. El objetivo y el cliente **se deducen del token**, nunca de la URL. |
| Vigilador | CUIL (11 dígitos), sobre el token del dispositivo | Vigilador activo y habilitado en ese puesto u objetivo |
| Panel y Admin | "Iniciar sesión con Google": el backend verifica el ID token con Google (audiencia, emisor, mail verificado, vencimiento) | Mail en `UsuariosPanel`, rol y clientes asignados. La sesión dura 6 h y se guarda en caché con hash. |

## Datos

- Planillas y carpetas pertenecen a la cuenta dueña y **no se comparten**. Ningún archivo se publica con "cualquiera con el enlace". Las fotos se sirven a través del backend, verificando que el archivo esté dentro de la carpeta del cliente del usuario.
- **Un cliente, una planilla y una carpeta.** Los datos de distintos clientes nunca se mezclan.
- Tokens, códigos y sesiones se guardan con hash SHA-256 y un secreto del script (`SECRET_PEPPER`).
- En el celular, la lista de prohibidos se guarda solo como hash de DNI y patente, con un salt por objetivo. La cola de envíos se borra registro por registro apenas el servidor confirma.

## Integridad y trazabilidad

- **Idempotencia:** cada registro lleva un `reg_id` generado en el celular. Si llega dos veces (reintento tras un corte), el segundo se descarta. Las escrituras usan `LockService`.
- **Inyección de fórmulas:** todo texto que empiece con `= + - @` se guarda como texto.
- **XSS:** el frontend inserta los datos siempre como texto (`textContent`), nunca como HTML. CSP restrictiva en las páginas.
- **Fecha y hora:** se guarda la del celular (`cargado_en`) y la del servidor (`recibido_en`). Si el celular adelanta más de 10 minutos, se usa la del servidor y se marca la alerta `reloj_dispositivo`.
- **Auditoría:** `AuditoriaGlobal` en la maestra y `Auditoria` en cada cliente, solo agregado y con hojas protegidas. Registra altas, cambios, logins, logins rechazados, consultas de prohibidos, ingresos excepcionales, vistas de archivos y backups.
- **Prohibidos:** el puesto no puede aplicar ni levantar una prohibición. Si llega un ingreso de un prohibido sin excepción (por ejemplo, cargado sin señal con la lista vieja), se guarda igual con la alerta `prohibido_sin_excepcion` y se avisa por mail. Nunca se pierde el registro de lo que pasó.
- **Fuerza bruta:** límite de intentos por minuto en activación, CUIL y login.

## Celular del puesto

- Debe tener bloqueo de pantalla.
- Si se pierde, se revoca desde Admin y deja de funcionar al instante.
- La sesión del vigilador se bloquea tras 10 minutos sin uso y pide el CUIL de nuevo. La sesión de Google, que ya no hace falta en el celular, no interviene.
- No borrar los datos del navegador ni desinstalar la app con registros pendientes. La app lo indica en rojo si hay registros con más de 2 h sin enviar.

## Legal (a validar antes de producción)

- Ley 25.326 de Protección de Datos Personales: aviso informativo en el acceso, inscripción de la base ante la AAIP y plazos de conservación.
- Cacheo de personal (art. 70 de la LCT): control discreto, conocido por el personal, y foto del bolso, nunca de la persona.
