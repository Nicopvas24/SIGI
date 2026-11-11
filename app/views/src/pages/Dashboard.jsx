// Vista Monitoreo (CU-26/27/28) + predicción con IA
import { useEffect, useState } from 'react';
import { Activity, Check } from 'lucide-react';
import { api } from '../api.js';
import { Aviso, Encabezado, MiniRegla, Panel, PanelIA, ReglaDias, Vacio } from '../ui.jsx';

const RIESGO = { ALTO: 'alerta', MEDIO: 'pendiente', BAJO: 'cerrado' };

export default function Dashboard() {
  const [reporte, setReporte] = useState(null);
  const [prediccion, setPrediccion] = useState(null);
  const [cargandoIA, setCargandoIA] = useState(false);
  const [msj, setMsj] = useState(null);

  const cargar = () => api('/monitoreo/reporte').then(setReporte).catch((e) => setMsj({ t: 'error', m: e.message }));
  useEffect(() => { cargar(); }, []);

  async function accionConcepto(id, accion, resultado) {
    try {
      const r = await api(`/incapacidades/${id}/concepto-rehabilitacion`, { method: 'POST', body: { accion, resultado } });
      setMsj({ t: 'ok', m: r.alerta || 'Acción registrada.' });
      cargar();
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
  }

  async function suspender(id) {
    try {
      const r = await api(`/incapacidades/${id}/suspension-nomina`, { method: 'POST', body: {} });
      setMsj({ t: 'ok', m: r.mensaje });
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
  }

  async function predecir() {
    setCargandoIA(true);
    try { setPrediccion(await api('/ia/prediccion-180')); }
    catch (e) { setMsj({ t: 'error', m: e.message }); }
    finally { setCargandoIA(false); }
  }

  const filas = reporte?.filas || [];
  const marcas = filas.map((f) => ({ id: f.incapacidad_id, dias: f.dias_acumulados, etiqueta: `${f.numero_caso} · ${f.colaborador}` }));

  return (
    <div>
      <Encabezado
        titulo="Monitoreo de días acumulados"
        descripcion="Casos que se acercan a los hitos legales de 90, 120, 150 y 180 días, sumando prórrogas."
        refs={['CU-26', 'CU-27', 'CU-28']}
      />
      <Aviso msj={msj} onCerrar={() => setMsj(null)} />

      <Panel titulo="Regla de 180 días" sub={reporte ? `${filas.length} caso(s) con más de 90 días acumulados` : 'Cargando…'}>
        <ReglaDias casos={marcas} />
      </Panel>

      <Panel titulo="Casos prolongados" cuerpo={false}>
        {filas.length ? (
          <div className="tabla-wrap">
            <table>
              <thead><tr>
                <th>Caso</th><th>Entidad</th><th>Días acumulados</th><th>Concepto de rehabilitación</th>
                <th className="th-acciones">Acciones</th>
              </tr></thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.incapacidad_id} className={f.requiere_suspension_nomina || f.vencido_concepto_120 ? 'fila-alerta' : ''}>
                    <td><span className="caso">{f.numero_caso}</span><span className="secundario-texto">{f.colaborador}</span></td>
                    <td>{f.entidad}</td>
                    <td><MiniRegla dias={f.dias_acumulados} /></td>
                    <td>
                      {f.concepto_rehabilitacion
                        ? <>
                            <span className={`sello ${f.concepto_rehabilitacion.resultado === 'DESFAVORABLE' ? 'alerta' : f.concepto_rehabilitacion.resultado ? 'cerrado' : ''}`}>
                              {f.concepto_rehabilitacion.resultado || 'Solicitado'}
                            </span>
                            {f.concepto_rehabilitacion.enviado_afp && <span className="secundario-texto"><Check size={13} aria-hidden="true" /> Enviado al AFP</span>}
                          </>
                        : f.vencido_concepto_120
                          ? <span className="texto-alerta">Vencido el día 120</span>
                          : <span className="texto-tenue">Sin solicitar</span>}
                    </td>
                    <td>
                      <div className="acciones">
                        {!f.concepto_rehabilitacion && (
                          <button onClick={() => accionConcepto(f.incapacidad_id, 'SOLICITAR')}>Solicitar concepto</button>
                        )}
                        {f.concepto_rehabilitacion && !f.concepto_rehabilitacion.resultado && (
                          <button className="secundario" onClick={() => accionConcepto(f.incapacidad_id, 'REGISTRAR', 'FAVORABLE')}>Registrar favorable</button>
                        )}
                        {f.pendiente_envio_afp_150 && (
                          <button className="secundario" onClick={() => accionConcepto(f.incapacidad_id, 'ENVIAR_AFP')}>Enviar al AFP</button>
                        )}
                        {f.requiere_suspension_nomina && (
                          <button className="peligro" onClick={() => suspender(f.incapacidad_id)}>Suspender nómina</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Vacio icono={Activity} titulo="Ningún colaborador supera los 90 días">
            Cuando un caso, con sus prórrogas, pase el día 90, aparecerá aquí con las acciones de cada hito.
          </Vacio>
        )}
      </Panel>

      <PanelIA
        titulo="Predicción de casos que superarían 180 días"
        descripcion="Estima el riesgo de cada caso activo según días acumulados, prórrogas y tipo de novedad."
        accion="Ejecutar análisis"
        cargando={cargandoIA}
        onEjecutar={predecir}
      >
        {prediccion && <>
          {(prediccion.evaluaciones || []).length > 0 && (
            <div className="sub-tabla tabla-wrap">
              <table>
                <thead><tr><th>Caso</th><th>Riesgo</th><th className="num">Días</th><th>Razonamiento y acción sugerida</th></tr></thead>
                <tbody>
                  {prediccion.evaluaciones.map((e) => (
                    <tr key={e.numero_caso}>
                      <td className="caso">{e.numero_caso}</td>
                      <td><span className={`sello ${RIESGO[e.riesgo] || 'neutro'}`}>{e.riesgo}</span></td>
                      <td className="num">{e.dias_acumulados}</td>
                      <td>{e.razonamiento}<span className="secundario-texto">→ {e.accion_sugerida}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ marginTop: 10 }}><b>Conclusión:</b> {prediccion.conclusion}</p>
        </>}
      </PanelIA>
    </div>
  );
}
