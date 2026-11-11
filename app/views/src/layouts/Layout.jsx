import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Activity, Archive, ArrowLeftRight, FileCheck2, FileInput, Gavel, LogOut, Stamp, Wallet } from 'lucide-react';
import { sesion, cerrarSesion } from '../api.js';
import { ROLES, iniciales, useIA } from '../ui.jsx';

// Menú por rol (actores de la sección 2)
const MENU = [
  { ruta: '/', texto: 'Monitoreo', icono: Activity, roles: ['AUXILIAR', 'ADMIN'] },
  { ruta: '/recepcion', texto: 'Reporte y recepción', icono: FileInput, roles: ['COLABORADOR', 'LIDER', 'RECEPCIONISTA', 'AUXILIAR', 'ADMIN'] },
  { ruta: '/verificacion', texto: 'Verificación', icono: FileCheck2, roles: ['AUXILIAR', 'ADMIN'] },
  { ruta: '/transcripcion', texto: 'Transcripción y radicación', icono: Stamp, roles: ['AUXILIAR', 'ADMIN'] },
  { ruta: '/cobro', texto: 'Cobro', icono: Wallet, roles: ['AUXILIAR', 'CONTABILIDAD', 'ADMIN'] },
  { ruta: '/juridico', texto: 'Cobro jurídico', icono: Gavel, roles: ['JURIDICA', 'AUXILIAR', 'ADMIN'] },
  { ruta: '/conciliacion', texto: 'Conciliación', icono: ArrowLeftRight, roles: ['CONTABILIDAD', 'AUXILIAR', 'ADMIN'] },
  { ruta: '/archivo', texto: 'Archivo', icono: Archive, roles: ['AUXILIAR', 'GESTION_DOCUMENTAL', 'ADMIN'] },
];

export function Marca() {
  return (
    <div className="marca">
      <span className="marca-sello" aria-hidden="true">SG</span>
      <span className="marca-texto"><b>SIGI</b><span>Gestión de incapacidades</span></span>
    </div>
  );
}

export default function Layout() {
  const nav = useNavigate();
  const s = sesion();
  const rol = s?.usuario?.rol || 'COLABORADOR';
  const ia = useIA();
  return (
    <div className="layout">
      <aside className="sidebar">
        <Marca />
        <nav className="nav" aria-label="Módulos">
          {MENU.filter((m) => m.roles.includes(rol)).map(({ ruta, texto, icono: Icono }) => (
            <NavLink key={ruta} to={ruta} end={ruta === '/'} className={({ isActive }) => (isActive ? 'activo' : '')}>
              <Icono size={18} strokeWidth={1.75} aria-hidden="true" />{texto}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-pie">
          <div className={`estado-ia ${ia ? 'activa' : ''}`}>
            <i aria-hidden="true" />{ia === null ? 'Consultando IA…' : ia ? 'Asistente IA activo' : 'Asistente IA pendiente'}
          </div>
          <div className="usuario">
            <span className="avatar" aria-hidden="true">{iniciales(s?.usuario?.nombre)}</span>
            <div className="usuario-datos">
              <b>{s?.usuario?.nombre}</b>
              <span>{ROLES[rol] || rol}</span>
            </div>
            <button className="boton-icono-oscuro" onClick={() => { cerrarSesion(); nav('/login'); }}
              aria-label="Cerrar sesión" title="Cerrar sesión">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <main className="contenido"><Outlet /></main>
    </div>
  );
}
