import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { sesion, cerrarSesion } from '../api.js';

// Menú por rol (actores de la sección 2)
const MENU = [
  { ruta: '/', texto: 'Monitoreo', roles: ['AUXILIAR', 'ADMIN'] },
  { ruta: '/recepcion', texto: 'Reporte y recepción', roles: ['COLABORADOR', 'LIDER', 'RECEPCIONISTA', 'AUXILIAR', 'ADMIN'] },
  { ruta: '/verificacion', texto: 'Verificación', roles: ['AUXILIAR', 'ADMIN'] },
  { ruta: '/transcripcion', texto: 'Transcripción y radicación', roles: ['AUXILIAR', 'ADMIN'] },
  { ruta: '/cobro', texto: 'Cobro', roles: ['AUXILIAR', 'CONTABILIDAD', 'ADMIN'] },
  { ruta: '/juridico', texto: 'Cobro jurídico', roles: ['JURIDICA', 'AUXILIAR', 'ADMIN'] },
  { ruta: '/conciliacion', texto: 'Conciliación', roles: ['CONTABILIDAD', 'AUXILIAR', 'ADMIN'] },
  { ruta: '/archivo', texto: 'Archivo', roles: ['AUXILIAR', 'GESTION_DOCUMENTAL', 'ADMIN'] },
];

export default function Layout() {
  const nav = useNavigate();
  const s = sesion();
  const rol = s?.usuario?.rol || 'COLABORADOR';
  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>SIGI</h1>
        <p className="rol">{s?.usuario?.nombre}<br />{rol}</p>
        <nav>
          {MENU.filter((m) => m.roles.includes(rol)).map((m) => (
            <NavLink key={m.ruta} to={m.ruta} end={m.ruta === '/'}
              className={({ isActive }) => (isActive ? 'activo' : '')}>
              {m.texto}
            </NavLink>
          ))}
        </nav>
        <button className="salir" onClick={() => { cerrarSesion(); nav('/login'); }}>
          Cerrar sesión
        </button>
      </aside>
      <main className="contenido"><Outlet /></main>
    </div>
  );
}
