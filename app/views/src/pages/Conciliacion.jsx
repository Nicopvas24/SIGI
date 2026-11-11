// Vista Conciliación contable (CU-24, CU-25)
import { useEffect, useState } from 'react';
import { ArrowLeftRight, ArrowRight } from 'lucide-react';
import { api, sesion } from '../api.js';
import { Aviso, Encabezado, Panel, Vacio, dinero, fecha, useDialogo } from '../ui.jsx';

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
  useEffect(() => { cargar(); api('/entidades').then(setEntidades).catch(() => {}); }, [periodo]);

  async function cargarConsignacion(e) {
    e.preventDefault();
    try {
      await api('/conciliacion/consignaciones', {
        method: 'POST',
        body: { periodo, consignaciones: [{ ...nueva, entidad_id: Number(nueva.entidad_id), valor: Number(nueva.valor) }] },
      });
      setMsj({ t: 'ok', m: 'Consignación registrada como por identificar.' });
      setNueva({ entidad_id: '', valor: '', fecha_pago: '' });
      cargar();
    } catch (err) { setMsj({ t: 'error', m: err.message }); }
  }

  async function confirmar(pagoId, incapacidadId) {
    try {
      const r = await api('/conciliacion/confirmar', { method: 'POST', body: { pago_id: pagoId, incapacidad_id: incapacidadId } });
      setMsj({ t: r.alerta ? 'error' : 'ok', m: `Pago identificado. Estado: ${r.estado_caso}. Saldo: ${dinero(r.saldo_pendiente)}. ${r.nota || ''} ${r.alerta || ''}` });
      cargar();
    } catch (err) { setMsj({ t: 'error', m: err.message }); }
  }

  async function cerrar(forzar = false) {
    try {
      const r = await api('/conciliacion/cerrar', { method: 'POST', body: { periodo, forzar } });
      setMsj({ t: 'ok', m: r.mensaje });
      cargar();
    } catch (err) {
      if (err.status === 409 && await dlg.confirmar('¿Cerrar el periodo de todas formas?', err.message, { textoAceptar: 'Cerrar periodo', peligro: true })) {
        return cerrar(true);
      }
      setMsj({ t: 'error', m: err.message });
    }
  }

  const conc = estado?.conciliacion;
  const puedeCargar = ['CONTABILIDAD', 'AUXILIAR', 'ADMIN'].includes(rol);

  return (
    <div>
      <Encabezado
        titulo="Conciliación de pagos"
        descripcion="Cruce de las consignaciones de cada entidad con los casos cobrados, por periodo contable."
        refs={['CU-24', 'CU-25']}
      >
        <input type="month" aria-label="Periodo" style={{ width: 170 }} value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
      </Encabezado>
      <Aviso msj={msj} onCerrar={() => setMsj(null)} />

      <Panel
        titulo={`Periodo ${periodo}`}
        sub={<>Estado: <b>{conc?.estado === 'CONCILIADA' ? 'Conciliado' : conc?.estado === 'ABIERTA' ? 'Abierto' : 'Sin abrir'}</b></>}
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
              <label htmlFor="c-ent">Entidad</label>
              <select id="c-ent" required value={nueva.entidad_id} onChange={(e) => setNueva({ ...nueva, entidad_id: e.target.value })}>
                <option value="">Seleccione…</option>
                {entidades.map((en) => <option key={en.id} value={en.id}>{en.nombre}</option>)}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="c-val">Valor consignado (COP)</label>
              <input id="c-val" type="number" min="0" required value={nueva.valor} onChange={(e) => setNueva({ ...nueva, valor: e.target.value })} />
            </div>
            <div className="campo">
              <label htmlFor="c-fec">Fecha de pago</label>
              <input id="c-fec" type="date" required value={nueva.fecha_pago} onChange={(e) => setNueva({ ...nueva, fecha_pago: e.target.value })} />
            </div>
            <div className="campo" style={{ justifyContent: 'flex-end' }}>
              <button type="submit" style={{ minHeight: 36 }}>Registrar consignación</button>
            </div>
          </form>
        )}
      </Panel>

      <Panel titulo="Coincidencias propuestas" sub="Pagos por identificar y los casos cobrados que podrían corresponderles." cuerpo={false}>
        {propuestas?.length ? (
          <ul className="expedientes">
            {propuestas.map(({ pago, candidatos }) => (
              <li key={pago.id}>
                <div className="exp-titulo">
                  <b>{dinero(pago.valor)}</b><span className="texto-tenue">consignado el {fecha(pago.fecha_pago)}</span>
                </div>
                {candidatos.length ? (
                  <div className="sub-tabla tabla-wrap">
                    <table>
                      <thead><tr><th>Caso candidato</th><th className="num">Esperado</th><th className="num">Diferencia</th><th className="th-acciones"></th></tr></thead>
                      <tbody>
                        {candidatos.map((c) => (
                          <tr key={c.incapacidad_id}>
                            <td><ArrowRight size={13} aria-hidden="true" className="texto-tenue" /> <span className="caso">{c.numero_caso}</span><span className="secundario-texto">{c.colaborador}</span></td>
                            <td className="num">{dinero(c.valor_esperado)}</td>
                            <td className={`num ${c.diferencia ? 'texto-alerta' : 'texto-ok'}`}>{dinero(c.diferencia)}</td>
                            <td><div className="acciones"><button onClick={() => confirmar(pago.id, c.incapacidad_id)}>Confirmar</button></div></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="ayuda" style={{ marginTop: 6 }}>
                    <span className="sello pendiente">Por identificar</span> Sin casos candidatos: contacte al asesor de la entidad.
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : propuestas && (
          <Vacio icono={ArrowLeftRight} titulo="No hay pagos por identificar">
            Al registrar una consignación, el sistema buscará los casos cobrados con valores compatibles.
          </Vacio>
        )}
      </Panel>
    </div>
  );
}
