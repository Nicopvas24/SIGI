// Vista Informes - descarga de los informes de SIGI en PDF
import { useState } from 'react';
import { CalendarRange, ChartColumn, Check, FileDown, FileText, Hourglass, ListFilter, Users, Wallet } from 'lucide-react';
import { descargar, sesion } from '../api.js';
import { Aviso, Encabezado, ROLES } from '../ui.jsx';

const ESTE_ANIO = new Date().getFullYear();
const ANIOS = Array.from({ length: 5 }, (_, i) => String(ESTE_ANIO - i));
const ESTE_MES = new Date().toISOString().slice(0, 7);

// Mismos permisos que el servidor (app/controllers/InformeController.js); Administración ve todos
const INFORMES = [
  {
    id: 'estadisticas', titulo: 'Informe de estadísticas', roles: ['AUXILIAR'], filtro: 'anio', icono: ChartColumn, tono: '', paginas: '3 a 4 páginas',
    descripcion: 'Todas las cifras del módulo de Estadísticas en un solo documento.',
    incluye: ['Resumen y etapas del proceso', 'Ausentismo por tipo, área, diagnóstico y duración', 'Cartera, cobro jurídico y días acumulados'],
  },
  {
    id: 'ausentismo', titulo: 'Informe de ausentismo', roles: ['AUXILIAR'], filtro: 'mes', icono: CalendarRange, tono: 'neutra', paginas: '1 a 2 páginas',
    descripcion: 'Reporte mensual para el Sistema de Gestión de Seguridad y Salud en el Trabajo.',
    incluye: ['Días perdidos y colaboradores afectados', 'Distribución por tipo, origen y área', 'Detalle de cada incapacidad del mes'],
  },
  {
    id: 'cartera', titulo: 'Informe de cartera con EPS y ARL', roles: ['AUXILIAR', 'CONTABILIDAD'], filtro: 'anio', icono: Wallet, tono: 'pagada', paginas: '1 a 2 páginas',
    descripcion: 'Lo que las entidades deben reconocer, lo pagado y lo que falta por cobrar.',
    incluye: ['Solicitado, pagado y en cobro', 'Recuperado por entidad', 'Casos con saldo pendiente, de mayor a menor'],
  },
  {
    id: 'prolongados', titulo: 'Informe de casos prolongados', roles: ['AUXILIAR'], filtro: null, icono: Hourglass, tono: 'accion', paginas: '1 página o más',
    descripcion: 'Casos vigentes con 90 días o más acumulados, a la fecha de hoy.',
    incluye: ['Casos en los hitos de 90, 120, 150 y 180 días', 'Estado del concepto de rehabilitación', 'Acción pendiente en cada caso'],
  },
];

export default function Informes() {
  const rol = sesion()?.usuario?.rol;
  const visibles = INFORMES.filter((i) => rol === 'ADMIN' || i.roles.includes(rol));
  const [filtros, setFiltros] = useState({ estadisticas: '', ausentismo: ESTE_MES, cartera: String(ESTE_ANIO) });
  const [generando, setGenerando] = useState(null);
  const [msj, setMsj] = useState(null);

  async function generar(informe) {
    const valor = filtros[informe.id];
    const consulta = informe.filtro === 'anio' && valor ? `?anio=${valor}` : informe.filtro === 'mes' && valor ? `?periodo=${valor}` : '';
    setGenerando(informe.id);
    setMsj(null);
    try {
      const archivo = await descargar(`/informes/${informe.id}${consulta}`, `sigi-${informe.id}.pdf`);
      setMsj({ t: 'ok', m: `Se descargó ${archivo}.` });
    } catch (e) {
      setMsj({ t: 'error', m: e.message });
    } finally {
      setGenerando(null);
    }
  }

  return (
    <div>
      <Encabezado titulo="Informes" descripcion="Descargue los informes de SIGI en PDF para compartir, presentar o archivar. Las cifras son las mismas de cada pantalla." />
      <Aviso msj={msj} onCerrar={() => setMsj(null)} />
      <div className="tarjetas-informes">
        {visibles.map((inf) => {
          const Icono = inf.icono;
          const quien = ['ADMIN', ...inf.roles].map((r) => ROLES[r]).join(', ');
          return (
            <article key={inf.id} className={`tarjeta tarjeta-informe ${inf.tono}`} aria-labelledby={`inf-${inf.id}`}>
              <div className="tarjeta-informe-cabeza">
                <span className="tarjeta-icono grande" aria-hidden="true"><Icono size={24} strokeWidth={2} /></span>
                <div>
                  <h2 id={`inf-${inf.id}`}>{inf.titulo}</h2>
                  <p>{inf.descripcion}</p>
                </div>
              </div>
              <ul className="tarjeta-informe-incluye">
                {inf.incluye.map((t) => <li key={t}><Check size={15} strokeWidth={2.5} aria-hidden="true" />{t}</li>)}
              </ul>
              <div className="tarjeta-informe-datos">
                <span><FileText size={14} aria-hidden="true" />PDF · {inf.paginas}</span>
                <span><ListFilter size={14} aria-hidden="true" />{inf.filtro === 'anio' ? 'Por año' : inf.filtro === 'mes' ? 'Por mes' : 'A la fecha de hoy'}</span>
                <span><Users size={14} aria-hidden="true" />{quien}</span>
              </div>
              <div className="tarjeta-informe-acciones">
                {inf.filtro === 'anio' && (
                  <select aria-label={`Año del ${inf.titulo.toLowerCase()}`} value={filtros[inf.id]} onChange={(e) => setFiltros({ ...filtros, [inf.id]: e.target.value })}>
                    <option value="">Todo el histórico</option>
                    {ANIOS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                )}
                {inf.filtro === 'mes' && (
                  <input type="month" aria-label="Mes del informe" value={filtros[inf.id]} max={ESTE_MES}
                    onChange={(e) => setFiltros({ ...filtros, [inf.id]: e.target.value })} />
                )}
                {!inf.filtro && <span className="texto-tenue">Con los datos de hoy</span>}
                <button type="button" onClick={() => generar(inf)} disabled={generando !== null}>
                  <FileDown size={16} aria-hidden="true" />{generando === inf.id ? 'Generando…' : 'Descargar PDF'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
