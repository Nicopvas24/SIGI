import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, Archive, ArrowLeftRight, Bell, FileCheck2, FileInput, Gavel, LogOut, Stamp, Users, Wallet } from 'lucide-react';
import { api, sesion, cerrarSesion } from '../api.js';
import { ROLES, iniciales, useIA } from '../ui.jsx';

// Menú por rol (actores de la documentación)
const MENU = [
  { ruta: '/monitoreo', texto: 'Monitoreo', icono: Activity, roles: ['AUXILIAR', 'ADMIN'] },
  { ruta: '/recepcion', texto: 'Reporte y recepción', icono: FileInput, roles: ['COLABORADOR', 'LIDER', 'RECEPCIONISTA', 'AUXILIAR', 'ADMIN'] },
  { ruta: '/verificacion', texto: 'Verificación', icono: FileCheck2, roles: ['AUXILIAR', 'ADMIN'] },
  { ruta: '/transcripcion', texto: 'Transcripción y radicación', icono: Stamp, roles: ['AUXILIAR', 'ADMIN'] },
  { ruta: '/cobro', texto: 'Cobro', icono: Wallet, roles: ['AUXILIAR', 'CONTABILIDAD', 'ADMIN'] },
  { ruta: '/juridico', texto: 'Cobro jurídico', icono: Gavel, roles: ['JURIDICA', 'AUXILIAR', 'ADMIN'] },
  { ruta: '/conciliacion', texto: 'Conciliación', icono: ArrowLeftRight, roles: ['CONTABILIDAD', 'AUXILIAR', 'ADMIN'] },
  { ruta: '/archivo', texto: 'Archivo', icono: Archive, roles: ['AUXILIAR', 'GESTION_DOCUMENTAL', 'ADMIN'] },
  { ruta: '/colaboradores', texto: 'Colaboradores', icono: Users, roles: ['AUXILIAR', 'LIDER', 'ADMIN'] },
];

const INICIO = {
  AUXILIAR: '/monitoreo', ADMIN: '/monitoreo', JURIDICA: '/juridico', CONTABILIDAD: '/conciliacion',
  GESTION_DOCUMENTAL: '/archivo',
};
export const inicioDeRol = (rol) => INICIO[rol] || '/recepcion';

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
  const { pathname } = useLocation();
  const s = sesion();
  const rol = s?.usuario?.rol || 'COLABORADOR';
  const ia = useIA();
  const [pendientes, setPendientes] = useState(0);

  // Contador de notificaciones sin leer (se refresca al cambiar de módulo y cada minuto)
  useEffect(() => {
    let vivo = true;
    const cargar = () => api('/auth/perfil').then((p) => vivo && setPendientes(p.notificaciones_pendientes || 0)).catch(() => {});
    cargar();
    const t = setInterval(cargar, 60000);
    return () => { vivo = false; clearInterval(t); };
  }, [pathname]);

  // Si el rol no tiene acceso al módulo de la URL, lo lleva a su inicio
  const permitido = ['/notificaciones', '/'].includes(pathname) || MENU.some((m) => m.ruta === pathname && m.roles.includes(rol));
  if (!permitido) return <Navigate to={inicioDeRol(rol)} replace />;

  return (
    <div className="layout">
      <aside className="sidebar">
        <Marca />
        <nav className="nav" aria-label="Módulos">
          {MENU.filter((m) => m.roles.includes(rol)).map(({ ruta, texto, icono: Icono }) => (
            <NavLink key={ruta} to={ruta} className={({ isActive }) => (isActive ? 'activo' : '')}>
              <Icono size={18} strokeWidth={1.75} aria-hidden="true" />{texto}
            </NavLink>
          ))}
          <NavLink to="/notificaciones" className={({ isActive }) => (isActive ? 'activo' : '')}>
            <Bell size={18} strokeWidth={1.75} aria-hidden="true" />Notificaciones
            {pendientes > 0 && <span className="insignia" aria-label={`${pendientes} sin leer`}>{pendientes > 99 ? '99+' : pendientes}</span>}
          </NavLink>
        </nav>
        <div className="sidebar-pie">
          <div className={`estado-ia ${ia ? 'activa' : ''}`}>
            <i aria-hidden="true" />{ia === null ? 'Consultando IA…' : ia ? 'Asistente IA activo' : 'Asistente IA sin configurar'}
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
      <main className="contenido"><Outlet context={{ refrescarNotificaciones: () => setPendientes(0) }} /></main>
    </div>
  );
}
