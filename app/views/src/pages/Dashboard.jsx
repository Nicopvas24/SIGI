// Vista Monitoreo (CU-26/27/28) + predicción con IA
import { useEffect, useState } from 'react';
import { api } from '../api.js';

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
      setMsj({ t: 'ok', m: r.alerta || 'Acción registrada' });
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
  return (
    <div>
      <h2>Monitoreo de incapacidades (90 / 120 / 150 / 180 días)</h2>
      {msj && <div className={`alerta ${msj.t}`}>{msj.m}</div>}
      <div className="fila-tarjetas">
        {[90, 120, 150, 180].map((u) => (
          <div className="kpi" key={u}>
            <div className="valor">{filas.filter((f) => f.umbral === u).length}</div>
            <div className="titulo">Superan {u} días</div>
          </div>
        ))}
      </div>

      <div className="tarjeta">
        <table>
          <thead><tr>
            <th>Caso</th><th>Colaborador</th><th>Entidad</th><th>Días acum.</th>
            <th>Umbral</th><th>Concepto rehab.</th><th>Acciones</th>
          </tr></thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.incapacidad_id}>
                <td>{f.numero_caso}</td>
                <td>{f.colaborador}</td>
                <td>{f.entidad}</td>
                <td><b>{f.dias_acumulados}</b></td>
                <td>{f.umbral ? <span className="estado">{f.umbral}+</span> : '—'}</td>
                <td>
                  {f.concepto_rehabilitacion
                    ? `${f.concepto_rehabilitacion.resultado || 'Solicitado'}${f.concepto_rehabilitacion.enviado_afp ? ' · AFP ✓' : ''}`
                    : f.vencido_concepto_120 ? <span style={{ color: '#c0392b' }}>Vencido día 120</span> : 'Sin concepto'}
                </td>
                <td>
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
                </td>
              </tr>
            ))}
            {!filas.length && <tr><td colSpan={7}>Ningún colaborador supera 90 días (reporte vacío, CU-26 3a).</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="ia-caja">
        <h4>🤖 IA · Predicción de casos que podrían superar 180 días</h4>
        <button onClick={predecir} disabled={cargandoIA}>
          {cargandoIA ? 'Analizando con IA…' : 'Ejecutar análisis predictivo'}
        </button>
        {prediccion && (
          <div style={{ marginTop: 10 }}>
            {(prediccion.evaluaciones || []).map((e) => (
              <div key={e.numero_caso} style={{ marginBottom: 8 }}>
                <b>{e.numero_caso}</b> · riesgo <b>{e.riesgo}</b> ({e.dias_acumulados} días) — {e.razonamiento}
                <br /><i>Acción sugerida: {e.accion_sugerida}</i>
              </div>
            ))}
            <p><b>Conclusión:</b> {prediccion.conclusion}</p>
          </div>
        )}
      </div>
    </div>
  );
}
