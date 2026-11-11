// Vista Verificación documental + análisis de soportes con IA
import { useEffect, useState } from 'react';
import { Building2, CalendarDays, FileCheck2, FileText, Sparkles } from 'lucide-react';
import { api, abrirDocumento } from '../api.js';
import { Aviso, Encabezado, Estado, Panel, Vacio, dinero, documento, fecha, tipo, useDialogo, useIA } from '../ui.jsx';

const REVISABLES = ['CARGADO', 'EN_REVISION', 'CONFORME', 'NO_CONFORME'];

export default function Verificacion() {
  const dlg = useDialogo();
  const iaActiva = useIA();
  const [casos, setCasos] = useState(null);
  const [msj, setMsj] = useState(null);
  const [ia, setIa] = useState({});

  const cargar = () => api('/verificacion/pendientes').then(setCasos).catch((e) => { setCasos([]); setMsj({ t: 'error', m: e.message }); });
  useEffect(() => { cargar(); }, []);

  async function verificar(caso) {
    const docs = caso.documentos.filter((d) => REVISABLES.includes(d.estado));
    const r0 = await dlg.pedir({
      titulo: `Verificar ${caso.numero_caso}`,
      descripcion: `Exigidos: ${caso.documentos_requeridos.map(documento).join(', ')}.\nMarque los documentos que están completos, legibles y corresponden a ${caso.colaborador?.usuario?.nombre}. Los que deje sin marcar se solicitarán de nuevo al colaborador.`,
      textoAceptar: 'Guardar verificación',
      campos: [
        { nombre: 'conformes', etiqueta: 'Documentos conformes', tipo: 'multi',
          opciones: docs.map((d) => [d.id, `${documento(d.tipo_documento)}${d.url ? '' : ' (físico)'}`]),
          valor: docs.filter((d) => d.estado !== 'NO_CONFORME').map((d) => d.id) },
        { nombre: 'ibc', etiqueta: 'Ingreso base de cotización (IBC)', tipo: 'number', min: 0, step: 1,
          valor: caso.colaborador?.ibc || '', ayuda: `Registrado: ${dinero(caso.colaborador?.ibc)}. Se usa para liquidar los días a cargo de la empresa y de la entidad.` },
        { nombre: 'observaciones', etiqueta: 'Observaciones', tipo: 'textarea' },
      ],
    });
    if (!r0) return;
    try {
      const r = await api(`/incapacidades/${caso.id}/verificar`, {
        method: 'POST', body: { conformes: r0.conformes, ibc: r0.ibc ? Number(r0.ibc) : undefined, observaciones: r0.observaciones },
      });
      const l = r.liquidacion;
      setMsj(r.completa
        ? { t: 'ok', m: `${r.mensaje} Liquidación: empresa ${dinero(l.valorEmpresa)} · entidad ${dinero(l.valorEntidad)}. El caso pasó a Transcripción y radicación.` }
        : { t: 'info', m: r.mensaje });
      cargar();
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
  }

  async function segundoLlamado(caso) {
    try {
      const r = await api(`/incapacidades/${caso.id}/segundo-llamado`, { method: 'POST', body: {} });
      setMsj({ t: 'ok', m: r.mensaje });
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
  }

  async function analizar(caso) {
    setIa((p) => ({ ...p, [caso.id]: { cargando: true } }));
    try {
      const r = await api(`/ia/analizar-soportes/${caso.id}`, { method: 'POST', body: {} });
      setIa((p) => ({ ...p, [caso.id]: r }));
    } catch (e) {
      setIa((p) => ({ ...p, [caso.id]: null }));
      setMsj({ t: 'error', m: e.message });
    }
  }

  async function ver(d) {
    try { await abrirDocumento(d.id); } catch (e) { setMsj({ t: 'error', m: e.message }); }
  }

  return (
    <div>
      <Encabezado titulo="Verificación documental"
        descripcion="Revise los soportes de cada caso recibido. Al verificar se diligencia el formato de seguimiento con la liquidación y los soportes quedan archivados en digital." />
      <Aviso msj={msj} onCerrar={() => setMsj(null)} />

      <Panel titulo="Pendientes de verificación" sub={casos ? `${casos.length} caso(s), del más antiguo al más reciente` : 'Cargando…'} cuerpo={false}>
        {casos?.length ? (
          <ul className="expedientes">
            {casos.map((c) => {
              const r = ia[c.id];
              const conArchivo = c.documentos.some((d) => d.url && !d.es_reservado);
              return (
                <li key={c.id}>
                  <div className="exp-cabeza">
                    <div>
                      <div className="exp-titulo">
                        <span className="caso">{c.numero_caso}</span>
                        <b>{c.colaborador?.usuario?.nombre}</b>
                        <span className="texto-tenue">C.C. {c.colaborador?.usuario?.documento}</span>
                        <Estado valor={c.estado} />
                      </div>
                      <div className="exp-meta">
                        <span>{tipo(c.tipo)}</span>
                        <span><CalendarDays size={14} aria-hidden="true" /><b>{c.dias}</b> día(s) desde {fecha(c.fecha_inicio)}</span>
                        <span><Building2 size={14} aria-hidden="true" />{c.entidad?.nombre}</span>
                      </div>
                    </div>
                    <div className="acciones">
                      {iaActiva && conArchivo && (
                        <button className="secundario" onClick={() => analizar(c)} disabled={r?.cargando}>
                          <Sparkles size={15} aria-hidden="true" />{r?.cargando ? 'Analizando…' : 'Analizar soportes con IA'}
                        </button>
                      )}
                      {c.estado === 'DOCUMENTACION_INCOMPLETA' && (
                        <button className="peligro" onClick={() => segundoLlamado(c)}>Segundo llamado</button>
                      )}
                      <button onClick={() => verificar(c)}>Verificar documentación</button>
                    </div>
                  </div>
                  <div className="chips" aria-label="Soportes cargados">
                    {c.documentos.length
                      ? c.documentos.map((d) => (
                          <button key={d.id} type="button" onClick={() => d.url && ver(d)} disabled={!d.url}
                            className={`chip ${d.estado === 'CONFORME' ? 'ok' : d.estado === 'NO_CONFORME' ? 'mal' : ''}`}
                            title={d.url ? 'Abrir archivo' : 'Entregado solo en físico'}>
                            <FileText size={13} aria-hidden="true" />{documento(d.tipo_documento)}{!d.url && ' · físico'}
                          </button>
                        ))
                      : <span className="chip mal">Sin soportes cargados</span>}
                    {c.documentos_requeridos.filter((t) => !c.documentos.some((d) => d.tipo_documento === t)).map((t) => (
                      <span key={t} className="chip mal">Falta: {documento(t)}</span>
                    ))}
                  </div>
                  {r && !r.cargando && (
                    <div className="ia">
                      <div className="ia-titulo"><Sparkles size={16} aria-hidden="true" />
                        Análisis de {r.analizados} soporte(s): {r.apto_para_verificar ? 'apto para verificar' : 'con observaciones'}
                      </div>
                      <div className="ia-cuerpo">
                        {r.documentos?.length > 0 && (
                          <ul>{r.documentos.map((d) => (
                            <li key={d.numero}>
                              <b>{documento(d.tipo_registrado)}</b>: {d.legible ? 'legible' : 'no legible'}
                              {d.tipo_detectado && d.tipo_detectado !== d.tipo_registrado ? `, parece ser ${String(d.tipo_detectado).toLowerCase()}` : ''}
                              {d.coincide_con_caso === false ? ', no coincide con el caso' : ''}. {d.observacion}
                            </li>
                          ))}</ul>
                        )}
                        {r.inconsistencias?.length > 0 && <><h4>Inconsistencias</h4><ul>{r.inconsistencias.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
                        {r.faltantes?.length > 0 && <><h4>Faltantes</h4><p>{r.faltantes.join(', ')}</p></>}
                        {r.recomendacion && <><h4>Recomendación</h4><p>{r.recomendacion}</p></>}
                        {r.nota && <p className="ayuda" style={{ marginTop: 8 }}>{r.nota}</p>}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : casos && (
          <Vacio icono={FileCheck2} titulo="Bandeja al día">
            Los casos aparecen aquí cuando se registra la recepción de sus soportes.
          </Vacio>
        )}
      </Panel>
    </div>
  );
}
