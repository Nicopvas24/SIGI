// Vista Conciliación de pagos con Contabilidad
import { useEffect, useState } from 'react';
import { ArrowLeftRight, ArrowRight } from 'lucide-react';
import { api, sesion } from '../api.js';
import { Aviso, Encabezado, Estado, Panel, Vacio, dinero, fecha, useDialogo } from '../ui.jsx';

const ESTADO_PAGO = { POR_IDENTIFICAR: ['Por identificar', 'pendiente'], IDENTIFICADO: ['Identificado', ''], CONCILIADO: ['Conciliado', 'cerrado'] };

export default function Conciliacion() {
  const rol = sesion()?.usuario?.rol;
  const dlg = useDialogo();
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7));
  const [estado, setEstado] = useState(null);
  const [propuestas, setPropuestas] = useState(null);
  const [entidades, setEntidades] = useState([]);
  const [nueva, setNueva] = useState({ entidad_id: '', valor: '', fecha_pago: '' });
  const [msj, setMsj] = useState(null);

  const cargar = () => {
    api(`/conciliacion?periodo=${periodo}`).then(setEstado).catch((e) => setMsj({ t: 'error', m: e.message }));
    api('/conciliacion/coincidencias').then(setPropuestas).catch(() => setPropuestas([]));
  };
  useEffect(() => { cargar(); }, [periodo]);
  useEffect(() => { api('/entidades').then(setEntidades).catch(() => {}); }, []);

  async function cargarConsignacion(e) {
    e.preventDefault();
    try {
      const r = await api('/conciliacion/consignaciones', {
        method: 'POST',
        body: { periodo, consignaciones: [{ entidad_id: Number(nueva.entidad_id), valor: Number(nueva.valor), fecha_pago: nueva.fecha_pago }] },
      });
      setMsj({ t: 'ok', m: r.mensaje });
      setNueva({ entidad_id: '', valor: '', fecha_pago: '' });
      cargar();
    } catch (err) { setMsj({ t: 'error', m: err.message }); }
  }

  async function confirmar(pago, c) {
    const ok = await dlg.confirmar(`Identificar consignación`,
      `${dinero(pago.valor)} consignados el ${fecha(pago.fecha_pago)} corresponden a ${c.numero_caso} (${c.colaborador}).\nValor esperado: ${dinero(c.valor_esperado)}.`,
      { textoAceptar: 'Confirmar' });
    if (!ok) return;
    try {
      const r = await api('/conciliacion/confirmar', { method: 'POST', body: { pago_id: pago.id, incapacidad_id: c.incapacidad_id } });
      setMsj({ t: r.saldo_pendiente > 0 ? 'info' : 'ok', m: r.mensaje });
      cargar();
    } catch (err) { setMsj({ t: 'error', m: err.message }); }
  }

  async function confirmarPago(a) {
    const r0 = await dlg.pedir({
      titulo: `Confirmar consignación del caso ${a.numero_caso}`,
      descripcion: `${a.entidad} notificó un pago de ${dinero(a.valor)} para ${a.colaborador}. Confirme cuando lo vea en el extracto de la cuenta.`,
      textoAceptar: 'Confirmar consignación',
      campos: [
        { nombre: 'valor', etiqueta: 'Valor consignado (COP)', tipo: 'number', valor: a.valor, requerido: true, min: 1, step: 1 },
        { nombre: 'fecha', etiqueta: 'Fecha de la consignación', tipo: 'date', valor: a.fecha_pago, requerido: true },
      ],
    });
    if (!r0) return;
    try {
      const r = await api('/conciliacion/confirmar-pago', {
        method: 'POST', body: { pago_id: a.pago_id, periodo, valor: Number(r0.valor), fecha_consignacion: r0.fecha },
      });
      setMsj({ t: r.saldo_pendiente > 0 ? 'info' : 'ok', m: r.mensaje });
      cargar();
    } catch (err) { setMsj({ t: 'error', m: err.message }); }
  }

  async function cerrar(forzar = false) {
    try {
      const r = await api('/conciliacion/cerrar', { method: 'POST', body: { periodo, forzar } });
      setMsj({ t: 'ok', m: r.mensaje });
      cargar();
    } catch (err) {
      if (err.status === 409 && !forzar && await dlg.confirmar('¿Cerrar el periodo de todas formas?',
        `${err.message} Quedarán como valores por identificar y se notificará a Contabilidad para contactar a las entidades.`,
        { textoAceptar: 'Cerrar periodo', peligro: true })) {
        return cerrar(true);
      }
      if (err.status !== 409 || forzar) setMsj({ t: 'error', m: err.message });
    }
  }

  const conc = estado?.conciliacion;
  const abierto = conc?.estado !== 'CONCILIADA';
  const puedeCargar = ['CONTABILIDAD', 'AUXILIAR', 'ADMIN'].includes(rol) && abierto;
  const delPeriodo = (propuestas || []).filter((p) => p.pago.conciliacion_id === conc?.id);
  const otras = (propuestas || []).filter((p) => p.pago.conciliacion_id !== conc?.id);

  return (
    <div>
      <Encabezado titulo="Conciliación de pagos"
        descripcion="Contabilidad registra lo que consigna cada entidad y Administración de Personal indica a qué incapacidad corresponde.">
        <input type="month" aria-label="Periodo" style={{ width: 170 }} value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
      </Encabezado>
      <Aviso msj={msj} onCerrar={() => setMsj(null)} />

      <Panel
        titulo="Pagos registrados en Cobro"
        sub="La entidad avisó que pagó. Confirme cada uno cuando aparezca en la cuenta bancaria."
        cuerpo={false}
      >
        {estado?.avisos?.length ? (
          <div className="tabla-wrap">
            <table>
              <thead><tr><th>Caso</th><th>Entidad</th><th>Fecha del pago</th><th className="num">Valor pagado</th><th className="num">Solicitado</th><th>Soporte</th>
                {rol !== 'JURIDICA' && <th className="th-acciones" />}</tr></thead>
              <tbody>
                {estado.avisos.map((a) => (
                  <tr key={a.pago_id}>
                    <td><span className="caso">{a.numero_caso}</span><span className="secundario-texto">{a.colaborador}</span></td>
                    <td>{a.entidad}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fecha(a.fecha_pago)}</td>
                    <td className="num"><b>{dinero(a.valor)}</b></td>
                    <td className={`num ${a.valor < a.saldo ? 'texto-alerta' : ''}`}>{dinero(a.valor_solicitado)}</td>
                    <td>{a.tiene_soporte ? <span className="texto-ok">Cargado</span> : <span className="texto-tenue">Sin soporte</span>}</td>
                    <td><div className="acciones">{abierto && <button onClick={() => confirmarPago(a)}>Confirmar consignación</button>}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : estado && (
          <Vacio icono={ArrowLeftRight} titulo="No hay pagos esperando confirmación">
            Cuando Cobro registre el pago de una entidad, aparecerá aquí.
          </Vacio>
        )}
      </Panel>

      <Panel
        titulo={`Periodo ${periodo}`}
        sub={<>Estado: <b>{conc?.estado === 'CONCILIADA' ? 'Conciliado' : conc ? 'Abierto' : 'Sin consignaciones'}</b>
          {conc && `. Identificadas: ${estado.identificadas}. Por identificar: ${estado.por_identificar}.`}</>}
        extra={
          <div className="en-linea" style={{ alignItems: 'center' }}>
            <span className="cifra"><small>Total consignado</small>{dinero(conc?.total_consignado)}</span>
            {(rol === 'CONTABILIDAD' || rol === 'ADMIN') && conc?.estado === 'ABIERTA' &&
              <button onClick={() => cerrar()}>Conciliar y cerrar periodo</button>}
          </div>
        }
        cuerpo={false}
      >
        {puedeCargar && (
          <form className="panel-cuerpo form-grid" onSubmit={cargarConsignacion}>
            <div className="campo">
              <label htmlFor="c-ent">Entidad que consignó</label>
              <select id="c-ent" required value={nueva.entidad_id} onChange={(e) => setNueva({ ...nueva, entidad_id: e.target.value })}>
                <option value="">Seleccione…</option>
                {entidades.map((en) => <option key={en.id} value={en.id}>{en.nombre}</option>)}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="c-val">Valor consignado (COP)</label>
              <input id="c-val" type="number" min="1" step="1" required value={nueva.valor} onChange={(e) => setNueva({ ...nueva, valor: e.target.value })} />
            </div>
            <div className="campo">
              <label htmlFor="c-fec">Fecha de la consignación</label>
              <input id="c-fec" type="date" required value={nueva.fecha_pago} onChange={(e) => setNueva({ ...nueva, fecha_pago: e.target.value })} />
            </div>
            <div className="campo" style={{ justifyContent: 'flex-end' }}>
              <button type="submit" style={{ minHeight: 36 }}>Registrar consignación</button>
            </div>
          </form>
        )}
        {estado?.consignaciones?.length > 0 && (
          <div className="tabla-wrap" style={{ borderTop: '1px solid var(--borde)' }}>
            <table>
              <thead><tr><th>Fecha</th><th>Entidad</th><th>Caso</th><th className="num">Valor</th><th>Estado</th></tr></thead>
              <tbody>
                {estado.consignaciones.map((p) => {
                  const [t, tono] = ESTADO_PAGO[p.estado] || [p.estado, 'neutro'];
                  return (
                    <tr key={p.id}>
                      <td>{fecha(p.fecha_pago)}</td>
                      <td>{entidades.find((e) => e.id === p.entidad_id)?.nombre || '—'}</td>
                      <td>{p.incapacidad
                        ? <><span className="caso">{p.incapacidad.numero_caso}</span><span className="secundario-texto">{p.incapacidad.colaborador?.usuario?.nombre}</span></>
                        : <span className="texto-tenue">Sin identificar</span>}</td>
                      <td className="num">{dinero(p.valor)}</td>
                      <td><span className={`sello ${tono}`}>{t}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel titulo="Identificar consignaciones" sub="Junto a cada consignación aparecen los casos de la misma entidad que podrían corresponder." cuerpo={false}>
        {propuestas?.length ? (
          <ul className="expedientes">
            {[...delPeriodo, ...otras].map(({ pago, candidatos }) => (
              <li key={pago.id}>
                <div className="exp-titulo">
                  <b>{dinero(pago.valor)}</b>
                  <span className="texto-tenue">{entidades.find((e) => e.id === pago.entidad_id)?.nombre} · consignado el {fecha(pago.fecha_pago)}</span>
                </div>
                {candidatos.length ? (
                  <div className="sub-tabla tabla-wrap">
                    <table>
                      <thead><tr><th>Caso candidato</th><th>Estado</th><th className="num">Esperado</th><th className="num">Diferencia</th>{rol !== 'JURIDICA' && <th className="th-acciones" />}</tr></thead>
                      <tbody>
                        {candidatos.map((c) => (
                          <tr key={c.incapacidad_id}>
                            <td><ArrowRight size={13} aria-hidden="true" className="texto-tenue" /> <span className="caso">{c.numero_caso}</span><span className="secundario-texto">{c.colaborador}</span></td>
                            <td><Estado valor={c.estado} /></td>
                            <td className="num">{dinero(c.valor_esperado)}</td>
                            <td className={`num ${c.diferencia ? 'texto-alerta' : 'texto-ok'}`}>{dinero(c.diferencia)}</td>
                            <td><div className="acciones"><button onClick={() => confirmar(pago, c)}>Es este caso</button></div></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="ayuda" style={{ marginTop: 6 }}>
                    <span className="sello pendiente">Por identificar</span> No hay casos pendientes de pago de esta entidad: contacte al asesor de la entidad.
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : propuestas && (
          <Vacio icono={ArrowLeftRight} titulo="No hay consignaciones por identificar">
            Cuando registre una consignación, se buscarán los casos de esa entidad con un valor parecido.
          </Vacio>
        )}
      </Panel>
    </div>
  );
}
