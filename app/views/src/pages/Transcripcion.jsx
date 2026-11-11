// Vista Transcripción y radicación + reporte de ausentismo al SG-SST
import { useEffect, useState } from 'react';
import { ExternalLink, Mail, Monitor, Stamp } from 'lucide-react';
import { api, formulario } from '../api.js';
import { Aviso, Encabezado, Estado, Panel, PanelIA, TIPOS, Vacio, tipo, useDialogo } from '../ui.jsx';

export default function Transcripcion() {
  const dlg = useDialogo();
  const [casos, setCasos] = useState(null);
  const [msj, setMsj] = useState(null);
  const [sgsst, setSgsst] = useState(null);
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7));
  const [cargando, setCargando] = useState(null);

  const cargar = () => api('/transcripcion/pendientes').then(setCasos).catch((e) => { setCasos([]); setMsj({ t: 'error', m: e.message }); });
  useEffect(() => { cargar(); }, []);

  const accion = (fn) => async (c) => {
    try {
      const r = await fn(c);
      if (r) { setMsj({ t: 'ok', m: r.mensaje }); cargar(); }
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
  };

  const transcribir = accion(async (c) => {
    const porPortal = c.canal_entidad === 'PORTAL_WEB';
    const r0 = await dlg.pedir({
      titulo: `Transcribir ${c.numero_caso}`,
      descripcion: porPortal
        ? `Ingrese al portal de ${c.entidad?.nombre}, diligencie el formato del tipo de incapacidad y registre aquí la constancia.`
        : `${c.entidad?.nombre} transcribe por correo${c.entidad?.correo_contacto ? ` (${c.entidad.correo_contacto})` : ''}. Envíe los soportes y registre aquí la respuesta.`,
      textoAceptar: 'Registrar transcripción',
      campos: [
        { nombre: 'numero_transcripcion', etiqueta: 'Número o constancia de transcripción', requerido: true },
        { nombre: 'evidencia', etiqueta: 'Constancia (pantallazo o PDF)', tipo: 'file' },
        { nombre: 'descripcion', etiqueta: 'Observaciones', tipo: 'textarea' },
      ],
    });
    if (!r0) return null;
    const { evidencia, ...campos } = r0;
    return api(`/incapacidades/${c.id}/transcribir`, { method: 'POST', formData: formulario(campos, { evidencia }) });
  });

  const radicar = accion(async (c) => {
    const r0 = await dlg.pedir({
      titulo: `Radicar ${c.numero_caso} ante ${c.entidad?.nombre}`,
      descripcion: 'Radique el certificado, los soportes y los formatos de la entidad. La evidencia es obligatoria.',
      textoAceptar: 'Radicar',
      campos: [
        { nombre: 'numero_radicado', etiqueta: 'Número de radicado', requerido: true },
        { nombre: 'medio', etiqueta: 'Medio', tipo: 'select', vacio: false, opciones: [['WEB', 'Página web de la entidad'], ['FISICO', 'Físico en la oficina']], valor: 'WEB', requerido: true },
        { nombre: 'evidencia', etiqueta: 'Evidencia (pantallazo, constancia o copia sellada)', tipo: 'file', requerido: true },
        { nombre: 'descripcion', etiqueta: 'Observaciones (oficina, funcionario que recibe…)', tipo: 'textarea' },
      ],
    });
    if (!r0) return null;
    const { evidencia, ...campos } = r0;
    return api(`/incapacidades/${c.id}/radicar`, { method: 'POST', formData: formulario(campos, { evidencia }) });
  });

  const rechazar = accion(async (c) => {
    const causal = await dlg.pedirTexto(`Rechazo de la transcripción · ${c.numero_caso}`, 'Causal informada por la entidad', '', {
      campo: { tipo: 'textarea' }, textoAceptar: 'Registrar rechazo', peligro: true,
    });
    if (!causal) return null;
    return api(`/incapacidades/${c.id}/rechazar`, { method: 'POST', body: { causal } });
  });

  const subsanar = accion(async (c) => {
    const descripcion = await dlg.pedirTexto(`Subsanar ${c.numero_caso}`, 'Cómo se subsanó la causal', '', {
      descripcion: `Causal: ${c.causal_rechazo || 'no registrada'}. El caso vuelve a quedar listo para transcribir.`,
      campo: { tipo: 'textarea' }, textoAceptar: 'Marcar como subsanado',
    });
    if (!descripcion) return null;
    return api(`/incapacidades/${c.id}/subsanar`, { method: 'POST', body: { descripcion } });
  });

  const juridica = accion(async (c) => {
    const causal = await dlg.pedirTexto(`Trasladar ${c.numero_caso} a jurídica`, 'Por qué la causal de rechazo es improcedente', '', {
      descripcion: 'Use esta opción cuando la entidad negó la incapacidad con una causal que no aplica. Jurídica radicará un derecho de petición.',
      campo: { tipo: 'textarea' }, textoAceptar: 'Trasladar a jurídica', peligro: true,
    });
    if (!causal) return null;
    return api(`/incapacidades/${c.id}/trasladar-juridica`, { method: 'POST', body: { causal: `Rechazo improcedente: ${causal}` } });
  });

  async function reporteSGSST(conIA) {
    setCargando(conIA ? 'ia' : 'reporte');
    try {
      setSgsst(await api(`/sgsst/reporte?periodo=${periodo}${conIA ? '&ia=true' : ''}`));
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
    finally { setCargando(null); }
  }

  const iaRes = sgsst?.analisis_ia;
  const conteo = (estado) => (casos || []).filter((c) => c.estado === estado).length;

  return (
    <div>
      <Encabezado titulo="Transcripción y radicación"
        descripcion="Casos verificados por transcribir o radicar ante la entidad, ordenados por el plazo que les queda, y casos rechazados por subsanar." />
      <Aviso msj={msj} onCerrar={() => setMsj(null)} />

      <Panel titulo="Bandeja de trámite ante la entidad"
        sub={casos ? `${conteo('VERIFICADA')} por transcribir o radicar · ${conteo('TRANSCRITA')} transcrito(s) por radicar · ${conteo('RECHAZADA')} rechazado(s)` : 'Cargando…'}
        cuerpo={false}>
        {casos?.length ? (
          <div className="tabla-wrap">
            <table>
              <thead><tr><th>Caso</th><th>Entidad</th><th>Canal</th><th>Estado y plazo</th><th className="th-acciones">Acciones</th></tr></thead>
              <tbody>
                {casos.map((c) => (
                  <tr key={c.id} className={c.plazo_vencido || c.estado === 'RECHAZADA' ? 'fila-alerta' : ''}>
                    <td>
                      <span className="caso">{c.numero_caso}</span>
                      <span className="secundario-texto">{c.colaborador?.usuario?.nombre} · {tipo(c.tipo)} · {c.dias} día(s)</span>
                    </td>
                    <td>
                      {c.entidad?.nombre}
                      {c.entidad?.portal_url && (
                        <a className="secundario-texto" href={c.entidad.portal_url} target="_blank" rel="noreferrer">
                          Abrir portal <ExternalLink size={12} aria-hidden="true" />
                        </a>
                      )}
                    </td>
                    <td>
                      <span className="exp-meta" style={{ marginTop: 0 }}>
                        <span>{c.canal_entidad === 'PORTAL_WEB'
                          ? <><Monitor size={14} aria-hidden="true" />Portal web</>
                          : <><Mail size={14} aria-hidden="true" />Correo</>}</span>
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Estado valor={c.estado} />
                      {c.estado === 'RECHAZADA' && <span className="secundario-texto texto-alerta" style={{ whiteSpace: 'normal' }}>{c.causal_rechazo || 'Sin causal'}</span>}
                      {c.estado === 'VERIFICADA' && (c.plazo_vencido
                        ? <span className="secundario-texto texto-alerta">Plazo de transcripción vencido</span>
                        : <span className="secundario-texto">{c.prioritario ? <span className="resaltado">Quedan {c.plazo_restante_dias} días</span> : `Quedan ${c.plazo_restante_dias} días para transcribir`}</span>)}
                      {c.estado === 'TRANSCRITA' && <span className="secundario-texto">Pendiente de radicar</span>}
                    </td>
                    <td>
                      <div className="acciones">
                        {c.estado === 'VERIFICADA' && <>
                          <button className="secundario" onClick={() => radicar(c)} title="Si la entidad no exige transcripción">Radicar directo</button>
                          <button onClick={() => transcribir(c)} disabled={c.plazo_vencido} title={c.plazo_vencido ? 'Requiere autorización de la coordinación' : undefined}>Transcribir</button>
                        </>}
                        {c.estado === 'TRANSCRITA' && <>
                          <button className="peligro" onClick={() => rechazar(c)}>Rechazo</button>
                          <button onClick={() => radicar(c)}>Radicar</button>
                        </>}
                        {c.estado === 'RECHAZADA' && <>
                          <button className="peligro" onClick={() => juridica(c)}>Causal improcedente</button>
                          <button onClick={() => subsanar(c)}>Subsanar</button>
                        </>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : casos && (
          <Vacio icono={Stamp} titulo="Nada por transcribir ni radicar">
            Los casos llegan aquí cuando quedan verificados. Los plazos de cada entidad se calculan solos.
          </Vacio>
        )}
      </Panel>

      <Panel
        titulo="Reporte de ausentismo al SG-SST"
        sub="Se envía en los primeros 3 días de cada mes. Cuenta solo los días que caen dentro del periodo."
        extra={
          <div className="en-linea">
            <input type="month" aria-label="Periodo" style={{ width: 170 }} value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
            <button onClick={() => reporteSGSST(false)} disabled={cargando === 'reporte'}>
              {cargando === 'reporte' ? 'Generando…' : 'Generar reporte'}
            </button>
          </div>
        }
      >
        {sgsst ? <>
          <div className="regla-hitos cuatro">
            {[
              ['Incapacidades', sgsst.resumen.total_incapacidades, 'Casos con días en el periodo'],
              ['Colaboradores', sgsst.resumen.colaboradores_afectados, 'Personas afectadas'],
              ['Días perdidos', sgsst.resumen.dias_perdidos, 'Días de ausencia en el periodo'],
              ['Promedio', sgsst.resumen.promedio_dias, 'Días por incapacidad'],
            ].map(([t, n, q]) => (
              <div key={t}><div className="dia">{t}</div><div className={`n ${n ? '' : 'cero'}`}>{n}</div><div className="que">{q}</div></div>
            ))}
          </div>
          {sgsst.registros.length > 0 && (
            <div className="sub-tabla tabla-wrap">
              <table>
                <thead><tr><th>Caso</th><th>Colaborador</th><th>Área</th><th>Tipo</th><th>Origen</th><th>CIE-10</th><th className="num">Días</th></tr></thead>
                <tbody>
                  {sgsst.registros.map((r) => (
                    <tr key={r.numero_caso}>
                      <td className="caso">{r.numero_caso}</td><td>{r.colaborador}</td><td>{r.area}</td>
                      <td>{TIPOS[r.tipo] || r.tipo}</td><td>{r.origen === 'LABORAL' ? 'Laboral' : 'Común'}</td>
                      <td>{r.diagnostico_agrupado}</td><td className="num">{r.dias}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </> : <p className="texto-tenue">Elija el periodo y genere el reporte.</p>}

        <PanelIA
          titulo="Análisis de ausentismo con IA"
          descripcion="Hallazgos, áreas críticas y recomendaciones para el SG-SST. A la IA se envían solo datos agrupados, sin nombres."
          accion="Analizar con IA"
          cargando={cargando === 'ia'}
          onEjecutar={() => reporteSGSST(true)}
        >
          {iaRes && <>
            <p>{iaRes.resumen_ejecutivo}</p>
            {iaRes.hallazgos?.length > 0 && <><h4>Hallazgos</h4><ul>{iaRes.hallazgos.map((h, i) => <li key={i}>{h}</li>)}</ul></>}
            {iaRes.areas_criticas?.length > 0 && <><h4>Áreas críticas</h4><ul>{iaRes.areas_criticas.map((h, i) => <li key={i}>{h}</li>)}</ul></>}
            {iaRes.recomendaciones_sgsst?.length > 0 && <><h4>Recomendaciones</h4><ul>{iaRes.recomendaciones_sgsst.map((h, i) => <li key={i}>{h}</li>)}</ul></>}
          </>}
        </PanelIA>
      </Panel>
    </div>
  );
}
