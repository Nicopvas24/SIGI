// Vista Cobro jurídico (CU-20 a CU-23)
import { useEffect, useState } from 'react';
import { api, sesion } from '../api.js';

export default function Juridico() {
  const rol = sesion()?.usuario?.rol;
  const esJuridica = rol === 'JURIDICA' || rol === 'ADMIN';
  const [casos, setCasos] = useState([]);
  const [msj, setMsj] = useState(null);

  const cargar = () => api('/juridico/casos').then(setCasos).catch((e) => setMsj({ t: 'error', m: e.message }));
  useEffect(() => { cargar(); }, []);

  const accion = (fn) => async (...args) => {
    try { await fn(...args); cargar(); } catch (e) { setMsj({ t: 'error', m: e.message }); }
  };

  const decidir = accion(async (c, decision) => {
    const r = await api(`/incapacidades/${c.id}/decision-juridica`, { method: 'POST', body: { decision } });
    setMsj({ t: 'ok', m: r.mensaje || `Caso ${c.numero_caso} dado de baja; Contabilidad notificada.` });
  });

  const peticion = accion(async (c) => {
    const radicado = prompt('CU-22 · Número de radicado del derecho de petición:');
    if (!radicado) return;
    const causal = prompt('Causal de negación que se controvierte:', 'Rechazo improcedente');
    const r = await api(`/incapacidades/${c.id}/derecho-peticion`, {
      method: 'POST', body: { radicado, causal_negacion: causal },
    });
    setMsj({ t: 'ok', m: `Derecho de petición radicado. Vence el término: ${r.vencimiento_termino} (15 días hábiles).` });
  });

  const tutela = accion(async (c) => {
    const radicado = prompt('CU-23 · Número de proceso de la tutela:');
    if (!radicado) return;
    const juzgado = prompt('Juzgado:');
    await api(`/incapacidades/${c.id}/accion-tutela`, { method: 'POST', body: { radicado, juzgado } });
    setMsj({ t: 'ok', m: 'Acción de tutela radicada.' });
  });

  const resultado = accion(async (p, res) => {
    const r = await api(`/procesos/${p.id}/resultado`, { method: 'POST', body: { resultado: res } });
    setMsj({ t: 'info', m: r.sugerencia });
  });

  return (
    <div>
      <h2>Cobro jurídico (CU-20 a CU-23)</h2>
      {msj && <div className={`alerta ${msj.t}`}>{msj.m}</div>}
      {casos.map((c) => (
        <div className="tarjeta" key={c.id}>
          <b>{c.numero_caso}</b> · {c.colaborador?.usuario?.nombre} · {c.entidad?.nombre} ·{' '}
          saldo ${(Number(c.valor_solicitado || 0) - Number(c.valor_pagado || 0)).toLocaleString()} ·{' '}
          <span className={`estado ${c.estado}`}>{c.estado.replaceAll('_', ' ')}</span>

          <div style={{ margin: '10px 0', fontSize: 13 }}>
            <b>Expediente:</b> {(c.gestiones || []).length} gestión(es) ·{' '}
            {(c.gestiones || []).filter((g) => g.tipo === 'REQUERIMIENTO').length} requerimiento(s) ·{' '}
            {(c.documentos || []).length} soporte(s)
          </div>

          {(c.procesos || []).length > 0 && (
            <table style={{ marginBottom: 10 }}>
              <thead><tr><th>Acción</th><th>Radicado</th><th>Vence</th><th>Resultado</th><th></th></tr></thead>
              <tbody>
                {c.procesos.map((p) => (
                  <tr key={p.id}>
                    <td>{p.tipo.replaceAll('_', ' ')}</td>
                    <td>{p.radicado} {p.juzgado && `· ${p.juzgado}`}</td>
                    <td>{p.vencimiento_termino || '—'}</td>
                    <td>{p.resultado || 'Pendiente'}</td>
                    <td>{esJuridica && !p.resultado && <>
                      <button onClick={() => resultado(p, 'FAVORABLE')}>Favorable</button>
                      <button className="peligro" onClick={() => resultado(p, 'DESFAVORABLE')}>Desfavorable</button>
                      <button className="secundario" onClick={() => resultado(p, 'SIN_RESPUESTA')}>Sin respuesta</button>
                    </>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {esJuridica && c.estado === 'EN_COBRO_JURIDICO' && <>
            <button onClick={() => decidir(c, 'RECUPERAR')}>Decidir: recuperar</button>
            <button onClick={() => peticion(c)}>Derecho de petición</button>
            <button className="secundario" onClick={() => tutela(c)}>Acción de tutela</button>
            <button className="peligro" onClick={() => decidir(c, 'DAR_DE_BAJA')}>Dar de baja</button>
          </>}
        </div>
      ))}
      {!casos.length && <div className="tarjeta">No hay expedientes en cobro jurídico.</div>}
    </div>
  );
}
