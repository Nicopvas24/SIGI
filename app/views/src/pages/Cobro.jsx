// Vista Cobro - cartera por entidad
import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { api, formulario, sesion } from '../api.js';
import { Aviso, Encabezado, Estado, Panel, Vacio, dinero, fecha, hoy, useDialogo } from '../ui.jsx';

export default function Cobro() {
  const dlg = useDialogo();
  const esAuxiliar = ['AUXILIAR', 'ADMIN'].includes(sesion()?.usuario?.rol);
  const [tablero, setTablero] = useState(null);
  const [msj, setMsj] = useState(null);

  const cargar = () => api('/cobro/tablero').then(setTablero).catch((e) => { setTablero({}); setMsj({ t: 'error', m: e.message }); });
  useEffect(() => { cargar(); }, []);

  const accion = (fn) => async (c) => {
    try {
      const r = await fn(c);
      if (r) { setMsj({ t: r.ofrecer_cobro_juridico || r.cobro_vencido ? 'info' : 'ok', m: r.mensaje }); cargar(); }
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
  };

  const respuesta = accion(async (c) => {
    const r0 = await dlg.pedir({
      titulo: `Respuesta de ${c.entidad?.nombre} · ${c.numero_caso}`,
      descripcion: 'Registre lo que la entidad notificó al correo autorizado de la empresa.',
      textoAceptar: 'Registrar respuesta',
      campos: [
        { nombre: 'resultado', etiqueta: 'Resultado', tipo: 'select', vacio: false, requerido: true, valor: 'ACEPTADA',
          opciones: [['ACEPTADA', 'Aceptó la incapacidad'], ['RECHAZADA', 'Rechazó la incapacidad']] },
        { nombre: 'fecha_promesa_pago', etiqueta: 'Fecha promesa de pago (si la aceptó)', tipo: 'date' },
        { nombre: 'causal', etiqueta: 'Causal del rechazo (si la rechazó)', tipo: 'textarea' },
      ],
    });
    if (!r0) return null;
    if (r0.resultado === 'RECHAZADA') {
      return api(`/incapacidades/${c.id}/aceptacion`, { method: 'POST', body: { rechazo: true, causal: r0.causal } });
    }
    return api(`/incapacidades/${c.id}/aceptacion`, { method: 'POST', body: { fecha_promesa_pago: r0.fecha_promesa_pago } });
  });

  const solicitarPago = accion(async (c) => {
    const r0 = await dlg.pedir({
      titulo: `Solicitar pago · ${c.numero_caso}`,
      descripcion: `Diligencie el formulario de prestaciones económicas de ${c.entidad?.nombre} y adjunte la constancia de envío.`,
      textoAceptar: 'Registrar solicitud',
      campos: [
        { nombre: 'valor_solicitado', etiqueta: 'Valor solicitado (COP)', tipo: 'number', min: 1, step: 1, requerido: true,
          valor: Number(c.valor_solicitado) || '', ayuda: 'Calculado en el formato de seguimiento. Corríjalo si la liquidación de la entidad es distinta.' },
        { nombre: 'evidencia', etiqueta: 'Constancia de envío', tipo: 'file', requerido: true },
      ],
    });
    if (!r0) return null;
    const { evidencia, ...campos } = r0;
    return api(`/incapacidades/${c.id}/solicitar-pago`, { method: 'POST', formData: formulario(campos, { evidencia }) });
  });

  const seguimiento = accion(async (c) => {
    const r0 = await dlg.pedir({
      titulo: `Seguimiento · ${c.numero_caso}`,
      descripcion: `Consulte el estado del pago en el canal de ${c.entidad?.nombre}.`,
      textoAceptar: 'Registrar seguimiento',
      campos: [
        { nombre: 'observacion', etiqueta: 'Qué respondió la entidad', tipo: 'textarea', requerido: true },
        { nombre: 'evidencia', etiqueta: 'Evidencia', tipo: 'file' },
      ],
    });
    if (!r0) return null;
    const { evidencia, ...campos } = r0;
    return api(`/incapacidades/${c.id}/seguimiento`, { method: 'POST', formData: formulario(campos, { evidencia }) });
  });

  const requerimiento = accion(async (c) => {
    const r0 = await dlg.pedir({
      titulo: `Requerimiento de cobro Nº ${c.requerimientos + 1} · ${c.numero_caso}`,
      descripcion: 'El sistema redacta el requerimiento con los fundamentos de hecho y de derecho. Envíelo a la entidad y adjunte la constancia.',
      textoAceptar: 'Registrar requerimiento',
      campos: [
        { nombre: 'evidencia', etiqueta: 'Constancia de envío', tipo: 'file' },
        { nombre: 'deterioro_crediticio', etiqueta: 'Situación de la entidad', tipo: 'select', vacio: false, valor: 'false',
          opciones: [['false', 'Normal'], ['true', 'Insolvente o en liquidación']] },
      ],
    });
    if (!r0) return null;
    const { evidencia, ...campos } = r0;
    const r = await api(`/incapacidades/${c.id}/requerimiento`, { method: 'POST', formData: formulario(campos, { evidencia }) });
    await dlg.confirmar(`Requerimiento Nº ${r.requerimiento_numero}`, r.texto, { textoAceptar: 'Entendido' });
    return r;
  });

  const trasladar = accion(async (c) => {
    const causal = await dlg.pedirTexto(`Trasladar a jurídica · ${c.numero_caso}`, 'Causal del traslado', 'Incumplimiento del tiempo promesa de pago', {
      descripcion: `Se han enviado ${c.requerimientos} requerimiento(s). Jurídica decidirá si se recupera o se da de baja.`,
      campo: { tipo: 'textarea' }, textoAceptar: 'Trasladar expediente', peligro: true,
    });
    if (!causal) return null;
    return api(`/incapacidades/${c.id}/trasladar-juridica`, { method: 'POST', body: { causal } });
  });

  const pago = accion(async (c) => {
    const r0 = await dlg.pedir({
      titulo: `Registrar pago · ${c.numero_caso}`,
      descripcion: `Saldo por cobrar: ${dinero(c.saldo)}. El pago queda pendiente de conciliar con Contabilidad.`,
      textoAceptar: 'Registrar pago',
      campos: [
        { nombre: 'valor', etiqueta: 'Valor pagado (COP)', tipo: 'number', valor: c.saldo, requerido: true, min: 1, step: 1 },
        { nombre: 'fecha_pago', etiqueta: 'Fecha de pago', tipo: 'date', valor: hoy(), requerido: true },
        { nombre: 'soporte', etiqueta: 'Soporte de liquidación de la entidad', tipo: 'file', ayuda: 'Sin este soporte la incapacidad no se podrá archivar.' },
      ],
    });
    if (!r0) return null;
    const { soporte, ...campos } = r0;
    return api(`/incapacidades/${c.id}/pago`, { method: 'POST', formData: formulario(campos, { soporte }) });
  });

  const entidades = Object.entries(tablero || {});
  const total = entidades.reduce((s, [, i]) => s + Number(i.saldo_adeudado || 0), 0);

  return (
    <div>
      <Encabezado titulo="Cartera por entidad"
        descripcion="Casos radicados ante EPS y ARL: respuesta de la entidad, solicitud de pago, seguimiento semanal y cobro persuasivo.">
        {entidades.length > 0 && <span className="cifra"><small>Total adeudado</small>{dinero(total)}</span>}
      </Encabezado>
      <Aviso msj={msj} onCerrar={() => setMsj(null)} />

      {entidades.map(([entidad, info]) => (
        <Panel key={entidad} titulo={entidad} sub={`${info.casos.length} caso(s)`} cuerpo={false}
          extra={<span className="cifra"><small>Saldo</small>{dinero(info.saldo_adeudado)}</span>}>
          <div className="tabla-wrap">
            <table>
              <thead><tr><th>Caso</th><th>Estado</th><th>Promesa de pago</th><th className="num">Días de cobro</th><th className="num">Saldo</th>{esAuxiliar && <th className="th-acciones">Acciones</th>}</tr></thead>
              <tbody>
                {info.casos.map((c) => (
                  <tr key={c.id} className={c.cobro_vencido ? 'fila-alerta' : ''}>
                    <td><span className="caso">{c.numero_caso}</span><span className="secundario-texto">{c.colaborador?.usuario?.nombre}</span></td>
                    <td>
                      <Estado valor={c.estado} />
                      {c.requerimientos > 0 && <span className="secundario-texto">{c.requerimientos} requerimiento(s)</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {fecha(c.fecha_promesa_pago)}
                      {c.cobro_vencido && <span className="secundario-texto texto-alerta">Vencida</span>}
                    </td>
                    <td className="num">{c.dias_cobro ?? '—'}</td>
                    <td className="num"><b>{dinero(c.saldo)}</b></td>
                    {esAuxiliar && (
                      <td>
                        <div className="acciones">
                          {c.estado === 'RADICADA' && <button onClick={() => respuesta(c)}>Registrar respuesta</button>}
                          {c.estado === 'ACEPTADA' && <button onClick={() => solicitarPago(c)}>Solicitar pago</button>}
                          {['COBRADA', 'EN_COBRO_PERSUASIVO', 'EN_COBRO_JURIDICO'].includes(c.estado) &&
                            <button className="secundario" onClick={() => seguimiento(c)}>Seguimiento</button>}
                          {['COBRADA', 'EN_COBRO_PERSUASIVO'].includes(c.estado) &&
                            <button className="secundario" onClick={() => requerimiento(c)}>Requerimiento</button>}
                          {c.estado === 'EN_COBRO_PERSUASIVO' && c.requerimientos >= 2 &&
                            <button className="peligro" onClick={() => trasladar(c)}>Trasladar a jurídica</button>}
                          {['COBRADA', 'EN_COBRO_PERSUASIVO', 'EN_COBRO_JURIDICO'].includes(c.estado) &&
                            <button onClick={() => pago(c)}>Registrar pago</button>}
                          {c.estado === 'PAGO_NOTIFICADO' && <span className="texto-tenue">Por conciliar</span>}
                        </div>
                      </td>
                    )}
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
            Un caso entra a cartera cuando queda radicado ante la entidad.
          </Vacio>
        </Panel>
      )}
    </div>
  );
}
