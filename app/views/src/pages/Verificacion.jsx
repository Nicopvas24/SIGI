// Vista Verificación documental (CU-07 a CU-10) + preverificación con IA
import { useEffect, useState } from 'react';
import { Building2, CalendarDays, FileCheck2, FileText, Sparkles } from 'lucide-react';
import { api } from '../api.js';
import { Aviso, Encabezado, Estado, Panel, Vacio, dinero, fecha, tipo, useIA } from '../ui.jsx';

export default function Verificacion() {
  const [casos, setCasos] = useState(null);
  const [msj, setMsj] = useState(null);
  const [ia, setIa] = useState({});
  const iaActiva = useIA();

  const cargar = () => api('/verificacion/pendientes').then(setCasos).catch((e) => { setCasos([]); setMsj({ t: 'error', m: e.message }); });
  useEffect(() => { cargar(); }, []);

  async function verificar(caso) {
    try {
      // Marca todos los documentos cargados como conformes y ejecuta CU-07/08/09
      const conformidades = (caso.documentos || []).map((d) => ({ documento_id: d.id, conforme: true }));
      const r = await api(`/incapacidades/${caso.id}/verificar`, { method: 'POST', body: { conformidades } });
      if (r.faltantes?.length) {
        setMsj({ t: 'info', m: `Documentación incompleta. Faltan: ${r.faltantes.join(', ')}. Fecha límite: ${fecha(r.fecha_limite)}.` });
      } else {
        const l = r.liquidacion;
        setMsj({ t: 'ok', m: `Verificada. Formato de seguimiento v${r.formato_seguimiento.version}: empresa ${dinero(l.valorEmpresa)} (${l.diasEmpresa} días) · entidad ${dinero(l.valorEntidad)} (${l.diasEntidad} días). ${r.advertencias?.join(' ') || ''}` });
      }
      cargar();
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
  }

  async function segundoLlamado(caso) {
    try {
      const r = await api(`/incapacidades/${caso.id}/segundo-llamado`, { method: 'POST', body: {} });
      setMsj({ t: 'ok', m: r.mensaje });
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
  }

  async function preverificar(caso) {
    setIa((p) => ({ ...p, [caso.id]: { cargando: true } }));
    try {
      const r = await api(`/incapacidades/${caso.id}/preverificar-ia`);
      setIa((p) => ({ ...p, [caso.id]: r }));
    } catch (e) {
      setIa((p) => ({ ...p, [caso.id]: null }));
      setMsj({ t: 'error', m: e.message });
    }
  }

  return (
    <div>
      <Encabezado
        titulo="Verificación documental"
        descripcion="Revise los soportes de cada caso recibido. Al verificar se genera el formato de seguimiento con la liquidación."
        refs={['CU-07', 'CU-10']}
      />
      <Aviso msj={msj} onCerrar={() => setMsj(null)} />

      <Panel titulo="Pendientes de verificación" sub={casos ? `${casos.length} caso(s) en bandeja` : 'Cargando…'} cuerpo={false}>
        {casos?.length ? (
          <ul className="expedientes">
            {casos.map((c) => {
              const r = ia[c.id];
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
                        <span>{tipo(c.tipo)}</span>
                        <span><CalendarDays size={14} aria-hidden="true" /><b>{c.dias}</b> día(s) desde {fecha(c.fecha_inicio)}</span>
                        <span><Building2 size={14} aria-hidden="true" />{c.entidad?.nombre}</span>
                      </div>
                    </div>
                    <div className="acciones">
                      {iaActiva && (
                        <button className="secundario" onClick={() => preverificar(c)} disabled={r?.cargando}>
                          <Sparkles size={15} aria-hidden="true" />{r?.cargando ? 'Analizando…' : 'Preverificar con IA'}
                        </button>
                      )}
                      {c.estado === 'DOCUMENTACION_INCOMPLETA' && (
                        <button className="peligro" onClick={() => segundoLlamado(c)}>Segundo llamado</button>
                      )}
                      <button onClick={() => verificar(c)}>Verificar documentación</button>
                    </div>
                  </div>
                  <div className="chips" aria-label="Soportes cargados">
                    {(c.documentos || []).length
                      ? c.documentos.map((d) => (
                          <span key={d.id} className={`chip ${d.estado === 'CONFORME' ? 'ok' : d.estado === 'NO_CONFORME' ? 'mal' : ''}`}>
                            <FileText size={13} aria-hidden="true" />{d.tipo_documento.replaceAll('_', ' ').toLowerCase()}
                          </span>
                        ))
                      : <span className="chip mal">Sin soportes cargados</span>}
                  </div>
                  {r && !r.cargando && (
                    <div className="ia">
                      <div className="ia-titulo"><Sparkles size={16} aria-hidden="true" />
                        Preverificación: {r.apto_para_verificar ? 'apto para verificar' : 'con observaciones'}
                      </div>
                      <div className="ia-cuerpo">
                        {r.faltantes?.length > 0 && <><h4>Faltantes</h4><p>{r.faltantes.join(', ')}</p></>}
                        {r.inconsistencias?.length > 0 && <><h4>Inconsistencias</h4><ul>{r.inconsistencias.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
                        {r.recomendaciones?.length > 0 && <><h4>Recomendaciones</h4><ul>{r.recomendaciones.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : casos && (
          <Vacio icono={FileCheck2} titulo="Bandeja al día">
            Los casos aparecen aquí cuando Recepción marca los soportes como recibidos.
          </Vacio>
        )}
      </Panel>
    </div>
  );
}
