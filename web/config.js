// Configuración pública del frontend (no contiene secretos).
// API_URL: URL /exec de la implementación de Apps Script.
// GOOGLE_CLIENT_ID: OAuth Client ID para "Iniciar sesión con Google" (Panel/Admin).
window.SG_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbzIFlno8pCjuZKQ_EbM9dxrGSyWQx45sYI3uWZ-y7sCo786XLPWTIVh43M9mKx2-xBr3Q/exec',
  GOOGLE_CLIENT_ID: '162725808278-2b9g9ujpao1lqrrejsn6f66uih8apiho.apps.googleusercontent.com'
};

// Las páginas no se abren dentro de un marco de otro sitio (evita clickjacking;
// GitHub Pages no permite enviar la cabecera frame-ancestors).
if (window.top !== window.self) {
  document.documentElement.style.display = 'none';
  try { window.top.location.replace(window.location.href); } catch (e) {}
}
