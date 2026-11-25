// Cliente de la API SIGI. Con Supabase Auth envía el token y lo renueva solo cuando vence;
// en modo demo envía x-demo-correo.
const BASE = '/api';
const CLAVE = 'sigi_sesion';

export function sesion() {
  try { return JSON.parse(localStorage.getItem(CLAVE)) || null; } catch { return null; }
}
export function guardarSesion(s) {
  try { localStorage.setItem(CLAVE, JSON.stringify(s)); } catch { /* almacenamiento no disponible */ }
}
export function cerrarSesion() {
  try { localStorage.removeItem(CLAVE); } catch { /* sin almacenamiento */ }
}

let renovando = null;
async function renovarToken() {
  const s = sesion();
  if (!s?.refresh_token) return false;
  renovando ??= fetch(`${BASE}/auth/refrescar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  }).then(async (r) => {
    if (!r.ok) return false;
    guardarSesion({ ...sesion(), ...(await r.json()) });
    return true;
  }).catch(() => false).finally(() => { renovando = null; });
  return renovando;
}

function expulsar() {
  cerrarSesion();
  if (!location.pathname.startsWith('/login')) location.assign('/login?vencida=1');
}

/**
 * api('/ruta', { method, body })          -> JSON
 * api('/ruta', { method, formData })      -> multipart (archivos)
 */
export async function api(ruta, { method = 'GET', body, formData } = {}, reintento = true) {
  const s = sesion();
  const headers = {};
  if (s?.token) headers.Authorization = `Bearer ${s.token}`;
  else if (s?.usuario?.correo) headers['x-demo-correo'] = s.usuario.correo;
  if (body !== undefined && !formData) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${BASE}${ruta}`, {
      method, headers, body: formData || (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw Object.assign(new Error('No hay conexión con el servidor de SIGI. Verifique que el backend esté encendido.'), { status: 0 });
  }

  if (res.status === 401 && !ruta.startsWith('/auth/login')) {
    if (reintento && s?.token && (await renovarToken())) return api(ruta, { method, body, formData }, false);
    expulsar();
  }
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(datos.error || datos.advertencia || `Error ${res.status}`), { datos, status: res.status });
  }
  return datos;
}

/**
 * Descarga un archivo generado por la API (por ejemplo, un informe en PDF) con la sesión actual.
 * El nombre sale del encabezado Content-Disposition; si no viene, se usa `nombre`.
 */
export async function descargar(ruta, nombre = 'informe.pdf', reintento = true) {
  const s = sesion();
  const headers = {};
  if (s?.token) headers.Authorization = `Bearer ${s.token}`;
  else if (s?.usuario?.correo) headers['x-demo-correo'] = s.usuario.correo;

  let res;
  try {
    res = await fetch(`${BASE}${ruta}`, { headers });
  } catch {
    throw Object.assign(new Error('No hay conexión con el servidor de SIGI. Verifique que el backend esté encendido.'), { status: 0 });
  }
  if (res.status === 401) {
    if (reintento && s?.token && (await renovarToken())) return descargar(ruta, nombre, false);
    expulsar();
  }
  if (!res.ok) {
    const datos = await res.json().catch(() => ({}));
    throw Object.assign(new Error(datos.error || `Error ${res.status}`), { status: res.status });
  }
  const archivo = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || nombre;
  const url = URL.createObjectURL(await res.blob());
  const enlace = Object.assign(document.createElement('a'), { href: url, download: archivo });
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return archivo;
}

/** Construye un FormData con campos de texto y archivos ({ campo: File | null }). */
export function formulario(campos = {}, archivos = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) if (v !== undefined && v !== null && v !== '') fd.append(k, v);
  for (const [k, v] of Object.entries(archivos)) if (v) fd.append(k, v);
  return fd;
}

/** Abre un soporte del bucket privado en una pestaña nueva (enlace firmado de 10 minutos). */
export async function abrirDocumento(id) {
  const ventana = window.open('', '_blank');
  try {
    const { url } = await api(`/documentos/${id}/url`);
    if (ventana) ventana.location = url; else window.open(url, '_blank');
  } catch (e) {
    ventana?.close();
    throw e;
  }
}
