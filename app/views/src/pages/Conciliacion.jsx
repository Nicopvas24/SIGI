// Vista Conciliación contable (CU-24, CU-25)
import { useEffect, useState } from 'react';
import { api, sesion } from '../api.js';

export default function Conciliacion() {
  const rol = sesion()?.usuario?.rol;
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7));
  const [estado, setEstado] = useState(null);
  const [propuestas, setPropuestas] = useState([]);
  const [entidades, setEntidades] = useState([]);
  const [nueva, setNueva] = useState({ entidad_id: '', valor: '', fecha_pago: '' });
  const [msj, setMsj] = useState(null);

  const cargar = () => {
    api(`/conciliacion?periodo=${periodo}`).then(setEstado).catch((e) => setMsj({ t: 'error', m: e.message }));
    api('/conciliacion/coincidencias').then(setPropuestas).catch(() => {});
  };
  useEffect(() => { cargar(); api('/entidades').then(setEntidades).catch(() => {}); }, [periodo]);

  async function cargarConsignacion(e) {
    e.preventDefault();
    try {
      await api('/conciliacion/consignaciones', {
        method: 'POST',
        body: { periodo, consignaciones: [{ ...nueva, entidad_id: Number(nueva.entidad_id), valor: Number(nueva.valor) }] },
      });
      setMsj({ t: 'ok', m: 'Consignación registrada (por identificar).' });
      setNueva({ entidad_id: '', valor: '', fecha_pago: '' });
      cargar();
    } catch (err) { setMsj({ t: 'error', m: err.message }); }
  }

  async function confirmar(pagoId, incapacidadId) {
    try {
      const r = await api('/conciliacion/confirmar', { method: 'POST', body: { pago_id: pagoId, incapacidad_id: incapacidadId } });
      setMsj({ t: r.alerta ? 'error' : 'ok', m: `Pago identificado. Estado: ${r.estado_caso}. Saldo: $${r.saldo_pendiente}. ${r.nota || ''} ${r.alerta || ''}` });
      cargar();
    } catch (err) { setMsj({ t: 'error', m: err.message }); }
  }

  async function cerrar(forzar = false) {
    try {
      const r = await api('/conciliacion/cerrar', { method: 'POST', body: { periodo, forzar } });
      setMsj({ t: 'ok', m: r.mensaje });
      cargar();
    } catch (err) {
      if (err.status === 409 && window.confirm(`${err.message}. ¿Cerrar de todas formas?`)) return cerrar(true);
      setMsj({ t: 'error', m: err.message });
    }
  }

  return (
    <div>
      <h2>Conciliación de pagos con Contabilidad (CU-24)</h2>
      {msj && <div className={`alerta ${msj.t}`}>{msj.m}</div>}
      <div className="tarjeta" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <label style={{ margin: 0 }}>Periodo</label>
        <input type="month" style={{ width: 180 }} value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
        <span>Estado: <b>{estado?.conciliacion?.estado || 'Sin abrir'}</b> · Total consignado: ${Number(estado?.conciliacion?.total_consignado || 0).toLocaleString()}</span>
        {(rol === 'CONTABILIDAD' || rol === 'ADMIN') && estado?.conciliacion?.estado === 'ABIERTA' &&
          <button onClick={() => cerrar()}>Conciliar y cerrar periodo</button>}
      </div>

      {(rol === 'CONTABILIDAD' || rol === 'AUXILIAR' || rol === 'ADMIN') && (
        <form className="tarjeta form-grid" onSubmit={cargarConsignacion}>
          <h3 style={{ gridColumn: '1 / -1', margin: 0 }}>Cargar consignación de la entidad</h3>
          <div><label>Entidad</label>
            <select required value={nueva.entidad_id} onChange={(e) => setNueva({ ...nueva, entidad_id: e.target.value })}>
              <option value="">Seleccione…</option>
              {entidades.map((en) => <option key={en.id} value={en.id}>{en.nombre}</option>)}
            </select></div>
          <div><label>Valor</label><input type="number" required value={nueva.valor} onChange={(e) => setNueva({ ...nueva, valor: e.target.value })} /></div>
          <div><label>Fecha de pago</label><input type="date" required value={nueva.fecha_pago} onChange={(e) => setNueva({ ...nueva, fecha_pago: e.target.value })} /></div>
          <div style={{ marginTop: 26 }}><button type="submit">Registrar</button></div>
        </form>
      )}

      <div className="tarjeta">
        <h3>Coincidencias propuestas (pagos por identificar ↔ casos cobrados)</h3>
        {propuestas.map(({ pago, candidatos }) => (
          <div key={pago.id} style={{ borderTop: '1px solid #dbe2ea', padding: '8px 0' }}>
            Pago ${Number(pago.valor).toLocaleString()} del {pago.fecha_pago}
            {candidatos.length ? candidatos.map((c) => (
              <div key={c.incapacidad_id} style={{ marginLeft: 16, fontSize: 13 }}>
                → {c.numero_caso} · {c.colaborador} · esperado ${c.valor_esperado.toLocaleString()} · dif. ${c.diferencia.toLocaleString()}{' '}
                <button onClick={() => confirmar(pago.id, c.incapacidad_id)}>Confirmar</button>
              </div>
            )) : <div style={{ marginLeft: 16, color: '#c0392b', fontSize: 13 }}>Sin candidatos: queda "Por identificar" (contactar asesor de la entidad).</div>}
          </div>
        ))}
        {!propuestas.length && <p>No hay pagos por identificar.</p>}
      </div>
    </div>
  );
}
