// Helpers de interfaz. Todo el texto se inserta como texto (nunca innerHTML con datos), para evitar XSS.

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  kids.flat(Infinity).forEach(c => {
    if (c === null || c === undefined || c === false) return;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  });
  Object.entries(attrs || {}).forEach(([k, v]) => {
    if (v === false || v === null || v === undefined) return;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  });
  return el;
}

const ICONS = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  shield: '<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  chevron: '<path d="M9 18l6-6-6-6"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 2A3 3 0 0 0 7 18z"/>'
};

export function icon(name, size = 20) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name] || '';
  return s;
}

export function chips(opciones, actual, onPick, extraClass) {
  return h('div', { class: 'chips' }, opciones.map(o => {
    const val = typeof o === 'object' ? o.value : o;
    const label = typeof o === 'object' ? o.label : o;
    return h('button', { type: 'button', class: 'chip' + (val === actual ? ' on' : '') + (extraClass ? ' ' + extraClass : ''), 'aria-pressed': val === actual ? 'true' : 'false', onclick: () => onPick(val) }, label);
  }));
}

export function labeled(labelText, control, req) {
  const id = control.id || ('f' + Math.random().toString(36).slice(2, 9));
  control.id = id;
  return h('div', { class: 'field' }, h('label', { class: 'lbl', for: id }, labelText, req ? h('span', { class: 'req' }, ' *') : null), control);
}

export function badge(text, kind) {
  return h('span', { class: 'st ' + (kind || '') }, text);
}

/** Botón que abre la cámara (o el selector) y devuelve la imagen comprimida. */
export function fotoBoton(label, hecho, onFile, opts) {
  const o = opts || {};
  const input = h('input', { type: 'file', accept: o.accept || 'image/*', capture: o.capture === false ? false : 'environment', style: 'display:none' });
  input.addEventListener('change', async () => {
    const f = input.files && input.files[0];
    if (!f) return;
    try { onFile(await comprimir(f)); } catch (e) { alert(e.message || 'No se pudo leer el archivo.'); }
    input.value = '';
  });
  return h('label', { class: 'photo' + (hecho ? ' done' : '') }, input, icon(o.icono || 'camera', 18), hecho ? (o.hechoLabel || 'Cargada ✓ · repetir') : label);
}

/** Comprime imágenes a JPEG (máx. 1280 px). Los PDF pasan tal cual (máx. 4,5 MB). */
export async function comprimir(file) {
  if (file.type === 'application/pdf') {
    if (file.size > 4.5 * 1024 * 1024) throw new Error('El PDF supera 4,5 MB.');
    return file;
  }
  if (!/^image\//.test(file.type)) throw new Error('Formato no permitido.');
  const bmp = await createImageBitmap(file);
  const max = 1280;
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.72));
  return blob || file;
}

export function blobToB64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ b64: String(r.result).split(',')[1], mime: blob.type || 'image/jpeg' });
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function toast(msg, kind) {
  const t = h('div', { class: 'toast ' + (kind || ''), role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3800);
}

/** Reemplaza el contenido de un elemento ignorando null/false (evita que aparezca el texto "null"). */
export function setKids(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter(k => k !== null && k !== undefined && k !== false && k !== ''));
}
