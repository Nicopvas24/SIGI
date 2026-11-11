// Vista Transcripción y radicación (CU-11 a CU-15) + reporte SG-SST (CU-16)
import { useEffect, useState } from 'react';
import { ExternalLink, Mail, Monitor, Stamp } from 'lucide-react';
import { api } from '../api.js';
import { Aviso, Encabezado, Panel, PanelIA, Vacio, tipo, useDialogo } from '../ui.jsx';

export default function Transcripcion() {
  const dlg = useDialogo();
  const [casos, setCasos] = useState(null);
  const [msj, setMsj] = useState(null);
  const [sgsst, setSgsst] = useState(null);
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7));
  const [cargando, setCargando] = useState(null);

  const cargar = () => api('/transcripcion/pendientes').then(setCasos).catch((e) => { setCasos([]); setMsj({ t: 'error', m: e.message }); });
  useEffect(() => { cargar(); }, []);

  async function transcribir(caso) {
    const porPortal = caso.canal_entidad === 'PORTAL_WEB';
    const numero = await dlg.pedirTexto(`Transcribir ${caso.numero_caso}`, 'Número o constancia de transcripción', '', {
      descripcion: `Canal de ${caso.entidad?.nombre}: ${porPortal ? 'portal web' : 'correo electrónico'}.`,
      textoAceptar: 'Registrar transcripción',
    });
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
    const numero = await dlg.pedirTexto(`Radicar ${caso.numero_caso}`, 'Número de radicado', '', {
      descripcion: `Radicación ante ${caso.entidad?.nombre}. La evidencia queda asociada a la gestión.`,
      textoAceptar: 'Radicar',
    });
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
    setCargando(conIA ? 'ia' : 'reporte');
    try {
      setSgsst(await api(`/sgsst/reporte?periodo=${periodo}${conIA ? '&ia=true' : ''}`));
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
    finally { setCargando(null); }
  }

  const ia = sgsst?.analisis_ia && !sgsst.analisis_ia.pendiente ? sgsst.analisis_ia : null;

  return (
    <div>
      <Encabezado
        titulo="Transcripción y radicación"
        descripcion="Casos verificados por transcribir ante la entidad, ordenados por el plazo que les queda."
        refs={['CU-11', 'CU-16']}
      />
      <Aviso msj={msj} onCerrar={() => setMsj(null)} />

      <Panel titulo="Por transcribir o radicar" sub={casos ? `${casos.length} caso(s)` : 'Cargando…'} cuerpo={false}>
        {casos?.length ? (
          <div className="tabla-wrap">
            <table>
              <thead><tr><th>Caso</th><th>Entidad</th><th>Canal</th><th>Plazo</th><th className="th-acciones">Acciones</th></tr></thead>
              <tbody>
                {casos.map((c) => (
                  <tr key={c.id} className={c.plazo_vencido ? 'fila-alerta' : ''}>
                    <td>
                      <span className="caso">{c.numero_caso}</span>
                      <span className="secundario-texto">{c.colaborador?.usuario?.nombre} · {tipo(c.tipo)} · {c.dias} día(s)</span>
                    </td>
                    <td>
                      {c.entidad?.nombre}
                      {c.entidad?.portal_url && (
                        <a className="secundario-texto" href={c.entidad.portal_url} target="_blank" rel="noreferrer">
                          Abrir portal <ExternalLink size={12} aria-hidden="true" />
                        </a>
                      )}
                    </td>
                    <td>
                      <span className="exp-meta" style={{ marginTop: 0 }}>
                        <span>{c.canal_entidad === 'PORTAL_WEB'
                          ? <><Monitor size={14} aria-hidden="true" />Portal web</>
                          : <><Mail size={14} aria-hidden="true" />Correo</>}</span>
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {c.plazo_vencido
                        ? <><span className="sello alerta">Vencido</span><span className="secundario-texto">Requiere revisión de coordinación</span></>
                        : c.prioritario
                          ? <><span className="resaltado">Quedan {c.plazo_restante_dias} días</span><span className="secundario-texto">Prioritario</span></>
                          : <>Quedan {c.plazo_restante_dias} días</>}
                    </td>
                    <td>
                      <div className="acciones">
                        <button className="secundario" onClick={() => radicar(c)}>Radicar</button>
                        <button onClick={() => transcribir(c)} disabled={c.plazo_vencido}>Transcribir</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : casos && (
          <Vacio icono={Stamp} titulo="Nada por transcribir">
            Los casos llegan aquí cuando quedan verificados. Los plazos por entidad se calculan solos.
          </Vacio>
        )}
      </Panel>

      <Panel
        titulo="Reporte de ausentismo al SG-SST"
        sub="Resumen mensual de incapacidades, días perdidos e índices."
        extra={
          <div className="en-linea">
            <input type="month" aria-label="Periodo" style={{ width: 170 }} value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
            <button onClick={() => reporteSGSST(false)} disabled={cargando === 'reporte'}>
              {cargando === 'reporte' ? 'Generando…' : 'Generar reporte'}
            </button>
          </div>
        }
      >
        {sgsst ? (
          <div className="regla-hitos cuatro">
            {[
              ['Incapacidades', sgsst.resumen.total_incapacidades, 'Eventos del periodo'],
              ['Días perdidos', sgsst.resumen.dias_perdidos, 'Suma de días'],
              ['Índice de frecuencia', sgsst.resumen.indice_frecuencia, 'Eventos por periodo'],
              ['Índice de severidad', sgsst.resumen.indice_severidad, 'Días perdidos por periodo'],
            ].map(([t, n, q]) => (
              <div key={t}><div className="dia">{t}</div><div className={`n ${n ? '' : 'cero'}`}>{n}</div><div className="que">{q}</div></div>
            ))}
          </div>
        ) : (
          <p className="texto-tenue">Elija el periodo y genere el reporte.</p>
        )}

        <PanelIA
          titulo="Análisis de ausentismo"
          descripcion="Hallazgos, patrones y recomendaciones para el SG-SST. Los diagnósticos se envían agrupados y sin nombres."
          accion="Analizar con IA"
          cargando={cargando === 'ia'}
          onEjecutar={() => reporteSGSST(true)}
        >
          {ia && <>
            <p>{ia.resumen_ejecutivo}</p>
            {ia.hallazgos?.length > 0 && <><h4>Hallazgos</h4><ul>{ia.hallazgos.map((h, i) => <li key={i}>{h}</li>)}</ul></>}
            {ia.recomendaciones_sgsst?.length > 0 && <><h4>Recomendaciones</h4><ul>{ia.recomendaciones_sgsst.map((h, i) => <li key={i}>{h}</li>)}</ul></>}
          </>}
        </PanelIA>
      </Panel>
    </div>
  );
}
