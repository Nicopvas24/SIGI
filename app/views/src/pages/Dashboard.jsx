// Vista Monitoreo de días acumulados + predicción con IA
import { useEffect, useState } from 'react';
import { Activity, Check } from 'lucide-react';
import { api } from '../api.js';
import { Aviso, Encabezado, MiniRegla, Panel, PanelIA, ReglaDias, Vacio, fecha, useDialogo } from '../ui.jsx';

const RIESGO = { ALTO: 'alerta', MEDIO: 'pendiente', BAJO: 'cerrado' };

export default function Dashboard() {
  const dlg = useDialogo();
  const [reporte, setReporte] = useState(null);
  const [prediccion, setPrediccion] = useState(null);
  const [cargandoIA, setCargandoIA] = useState(false);
  const [msj, setMsj] = useState(null);

  const cargar = () => api('/monitoreo/reporte').then(setReporte).catch((e) => { setReporte({ filas: [] }); setMsj({ t: 'error', m: e.message }); });
  useEffect(() => { cargar(); }, []);

  async function concepto(f, accion) {
    let resultado;
    if (accion === 'REGISTRAR') {
      const r0 = await dlg.pedir({
        titulo: `Concepto de rehabilitación · ${f.numero_caso}`,
        descripcion: `${f.colaborador} acumula ${f.dias_acumulados} días. Registre el concepto emitido por la EPS.`,
        textoAceptar: 'Registrar concepto',
        campos: [{ nombre: 'resultado', etiqueta: 'Concepto', tipo: 'select', requerido: true,
          opciones: [['FAVORABLE', 'Favorable'], ['DESFAVORABLE', 'Desfavorable']] }],
      });
      if (!r0) return;
      resultado = r0.resultado;
    }
    try {
      const r = await api(`/incapacidades/${f.incapacidad_id}/concepto-rehabilitacion`, { method: 'POST', body: { accion, resultado } });
      setMsj({ t: 'ok', m: r.mensaje });
      cargar();
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
  }

  async function suspender(f) {
    const ok = await dlg.confirmar(`Suspender pago por nómina · ${f.colaborador}`,
      `Acumula ${f.dias_acumulados} días. Se notificará al colaborador que desde el día 181 debe tramitar el pago ante su fondo de pensiones, y a nómina la novedad.`,
      { textoAceptar: 'Notificar suspensión', peligro: true });
    if (!ok) return;
    try {
      const r = await api(`/incapacidades/${f.incapacidad_id}/suspension-nomina`, { method: 'POST', body: {} });
      setMsj({ t: 'ok', m: r.mensaje });
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
  }

  async function predecir() {
    setCargandoIA(true);
    try { setPrediccion(await api('/ia/prediccion-180', { method: 'POST', body: {} })); }
    catch (e) { setMsj({ t: 'error', m: e.message }); }
    finally { setCargandoIA(false); }
  }

  const filas = reporte?.filas || [];
  const marcas = filas.map((f) => ({ id: f.incapacidad_id, dias: f.dias_acumulados, etiqueta: `${f.numero_caso} · ${f.colaborador}` }));

  return (
    <div>
      <Encabezado titulo="Monitoreo de días acumulados"
        descripcion="Casos activos que se acercan a los hitos legales de 90, 120, 150 y 180 días, sumando las prórrogas." />
      <Aviso msj={msj} onCerrar={() => setMsj(null)} />

      <Panel titulo="Regla de 180 días" sub={reporte ? `${filas.length} caso(s) con 90 días o más acumulados` : 'Cargando…'}>
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
                {filas.map((f) => {
                  const c = f.concepto_rehabilitacion;
                  return (
                    <tr key={f.incapacidad_id} className={f.requiere_suspension_nomina || f.vencido_concepto_120 ? 'fila-alerta' : ''}>
                      <td><span className="caso">{f.numero_caso}</span><span className="secundario-texto">{f.colaborador}</span></td>
                      <td>{f.entidad}</td>
                      <td><MiniRegla dias={f.dias_acumulados} /></td>
                      <td>
                        {c
                          ? <>
                              <span className={`sello ${c.resultado === 'DESFAVORABLE' ? 'alerta' : c.resultado ? 'cerrado' : 'pendiente'}`}>
                                {c.resultado ? c.resultado.toLowerCase() : 'Solicitado'}
                              </span>
                              <span className="secundario-texto">
                                {c.enviado_afp ? <><Check size={13} aria-hidden="true" /> Enviado al fondo el {fecha(c.fecha_envio_afp)}</> : `Solicitado el ${fecha(c.fecha_solicitud)}`}
                              </span>
                            </>
                          : f.vencido_concepto_120
                            ? <span className="texto-alerta">Superó el día 120 sin concepto</span>
                            : <span className="texto-tenue">Sin solicitar</span>}
                      </td>
                      <td>
                        <div className="acciones">
                          {!c && <button onClick={() => concepto(f, 'SOLICITAR')}>Solicitar concepto</button>}
                          {c && !c.resultado && <button className="secundario" onClick={() => concepto(f, 'REGISTRAR')}>Registrar concepto</button>}
                          {f.pendiente_envio_afp && <button className="secundario" onClick={() => concepto(f, 'ENVIAR_AFP')}>Enviar al fondo de pensiones</button>}
                          {f.requiere_suspension_nomina && <button className="peligro" onClick={() => suspender(f)}>Suspender pago por nómina</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : reporte && (
          <Vacio icono={Activity} titulo="Ningún colaborador llega a 90 días">
            Cuando un caso, sumando sus prórrogas, llegue al día 90, aparecerá aquí con las acciones de cada hito.
          </Vacio>
        )}
      </Panel>

      <PanelIA
        titulo="Predicción de casos que superarían 180 días"
        descripcion="La IA estima el riesgo de cada caso activo según días acumulados, prórrogas, tipo de novedad y diagnóstico agrupado."
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
