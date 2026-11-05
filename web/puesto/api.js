// Cliente de la API de Apps Script. POST text/plain (sin preflight CORS); el token va en el cuerpo, nunca en la URL.
export async function api(action, payload, timeoutMs = 45000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(window.SG_CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action }, payload || {})),
      redirect: 'follow',
      cache: 'no-store',
      signal: ctrl.signal
    });
  } catch (e) {
    throw Object.assign(new Error('Sin conexión con el servidor.'), { code: 'red' });
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) throw Object.assign(new Error('Sin conexión con el servidor.'), { code: 'red' });
  let j;
  try { j = await res.json(); } catch (e) { throw Object.assign(new Error('Respuesta inválida del servidor.'), { code: 'red' }); }
  if (!j.ok) throw Object.assign(new Error(j.message || j.error), { code: j.error });
  return j.data;
}
