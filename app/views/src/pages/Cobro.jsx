// Vista Cobro (CU-17, 18, 19, 31, 32) - tablero de cartera por entidad
import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Cobro() {
  const [tablero, setTablero] = useState({});
  const [msj, setMsj] = useState(null);

  const cargar = () => api('/cobro/tablero').then(setTablero).catch((e) => setMsj({ t: 'error', m: e.message }));
  useEffect(() => { cargar(); }, []);

  const accion = (fn) => async (...args) => {
    try { await fn(...args); cargar(); } catch (e) { setMsj({ t: 'error', m: e.message }); }
  };

  const aceptar = accion(async (c) => {
    const fecha = prompt('CU-31 · Fecha promesa de pago notificada por la entidad (YYYY-MM-DD):');
    if (!fecha) return;
    await api(`/incapacidades/${c.id}/aceptacion`, { method: 'POST', body: { fecha_promesa_pago: fecha } });
    setMsj({ t: 'ok', m: 'Aceptación registrada. Alerta programada para la fecha promesa.' });
  });

  const rechazarEntidad = accion(async (c) => {
    const causal = prompt('Causal del rechazo notificado por la entidad:');
    if (causal === null) return;
    await api(`/incapacidades/${c.id}/aceptacion`, { method: 'POST', body: { rechazo: true, causal } });
    setMsj({ t: 'info', m: 'Rechazo registrado: subsanar y solicitar nueva transcripción.' });
  });

  const solicitarPago = accion(async (c) => {
    await api(`/incapacidades/${c.id}/solicitar-pago`, {
      method: 'POST',
      body: { evidencia_url: `evidencias/solicitud_pago_${c.numero_caso}.pdf` },
    });
    setMsj({ t: 'ok', m: `Solicitud de pago registrada (CU-17). Caso ${c.numero_caso} en COBRADA.` });
  });

  const seguimiento = accion(async (c) => {
    const obs = prompt('CU-18 · Observación del seguimiento en el canal de la entidad:', 'Consulta semanal del estado');
    if (obs === null) return;
    const r = await api(`/incapacidades/${c.id}/seguimiento`, {
      method: 'POST',
      body: { estado_consultado: c.estado, observacion: obs, evidencia_url: `evidencias/seguimiento_${c.numero_caso}.pdf` },
    });
    setMsj({ t: r.cobro_vencido ? 'info' : 'ok', m: r.sugerencia || 'Seguimiento registrado.' });
  });

  const requerimiento = accion(async (c) => {
    const r = await api(`/incapacidades/${c.id}/requerimiento`, {
      method: 'POST',
      body: { evidencia_url: `evidencias/requerimiento_${c.numero_caso}.pdf` },
    });
    setMsj({
      t: r.ofrecer_cobro_juridico ? 'info' : 'ok',
      m: `Requerimiento Nº ${r.requerimiento_numero} registrado (${r.dias_cobro} días de cobro). ${r.sugerencia || ''}`,
    });
  });

  const trasladar = accion(async (c) => {
    const causal = prompt('CU-20 · Causal del traslado a jurídica:', 'Incumplimiento del tiempo promesa de pago');
    if (causal === null) return;
    await api(`/incapacidades/${c.id}/trasladar-juridica`, { method: 'POST', body: { causal } });
    setMsj({ t: 'ok', m: 'Expediente trasladado al Área Jurídica.' });
  });

  const pago = accion(async (c) => {
    const valor = prompt(`CU-32 · Valor pagado por ${c.entidad?.nombre} (esperado: ${c.valor_solicitado}):`, c.valor_solicitado);
    if (!valor) return;
    await api(`/incapacidades/${c.id}/pago`, {
      method: 'POST',
      body: { valor: Number(valor), fecha_pago: new Date().toISOString().slice(0, 10), soporte_url: `soportes/liquidacion_${c.numero_caso}.pdf` },
    });
    setMsj({ t: 'ok', m: 'Pago notificado, pendiente de conciliación (CU-24).' });
  });

  return (
    <div>
      <h2>Tablero de cartera por entidad (CU-18)</h2>
      {msj && <div className={`alerta ${msj.t}`}>{msj.m}</div>}
      {Object.entries(tablero).map(([entidad, info]) => (
        <div className="tarjeta" key={entidad}>
          <h3>{entidad} — saldo adeudado: ${Number(info.saldo_adeudado).toLocaleString()}</h3>
          <table>
            <thead><tr><th>Caso</th><th>Estado</th><th>Días</th><th>Promesa pago</th><th>Saldo</th><th>Acciones</th></tr></thead>
            <tbody>
              {info.casos.map((c) => (
                <tr key={c.id} style={c.cobro_vencido ? { background: '#fef2f2' } : undefined}>
                  <td>{c.numero_caso}<br /><small>{c.colaborador?.usuario?.nombre}</small></td>
                  <td><span className={`estado ${c.estado}`}>{c.estado.replaceAll('_', ' ')}</span></td>
                  <td>{c.dias_transcurridos}</td>
                  <td>{c.fecha_promesa_pago || '—'}{c.cobro_vencido && <b style={{ color: '#c0392b' }}> VENCIDO</b>}</td>
                  <td>${Number(c.saldo).toLocaleString()}</td>
                  <td>
                    {['RADICADA', 'TRANSCRITA'].includes(c.estado) && <>
                      <button onClick={() => aceptar(c)}>Aceptación (CU-31)</button>
                      <button className="peligro" onClick={() => rechazarEntidad(c)}>Rechazo</button>
                    </>}
                    {c.estado === 'ACEPTADA' && <button onClick={() => solicitarPago(c)}>Solicitar pago</button>}
                    {['COBRADA', 'EN_COBRO_PERSUASIVO'].includes(c.estado) && <>
                      <button className="secundario" onClick={() => seguimiento(c)}>Seguimiento</button>
                      <button onClick={() => requerimiento(c)}>Requerimiento</button>
                      <button onClick={() => pago(c)}>Registrar pago</button>
                    </>}
                    {c.estado === 'EN_COBRO_PERSUASIVO' && <button className="peligro" onClick={() => trasladar(c)}>→ Jurídica</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {!Object.keys(tablero).length && <div className="tarjeta">No hay casos en etapa de cobro.</div>}
    </div>
  );
}
