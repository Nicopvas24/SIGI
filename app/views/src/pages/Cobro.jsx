// Vista Cobro (CU-17, 18, 19, 31, 32) - tablero de cartera por entidad
import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { api } from '../api.js';
import { Aviso, Encabezado, Estado, Panel, Vacio, dinero, fecha, useDialogo } from '../ui.jsx';

const hoy = () => new Date().toISOString().slice(0, 10);

export default function Cobro() {
  const dlg = useDialogo();
  const [tablero, setTablero] = useState(null);
  const [msj, setMsj] = useState(null);

  const cargar = () => api('/cobro/tablero').then(setTablero).catch((e) => { setTablero({}); setMsj({ t: 'error', m: e.message }); });
  useEffect(() => { cargar(); }, []);

  const accion = (fn) => async (...args) => {
    try { await fn(...args); cargar(); } catch (e) { setMsj({ t: 'error', m: e.message }); }
  };

  const aceptar = accion(async (c) => {
    const f = await dlg.pedirTexto(`Aceptación · ${c.numero_caso}`, 'Fecha promesa de pago', '', {
      descripcion: `Fecha notificada por ${c.entidad?.nombre || 'la entidad'}. Se programará una alerta para ese día.`,
      campo: { tipo: 'date' }, textoAceptar: 'Registrar aceptación',
    });
    if (!f) return;
    await api(`/incapacidades/${c.id}/aceptacion`, { method: 'POST', body: { fecha_promesa_pago: f } });
    setMsj({ t: 'ok', m: `Aceptación registrada. Alerta programada para el ${fecha(f)}.` });
  });

  const rechazarEntidad = accion(async (c) => {
    const causal = await dlg.pedirTexto(`Rechazo · ${c.numero_caso}`, 'Causal del rechazo', '', {
      descripcion: 'Causal notificada por la entidad. El caso vuelve a transcripción para subsanar.',
      campo: { tipo: 'textarea' }, textoAceptar: 'Registrar rechazo', peligro: true,
    });
    if (causal === null) return;
    await api(`/incapacidades/${c.id}/aceptacion`, { method: 'POST', body: { rechazo: true, causal } });
    setMsj({ t: 'info', m: 'Rechazo registrado: subsane y solicite una nueva transcripción.' });
  });

  const solicitarPago = accion(async (c) => {
    await api(`/incapacidades/${c.id}/solicitar-pago`, { method: 'POST', body: { evidencia_url: `evidencias/solicitud_pago_${c.numero_caso}.pdf` } });
    setMsj({ t: 'ok', m: `Solicitud de pago registrada. ${c.numero_caso} pasa a cobrada.` });
  });

  const seguimiento = accion(async (c) => {
    const obs = await dlg.pedirTexto(`Seguimiento · ${c.numero_caso}`, 'Observación', 'Consulta semanal del estado', {
      descripcion: 'Lo que se consultó en el canal de la entidad.', campo: { tipo: 'textarea' }, textoAceptar: 'Registrar',
    });
    if (obs === null) return;
    const r = await api(`/incapacidades/${c.id}/seguimiento`, {
      method: 'POST',
      body: { estado_consultado: c.estado, observacion: obs, evidencia_url: `evidencias/seguimiento_${c.numero_caso}.pdf` },
    });
    setMsj({ t: r.cobro_vencido ? 'info' : 'ok', m: r.sugerencia || 'Seguimiento registrado.' });
  });

  const requerimiento = accion(async (c) => {
    const r = await api(`/incapacidades/${c.id}/requerimiento`, { method: 'POST', body: { evidencia_url: `evidencias/requerimiento_${c.numero_caso}.pdf` } });
    setMsj({ t: r.ofrecer_cobro_juridico ? 'info' : 'ok', m: `Requerimiento Nº ${r.requerimiento_numero} registrado (${r.dias_cobro} días de cobro). ${r.sugerencia || ''}` });
  });

  const trasladar = accion(async (c) => {
    const causal = await dlg.pedirTexto(`Trasladar a jurídica · ${c.numero_caso}`, 'Causal del traslado', 'Incumplimiento del tiempo promesa de pago', {
      campo: { tipo: 'textarea' }, textoAceptar: 'Trasladar expediente',
    });
    if (causal === null) return;
    await api(`/incapacidades/${c.id}/trasladar-juridica`, { method: 'POST', body: { causal } });
    setMsj({ t: 'ok', m: 'Expediente trasladado al área jurídica.' });
  });

  const pago = accion(async (c) => {
    const r0 = await dlg.pedir({
      titulo: `Registrar pago · ${c.numero_caso}`,
      descripcion: `Valor esperado: ${dinero(c.valor_solicitado)}. Queda pendiente de conciliación con Contabilidad.`,
      textoAceptar: 'Registrar pago',
      campos: [
        { nombre: 'valor', etiqueta: 'Valor pagado (COP)', tipo: 'number', valor: c.valor_solicitado, requerido: true, min: 0, step: 1 },
        { nombre: 'fecha', etiqueta: 'Fecha de pago', tipo: 'date', valor: hoy(), requerido: true },
      ],
    });
    if (!r0) return;
    await api(`/incapacidades/${c.id}/pago`, {
      method: 'POST',
      body: { valor: Number(r0.valor), fecha_pago: r0.fecha, soporte_url: `soportes/liquidacion_${c.numero_caso}.pdf` },
    });
    setMsj({ t: 'ok', m: 'Pago notificado, pendiente de conciliación.' });
  });

  const entidades = Object.entries(tablero || {});
  const total = entidades.reduce((s, [, i]) => s + Number(i.saldo_adeudado || 0), 0);

  return (
    <div>
      <Encabezado
        titulo="Cartera por entidad"
        descripcion="Saldos pendientes de pago por EPS y ARL, con la siguiente gestión de cobro de cada caso."
        refs={['CU-17', 'CU-19', 'CU-31', 'CU-32']}
      >
        {entidades.length > 0 && <span className="cifra"><small>Total adeudado</small>{dinero(total)}</span>}
      </Encabezado>
      <Aviso msj={msj} onCerrar={() => setMsj(null)} />

      {entidades.map(([entidad, info]) => (
        <Panel key={entidad} titulo={entidad} sub={`${info.casos.length} caso(s) en cobro`} cuerpo={false}
          extra={<span className="cifra"><small>Saldo</small>{dinero(info.saldo_adeudado)}</span>}>
          <div className="tabla-wrap">
            <table>
              <thead><tr><th>Caso</th><th>Estado</th><th className="num">Días</th><th>Promesa de pago</th><th className="num">Saldo</th><th className="th-acciones">Acciones</th></tr></thead>
              <tbody>
                {info.casos.map((c) => (
                  <tr key={c.id} className={c.cobro_vencido ? 'fila-alerta' : ''}>
                    <td><span className="caso">{c.numero_caso}</span><span className="secundario-texto">{c.colaborador?.usuario?.nombre}</span></td>
                    <td><Estado valor={c.estado} /></td>
                    <td className="num">{c.dias_transcurridos}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {fecha(c.fecha_promesa_pago)}
                      {c.cobro_vencido && <span className="secundario-texto texto-alerta">Promesa vencida</span>}
                    </td>
                    <td className="num"><b>{dinero(c.saldo)}</b></td>
                    <td>
                      <div className="acciones">
                        {['RADICADA', 'TRANSCRITA'].includes(c.estado) && <>
                          <button className="peligro" onClick={() => rechazarEntidad(c)}>Rechazo</button>
                          <button onClick={() => aceptar(c)}>Aceptación</button>
                        </>}
                        {c.estado === 'ACEPTADA' && <button onClick={() => solicitarPago(c)}>Solicitar pago</button>}
                        {['COBRADA', 'EN_COBRO_PERSUASIVO'].includes(c.estado) && <>
                          <button className="secundario" onClick={() => seguimiento(c)}>Seguimiento</button>
                          <button className="secundario" onClick={() => requerimiento(c)}>Requerimiento</button>
                          <button onClick={() => pago(c)}>Registrar pago</button>
                        </>}
                        {c.estado === 'EN_COBRO_PERSUASIVO' && <button className="peligro" onClick={() => trasladar(c)}>Trasladar a jurídica</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ))}
      {tablero && !entidades.length && (
        <Panel cuerpo={false}>
          <Vacio icono={Wallet} titulo="No hay casos en etapa de cobro">
            Un caso entra a cartera cuando queda radicado ante la entidad. Desde aquí se registra la aceptación, la solicitud de pago y el seguimiento.
          </Vacio>
        </Panel>
      )}
    </div>
  );
}
