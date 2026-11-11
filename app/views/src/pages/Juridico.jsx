// Vista Cobro jurídico (CU-20 a CU-23)
import { useEffect, useState } from 'react';
import { Building2, Gavel } from 'lucide-react';
import { api, sesion } from '../api.js';
import { Aviso, Encabezado, Estado, Panel, Vacio, dinero, fecha, useDialogo } from '../ui.jsx';

const RESULTADO = { FAVORABLE: 'cerrado', DESFAVORABLE: 'alerta', SIN_RESPUESTA: 'pendiente' };

export default function Juridico() {
  const rol = sesion()?.usuario?.rol;
  const esJuridica = rol === 'JURIDICA' || rol === 'ADMIN';
  const dlg = useDialogo();
  const [casos, setCasos] = useState(null);
  const [msj, setMsj] = useState(null);

  const cargar = () => api('/juridico/casos').then(setCasos).catch((e) => { setCasos([]); setMsj({ t: 'error', m: e.message }); });
  useEffect(() => { cargar(); }, []);

  const accion = (fn) => async (...args) => {
    try { await fn(...args); cargar(); } catch (e) { setMsj({ t: 'error', m: e.message }); }
  };

  const decidir = accion(async (c, decision) => {
    if (decision === 'DAR_DE_BAJA' && !(await dlg.confirmar(`Dar de baja ${c.numero_caso}`,
      'El saldo se dará por no recuperable y se notificará a Contabilidad. Esta decisión cierra el cobro.',
      { textoAceptar: 'Dar de baja', peligro: true }))) return;
    const r = await api(`/incapacidades/${c.id}/decision-juridica`, { method: 'POST', body: { decision } });
    setMsj({ t: 'ok', m: r.mensaje || `Caso ${c.numero_caso} dado de baja; Contabilidad notificada.` });
  });

  const peticion = accion(async (c) => {
    const r0 = await dlg.pedir({
      titulo: `Derecho de petición · ${c.numero_caso}`,
      descripcion: 'La entidad tiene 15 días hábiles para responder desde la radicación.',
      textoAceptar: 'Radicar petición',
      campos: [
        { nombre: 'radicado', etiqueta: 'Número de radicado', requerido: true },
        { nombre: 'causal', etiqueta: 'Causal de negación que se controvierte', valor: 'Rechazo improcedente', tipo: 'textarea' },
      ],
    });
    if (!r0) return;
    const r = await api(`/incapacidades/${c.id}/derecho-peticion`, { method: 'POST', body: { radicado: r0.radicado, causal_negacion: r0.causal } });
    setMsj({ t: 'ok', m: `Derecho de petición radicado. El término vence el ${fecha(r.vencimiento_termino)}.` });
  });

  const tutela = accion(async (c) => {
    const r0 = await dlg.pedir({
      titulo: `Acción de tutela · ${c.numero_caso}`,
      descripcion: 'Procede solo si el derecho de petición fue negado o no tuvo respuesta.',
      textoAceptar: 'Radicar tutela',
      campos: [
        { nombre: 'radicado', etiqueta: 'Número de proceso', requerido: true },
        { nombre: 'juzgado', etiqueta: 'Juzgado', requerido: true },
      ],
    });
    if (!r0) return;
    await api(`/incapacidades/${c.id}/accion-tutela`, { method: 'POST', body: r0 });
    setMsj({ t: 'ok', m: 'Acción de tutela radicada.' });
  });

  const resultado = accion(async (p, res) => {
    const r = await api(`/procesos/${p.id}/resultado`, { method: 'POST', body: { resultado: res } });
    setMsj({ t: 'info', m: r.sugerencia });
  });

  return (
    <div>
      <Encabezado
        titulo="Cobro jurídico"
        descripcion="Expedientes trasladados por incumplimiento de pago: decisión, derecho de petición y tutela."
        refs={['CU-20', 'CU-23']}
      />
      <Aviso msj={msj} onCerrar={() => setMsj(null)} />

      <Panel titulo="Expedientes en jurídica" sub={casos ? `${casos.length} expediente(s)` : 'Cargando…'} cuerpo={false}>
        {casos?.length ? (
          <ul className="expedientes">
            {casos.map((c) => {
              const gestiones = c.gestiones || [];
              return (
                <li key={c.id}>
                  <div className="exp-cabeza">
                    <div>
                      <div className="exp-titulo">
                        <span className="caso">{c.numero_caso}</span>
                        <b>{c.colaborador?.usuario?.nombre}</b>
                        <Estado valor={c.estado} />
                      </div>
                      <div className="exp-meta">
                        <span><Building2 size={14} aria-hidden="true" />{c.entidad?.nombre}</span>
                        <span>Saldo <b>{dinero(Number(c.valor_solicitado || 0) - Number(c.valor_pagado || 0))}</b></span>
                        <span>{gestiones.length} gestión(es) · {gestiones.filter((g) => g.tipo === 'REQUERIMIENTO').length} requerimiento(s) · {(c.documentos || []).length} soporte(s)</span>
                      </div>
                    </div>
                    {esJuridica && c.estado === 'EN_COBRO_JURIDICO' && (
                      <div className="acciones">
                        <button className="peligro" onClick={() => decidir(c, 'DAR_DE_BAJA')}>Dar de baja</button>
                        <button className="secundario" onClick={() => tutela(c)}>Acción de tutela</button>
                        <button className="secundario" onClick={() => peticion(c)}>Derecho de petición</button>
                        <button onClick={() => decidir(c, 'RECUPERAR')}>Decidir recuperar</button>
                      </div>
                    )}
                  </div>

                  {(c.procesos || []).length > 0 && (
                    <div className="sub-tabla tabla-wrap">
                      <table>
                        <thead><tr><th>Acción</th><th>Radicado</th><th>Vence</th><th>Resultado</th>{esJuridica && <th className="th-acciones">Registrar</th>}</tr></thead>
                        <tbody>
                          {c.procesos.map((p) => (
                            <tr key={p.id}>
                              <td>{p.tipo === 'DERECHO_PETICION' ? 'Derecho de petición' : 'Acción de tutela'}</td>
                              <td>{p.radicado}{p.juzgado && <span className="secundario-texto">{p.juzgado}</span>}</td>
                              <td style={{ whiteSpace: 'nowrap' }}>{fecha(p.vencimiento_termino)}</td>
                              <td>{p.resultado
                                ? <span className={`sello ${RESULTADO[p.resultado] || 'neutro'}`}>{p.resultado.replaceAll('_', ' ')}</span>
                                : <span className="texto-tenue">Pendiente</span>}</td>
                              {esJuridica && <td>{!p.resultado && (
                                <div className="acciones">
                                  <button className="fantasma" onClick={() => resultado(p, 'SIN_RESPUESTA')}>Sin respuesta</button>
                                  <button className="peligro" onClick={() => resultado(p, 'DESFAVORABLE')}>Desfavorable</button>
                                  <button className="secundario" onClick={() => resultado(p, 'FAVORABLE')}>Favorable</button>
                                </div>
                              )}</td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : casos && (
          <Vacio icono={Gavel} titulo="No hay expedientes en cobro jurídico">
            Un caso llega aquí cuando Cobro lo traslada tras el cobro persuasivo sin pago.
          </Vacio>
        )}
      </Panel>
    </div>
  );
}
