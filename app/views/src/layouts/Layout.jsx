import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, Archive, ArrowLeftRight, Bell, FileCheck2, FileInput, Gavel, LogOut, Menu, Stamp, UserCog, Users, Wallet, X } from 'lucide-react';
import { api, sesion, cerrarSesion } from '../api.js';
import { ROLES, iniciales, useIA } from '../ui.jsx';

// Menú por rol, agrupado por etapa del proceso
const MENU = [
  { ruta: '/monitoreo', texto: 'Monitoreo', icono: Activity, grupo: 'Trámite', roles: ['AUXILIAR', 'ADMIN'] },
  { ruta: '/recepcion', texto: 'Reporte y recepción', icono: FileInput, grupo: 'Trámite', roles: ['COLABORADOR', 'LIDER', 'RECEPCIONISTA', 'AUXILIAR', 'ADMIN'] },
  { ruta: '/verificacion', texto: 'Verificación', icono: FileCheck2, grupo: 'Trámite', roles: ['AUXILIAR', 'ADMIN'] },
  { ruta: '/transcripcion', texto: 'Transcripción y radicación', icono: Stamp, grupo: 'Trámite', roles: ['AUXILIAR', 'ADMIN'] },
  { ruta: '/cobro', texto: 'Cobro', icono: Wallet, grupo: 'Cobro y pagos', roles: ['AUXILIAR', 'CONTABILIDAD', 'ADMIN'] },
  { ruta: '/juridico', texto: 'Cobro jurídico', icono: Gavel, grupo: 'Cobro y pagos', roles: ['JURIDICA', 'AUXILIAR', 'ADMIN'] },
  { ruta: '/conciliacion', texto: 'Conciliación', icono: ArrowLeftRight, grupo: 'Cobro y pagos', roles: ['CONTABILIDAD', 'AUXILIAR', 'ADMIN'] },
  { ruta: '/archivo', texto: 'Archivo', icono: Archive, grupo: 'Cobro y pagos', roles: ['AUXILIAR', 'GESTION_DOCUMENTAL', 'ADMIN'] },
  { ruta: '/colaboradores', texto: 'Colaboradores', icono: Users, grupo: 'Personas', roles: ['AUXILIAR', 'LIDER', 'ADMIN'] },
  { ruta: '/usuarios', texto: 'Usuarios', icono: UserCog, grupo: 'Personas', roles: ['ADMIN'] },
];

/** Agrupa los módulos del rol; los títulos de grupo solo se muestran si hay más de un grupo. */
function gruposDelRol(rol) {
  const grupos = [];
  for (const m of MENU.filter((x) => x.roles.includes(rol))) {
    const g = grupos.find((x) => x.nombre === m.grupo);
    if (g) g.items.push(m); else grupos.push({ nombre: m.grupo, items: [m] });
  }
  return grupos;
}

const INICIO = {
  AUXILIAR: '/monitoreo', ADMIN: '/monitoreo', JURIDICA: '/juridico', CONTABILIDAD: '/conciliacion',
  GESTION_DOCUMENTAL: '/archivo',
};
export const inicioDeRol = (rol) => INICIO[rol] || '/recepcion';

// Logo oficial para fondo oscuro (barra lateral y panel del ingreso). Archivos en public/assets/brand/
export function Marca() {
  return (
    <div className="marca">
      <img src="/assets/brand/sigi-logo-fondo-oscuro.svg" width="221" height="48" alt="SIGI · Gestión de incapacidades" />
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
  const [menuAbierto, setMenuAbierto] = useState(false); // solo aplica en celular y tablet

  // El menú móvil se cierra al cambiar de módulo o con Escape
  useEffect(() => { setMenuAbierto(false); }, [pathname]);
  useEffect(() => {
    if (!menuAbierto) return undefined;
    const alTeclear = (e) => { if (e.key === 'Escape') setMenuAbierto(false); };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [menuAbierto]);

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
      <aside className={`sidebar ${menuAbierto ? 'abierto' : ''}`}>
        <div className="sidebar-cabeza">
          <Marca />
          <button className="boton-menu" onClick={() => setMenuAbierto((v) => !v)} aria-expanded={menuAbierto} aria-controls="menu-principal">
            {menuAbierto ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            <span>{menuAbierto ? 'Cerrar' : 'Menú'}</span>
            {!menuAbierto && pendientes > 0 && <>
              <span className="insignia" aria-hidden="true">{pendientes > 99 ? '99+' : pendientes}</span>
              <span className="sr-only">, {pendientes} notificaciones sin leer</span>
            </>}
          </button>
        </div>
        <nav className="nav" id="menu-principal" aria-label="Módulos">
          {(() => {
            const grupos = gruposDelRol(rol);
            return grupos.map((g) => (
              <div className="nav-grupo" key={g.nombre} role="group" aria-label={grupos.length > 1 ? g.nombre : undefined}>
                {grupos.length > 1 && <span className="nav-titulo" aria-hidden="true">{g.nombre}</span>}
                {g.items.map(({ ruta, texto, icono: Icono }) => (
                  <NavLink key={ruta} to={ruta} className={({ isActive }) => (isActive ? 'activo' : '')}>
                    <Icono size={18} strokeWidth={1.75} aria-hidden="true" />{texto}
                  </NavLink>
                ))}
              </div>
            ));
          })()}
          <div className="nav-grupo">
            <NavLink to="/notificaciones" className={({ isActive }) => (isActive ? 'activo' : '')}>
              <Bell size={18} strokeWidth={1.75} aria-hidden="true" />Notificaciones
              {pendientes > 0 && <span className="insignia" aria-label={`${pendientes} sin leer`}>{pendientes > 99 ? '99+' : pendientes}</span>}
            </NavLink>
          </div>
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
