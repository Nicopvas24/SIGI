// Vista Transcripción y radicación (CU-11 a CU-15) + reporte SG-SST (CU-16)
import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Transcripcion() {
  const [casos, setCasos] = useState([]);
  const [msj, setMsj] = useState(null);
  const [sgsst, setSgsst] = useState(null);
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7));
  const [cargandoIA, setCargandoIA] = useState(false);

  const cargar = () => api('/transcripcion/pendientes').then(setCasos).catch((e) => setMsj({ t: 'error', m: e.message }));
  useEffect(() => { cargar(); }, []);

  async function transcribir(caso) {
    const numero = prompt(`Transcribir ${caso.numero_caso} por ${caso.canal_entidad === 'PORTAL_WEB' ? 'PORTAL WEB (CU-12)' : 'CORREO (CU-13)'}.\nNúmero o constancia de transcripción:`);
    if (!numero) return;
    try {
      const r = await api(`/incapacidades/${caso.id}/transcribir`, {
        method: 'POST',
        body: { numero_transcripcion: numero, evidencia_url: `evidencias/transcripcion_${caso.numero_caso}.pdf` },
      });
      setMsj({ t: 'ok', m: r.mensaje });
      cargar();
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
  }

  async function radicar(caso) {
    const numero = prompt(`Radicar ${caso.numero_caso} ante ${caso.entidad?.nombre}.\nNúmero de radicado:`);
    if (!numero) return;
    try {
      const r = await api(`/incapacidades/${caso.id}/radicar`, {
        method: 'POST',
        body: { numero_radicado: numero, medio: 'WEB', evidencia_url: `evidencias/radicado_${caso.numero_caso}.pdf` },
      });
      setMsj({ t: 'ok', m: r.mensaje });
      cargar();
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
  }

  async function reporteSGSST(conIA) {
    setCargandoIA(Boolean(conIA));
    try {
      setSgsst(await api(`/sgsst/reporte?periodo=${periodo}${conIA ? '&ia=true' : ''}`));
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
    finally { setCargandoIA(false); }
  }

  return (
    <div>
      <h2>Bandeja: por transcribir / radicar (CU-11 a CU-15)</h2>
      {msj && <div className={`alerta ${msj.t}`}>{msj.m}</div>}
      <div className="tarjeta">
        <table>
          <thead><tr>
            <th>Caso</th><th>Entidad</th><th>Canal</th><th>Plazo restante</th><th>Acciones</th>
          </tr></thead>
          <tbody>
            {casos.map((c) => (
              <tr key={c.id} style={c.prioritario ? { background: '#fff7ed' } : undefined}>
                <td>{c.numero_caso} · {c.colaborador?.usuario?.nombre}<br />
                  <small>{c.tipo.replaceAll('_', ' ')} · {c.dias} día(s)</small></td>
                <td>{c.entidad?.nombre}{c.entidad?.portal_url && <><br /><a href={c.entidad.portal_url} target="_blank" rel="noreferrer">Portal ↗</a></>}</td>
                <td>{c.canal_entidad === 'PORTAL_WEB' ? 'Portal web' : 'Correo'}</td>
                <td>
                  {c.plazo_vencido
                    ? <b style={{ color: '#c0392b' }}>VENCIDO (revisión coordinación)</b>
                    : <>{c.plazo_restante_dias} día(s) {c.prioritario && <b style={{ color: '#b7791f' }}>· PRIORITARIO</b>}</>}
                </td>
                <td>
                  <button onClick={() => transcribir(c)} disabled={c.plazo_vencido}>Transcribir</button>
                  <button className="secundario" onClick={() => radicar(c)}>Radicar</button>
                </td>
              </tr>
            ))}
            {!casos.length && <tr><td colSpan={5}>No hay casos VERIFICADA pendientes.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="tarjeta">
        <h3>CU-16 · Reporte de ausentismo al SG-SST</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="month" style={{ width: 180 }} value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
          <button onClick={() => reporteSGSST(false)}>Generar reporte</button>
          <button className="secundario" onClick={() => reporteSGSST(true)}>
            {cargandoIA ? 'IA analizando…' : '🤖 Reporte + análisis IA'}
          </button>
        </div>
        {sgsst && (
          <div style={{ marginTop: 12 }}>
            <div className="fila-tarjetas">
              <div className="kpi"><div className="valor">{sgsst.resumen.total_incapacidades}</div><div className="titulo">Incapacidades</div></div>
              <div className="kpi"><div className="valor">{sgsst.resumen.dias_perdidos}</div><div className="titulo">Días perdidos</div></div>
              <div className="kpi"><div className="valor">{sgsst.resumen.indice_frecuencia}</div><div className="titulo">Índice frecuencia</div></div>
              <div className="kpi"><div className="valor">{sgsst.resumen.indice_severidad}</div><div className="titulo">Índice severidad</div></div>
            </div>
            {sgsst.analisis_ia && (
              <div className="ia-caja">
                <h4>🤖 Análisis de ausentismo con IA</h4>
                <p>{sgsst.analisis_ia.resumen_ejecutivo}</p>
                {sgsst.analisis_ia.hallazgos?.length > 0 && <><b>Hallazgos</b><ul>{sgsst.analisis_ia.hallazgos.map((h, i) => <li key={i}>{h}</li>)}</ul></>}
                {sgsst.analisis_ia.recomendaciones_sgsst?.length > 0 && <><b>Recomendaciones SG-SST</b><ul>{sgsst.analisis_ia.recomendaciones_sgsst.map((h, i) => <li key={i}>{h}</li>)}</ul></>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
