// Cliente de la API SIGI. En modo demo envía x-demo-correo; con Supabase Auth, el Bearer token.
const BASE = '/api';

export function sesion() {
  try { return JSON.parse(localStorage.getItem('sigi_sesion')) || null; } catch { return null; }
}
export function guardarSesion(s) { localStorage.setItem('sigi_sesion', JSON.stringify(s)); }
export function cerrarSesion() { localStorage.removeItem('sigi_sesion'); }

export async function api(ruta, { method = 'GET', body, formData } = {}) {
  const s = sesion();
  const headers = {};
  if (s?.token) headers.Authorization = `Bearer ${s.token}`;
  else if (s?.usuario?.correo) headers['x-demo-correo'] = s.usuario.correo;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${ruta}`, {
    method,
    headers,
    body: formData || (body ? JSON.stringify(body) : undefined),
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(datos.error || datos.advertencia || `Error ${res.status}`);
    e.datos = datos;
    e.status = res.status;
    throw e;
  }
  return datos;
}
