// Vista Colaboradores: historial de incapacidades por persona y resumen con IA
import { useEffect, useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { api } from '../api.js';
import { Aviso, Encabezado, Estado, MiniRegla, Panel, PanelIA, Vacio, dinero, fecha, tipo } from '../ui.jsx';

export default function Colaboradores() {
  const [lista, setLista] = useState(null);
  const [filtro, setFiltro] = useState('');
  const [sel, setSel] = useState(null);
  const [historial, setHistorial] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [cargandoIA, setCargandoIA] = useState(false);
  const [msj, setMsj] = useState(null);

  useEffect(() => {
    api('/monitoreo/colaboradores').then(setLista).catch((e) => { setLista([]); setMsj({ t: 'error', m: e.message }); });
  }, []);

  useEffect(() => {
    if (!sel) return;
    setHistorial(null);
    setResumen(null);
    api(`/monitoreo/colaboradores/${sel}`).then(setHistorial).catch((e) => setMsj({ t: 'error', m: e.message }));
  }, [sel]);

  const visibles = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    return (lista || [])
      .filter((c) => !f || `${c.usuario?.nombre} ${c.usuario?.documento} ${c.area} ${c.cargo}`.toLowerCase().includes(f))
      .sort((a, b) => b.dias_acumulados_actual - a.dias_acumulados_actual || b.total_dias - a.total_dias);
  }, [lista, filtro]);

  async function resumir() {
    setCargandoIA(true);
    try { setResumen(await api(`/ia/resumen-colaborador/${sel}`, { method: 'POST', body: {} })); }
    catch (e) { setMsj({ t: 'error', m: e.message }); }
    finally { setCargandoIA(false); }
  }

  const est = historial?.estadisticas;
  const col = historial?.colaborador;

  return (
    <div>
      <Encabezado titulo="Colaboradores" descripcion="Historial de incapacidades de cada persona, con sus días acumulados y un resumen preparado por la IA." />
      <Aviso msj={msj} onCerrar={() => setMsj(null)} />

      <Panel titulo="Equipo" sub={lista ? `${visibles.length} colaborador(es)` : 'Cargando…'} cuerpo={false}
        extra={
          <div className="campo" style={{ width: 260 }}>
            <label htmlFor="buscar" className="sr-only">Buscar colaborador</label>
            <div style={{ position: 'relative' }}>
              <Search size={15} aria-hidden="true" style={{ position: 'absolute', left: 10, top: 10, color: 'var(--texto-3)' }} />
              <input id="buscar" placeholder="Buscar por nombre, documento o área" value={filtro} onChange={(e) => setFiltro(e.target.value)} style={{ paddingLeft: 32 }} />
            </div>
          </div>
        }>
        {visibles.length ? (
          <div className="tabla-wrap">
            <table>
              <thead><tr><th>Colaborador</th><th>Área</th><th>EPS</th><th className="num">Casos</th><th className="num">Días totales</th><th>Acumulado actual</th></tr></thead>
              <tbody>
                {visibles.map((c) => (
                  <tr key={c.id} onClick={() => setSel(c.id)} style={{ cursor: 'pointer', background: sel === c.id ? 'var(--sello-claro)' : undefined }}>
                    <td>
                      <button type="button" className="fantasma" style={{ padding: 0, minHeight: 0, fontWeight: 640, color: 'var(--tinta-800)' }}
                        onClick={(e) => { e.stopPropagation(); setSel(c.id); }}>{c.usuario?.nombre}</button>
                      <span className="secundario-texto">C.C. {c.usuario?.documento} · {c.cargo}</span>
                    </td>
                    <td>{c.area}</td>
                    <td>{c.eps?.nombre || '—'}</td>
                    <td className="num">{c.total_casos}{c.casos_activos > 0 && <span className="secundario-texto">{c.casos_activos} activo(s)</span>}</td>
                    <td className="num">{c.total_dias}</td>
                    <td>{c.casos_activos ? <MiniRegla dias={c.dias_acumulados_actual} /> : <span className="texto-tenue">Sin incapacidad activa</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : lista && (
          <Vacio icono={Users} titulo="No hay colaboradores">{filtro ? 'Ningún colaborador coincide con la búsqueda.' : 'No hay colaboradores registrados en su equipo.'}</Vacio>
        )}
      </Panel>

      {sel && (
        <Panel titulo={col ? col.usuario?.nombre : 'Cargando…'}
          sub={col && `${col.cargo || ''} · ${col.area || ''} · EPS ${col.eps?.nombre || '—'} · ARL ${col.arl?.nombre || '—'} · IBC ${dinero(col.ibc)}`}>
          {est && <>
            <div className="regla-hitos cuatro">
              {[
                ['Incapacidades', est.total_casos, `${est.prorrogas} prórroga(s)`],
                ['Días totales', est.total_dias, `${est.dias_este_anio} en ${new Date().getFullYear()}`],
                ['Acumulado actual', est.dias_acumulados_actual, est.casos_activos ? 'Con prórrogas, caso activo' : 'Sin incapacidad activa'],
                ['Pagado por entidades', dinero(est.valor_pagado), `de ${dinero(est.valor_solicitado)} solicitado`],
              ].map(([t, n, q]) => (
                <div key={t}><div className="dia">{t}</div><div className={`n ${n ? '' : 'cero'}`} style={{ fontSize: typeof n === 'string' ? 20 : undefined }}>{n}</div><div className="que">{q}</div></div>
              ))}
            </div>

            {historial.casos.length > 0 ? (
              <div className="sub-tabla tabla-wrap">
                <table>
                  <thead><tr><th>Caso</th><th>Tipo</th><th>Periodo</th><th className="num">Días</th><th className="num">Acumulado</th><th>Entidad</th><th>Estado</th></tr></thead>
                  <tbody>
                    {historial.casos.map((c) => (
                      <tr key={c.id}>
                        <td className="caso">{c.numero_caso}</td>
                        <td>{tipo(c.tipo)}{c.prorroga_de && <span className="secundario-texto">Prórroga</span>}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{fecha(c.fecha_inicio)} – {fecha(c.fecha_fin)}</td>
                        <td className="num">{c.dias}</td>
                        <td className="num">{c.dias_acumulados}</td>
                        <td>{c.entidad?.nombre}</td>
                        <td><Estado valor={c.estado} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="texto-tenue" style={{ marginTop: 12 }}>Este colaborador no tiene incapacidades registradas.</p>}

            {historial.casos.length > 0 && (
              <PanelIA titulo="Resumen del historial con IA"
                descripcion="La IA de Google resume la situación del colaborador, detecta patrones y alerta sobre los hitos de 120, 150 y 180 días. El diagnóstico se envía solo como código agrupado."
                accion="Generar resumen" cargando={cargandoIA} onEjecutar={resumir}>
                {resumen && <>
                  <p>{resumen.resumen}</p>
                  {resumen.situacion_actual && <><h4>Situación actual</h4><p>{resumen.situacion_actual}</p></>}
                  {resumen.alertas?.length > 0 && <><h4>Alertas</h4><ul>{resumen.alertas.map((x, i) => <li key={i} className="texto-alerta">{x}</li>)}</ul></>}
                  {resumen.patrones?.length > 0 && <><h4>Patrones</h4><ul>{resumen.patrones.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
                  {resumen.recomendaciones?.length > 0 && <><h4>Recomendaciones</h4><ul>{resumen.recomendaciones.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
                </>}
              </PanelIA>
            )}
          </>}
        </Panel>
      )}
    </div>
  );
}
