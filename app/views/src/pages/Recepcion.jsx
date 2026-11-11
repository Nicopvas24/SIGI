// Vista Reporte y recepción
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, FileText, FolderOpen, Sparkles, Upload } from 'lucide-react';
import { api, abrirDocumento, formulario, sesion } from '../api.js';
import BuscadorColaborador from '../components/BuscadorColaborador.jsx';
import {
  ARCHIVOS_ACEPTADOS, Aviso, DOCUMENTOS, Encabezado, Estado, Panel, TIPOS, Vacio,
  documento, documentosRequeridos, fecha, tipo, useDialogo, useIA,
} from '../ui.jsx';

const CANALES = [
  ['PRESENCIAL', 'Recepción (presencial)'], ['GESTION_HUMANA', 'Directo en Gestión Humana'],
  ['OFICINA_PRINCIPAL', 'Oficina principal'], ['LIDER_COMERCIAL', 'Líder comercial'], ['CORREO_ELECTRONICO', 'Correo electrónico'],
];
const ABIERTOS_A_SOPORTES = ['REPORTADA', 'DOCUMENTACION_REMITIDA', 'RECIBIDA', 'DOCUMENTACION_INCOMPLETA'];
const CERRADOS = ['ARCHIVADA', 'DADA_DE_BAJA'];
const TERMINADOS = [...CERRADOS, 'PAGADA'];
const FORM_INICIAL = { colaborador_id: '', tipo: 'ENFERMEDAD_GENERAL', fecha_inicio: '', dias: 1, entidad_id: '', diagnostico_cie10: '', observaciones: '' };

export default function Recepcion() {
  const usuario = sesion()?.usuario;
  const rol = usuario?.rol;
  const esColaborador = rol === 'COLABORADOR';
  const gestiona = ['AUXILIAR', 'RECEPCIONISTA', 'ADMIN'].includes(rol);
  const dlg = useDialogo();
  const iaActiva = useIA();

  const [casos, setCasos] = useState(null);
  const [entidades, setEntidades] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [form, setForm] = useState(FORM_INICIAL);
  const [msj, setMsj] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [lectura, setLectura] = useState(null); // resultado de la IA
  const [certificado, setCertificado] = useState(null); // archivo leído por la IA, se adjunta al crear el caso
  const [abierto, setAbierto] = useState(null);
  const [verCerrados, setVerCerrados] = useState(false);
  const [faltaColaborador, setFaltaColaborador] = useState(false);
  const buscadorRef = useRef(null);

  const cargar = () => api('/incapacidades').then(setCasos).catch((e) => { setCasos([]); setMsj({ t: 'error', m: e.message }); });
  useEffect(() => {
    cargar();
    api('/entidades').then(setEntidades).catch(() => {});
    api('/colaboradores').then((c) => {
      setColaboradores(c);
      if (c.length === 1) setForm((f) => ({ ...f, colaborador_id: c[0].id, entidad_id: c[0].eps?.id || f.entidad_id }));
    }).catch(() => {});
  }, []);

  const requeridos = documentosRequeridos(form.tipo, form.dias);
  const visibles = useMemo(() => (casos || []).filter((c) => verCerrados || !CERRADOS.includes(c.estado)), [casos, verCerrados]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // Casos sin terminar por colaborador, para avisar en el buscador (posible prórroga)
  const casosAbiertos = useMemo(() => {
    const m = {};
    for (const c of casos || []) if (!TERMINADOS.includes(c.estado)) (m[c.colaborador_id] ||= []).push(c);
    return m;
  }, [casos]);

  function elegirColaborador(id) {
    const c = colaboradores.find((x) => x.id === id);
    if (id) setFaltaColaborador(false);
    // La EPS del colaborador se propone como entidad; el usuario puede cambiarla (p. ej. ARL en accidente laboral)
    setForm((f) => ({ ...f, colaborador_id: id, entidad_id: c?.eps?.id || f.entidad_id }));
  }

  async function informar(e, confirmarNoProrroga = false, prorrogaDe = null) {
    e?.preventDefault();
    if (!esColaborador && !form.colaborador_id) {
      setFaltaColaborador(true);
      buscadorRef.current?.focus();
      return;
    }
    setMsj(null);
    setEnviando(true);
    try {
      const r = await api('/incapacidades', {
        method: 'POST',
        body: { ...form, dias: Number(form.dias), entidad_id: Number(form.entidad_id), confirmar_no_prorroga: confirmarNoProrroga, prorroga_de: prorrogaDe },
      });
      let extra = '';
      if (certificado) {
        try {
          await api(`/incapacidades/${r.caso.id}/documentos`, { method: 'POST', formData: formulario({}, { CERTIFICADO: certificado }) });
          extra = ' El certificado leído quedó adjunto al caso.';
        } catch (err) { extra = ` No se pudo adjuntar el certificado: ${err.message}`; }
      }
      setMsj({ t: 'ok', m: `${r.mensaje} Soportes requeridos: ${r.documentos_requeridos.map(documento).join(', ')}.${extra}` });
      setForm((f) => ({ ...FORM_INICIAL, colaborador_id: colaboradores.length === 1 ? f.colaborador_id : '', entidad_id: colaboradores.length === 1 ? f.entidad_id : '' }));
      setLectura(null);
      setCertificado(null);
      cargar();
    } catch (err) {
      if (err.status === 409 && err.datos?.caso_existente_id) {
        const esProrroga = await dlg.confirmar('¿Es una prórroga?',
          `${err.message}\n\nSi es una prórroga se vincula a ese caso y sus días se suman para los hitos de 90, 120, 150 y 180 días.`,
          { textoAceptar: 'Sí, es prórroga' });
        return informar(null, !esProrroga, esProrroga ? err.datos.caso_existente_id : null);
      }
      setMsj({ t: 'error', m: err.message });
    } finally {
      setEnviando(false);
    }
  }

  async function leerCertificado(e) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setLectura({ cargando: true, nombre: archivo.name });
    try {
      const d = await api('/ia/leer-certificado', { method: 'POST', formData: formulario({}, { archivo }) });
      setLectura(d);
      if (d.legible !== false) {
        setCertificado(archivo);
        setForm((f) => ({
          ...f,
          tipo: d.tipo_novedad || f.tipo,
          fecha_inicio: d.fecha_inicio || f.fecha_inicio,
          dias: d.dias || f.dias,
          entidad_id: d.entidad_id || f.entidad_id,
          diagnostico_cie10: d.diagnostico_cie10 || f.diagnostico_cie10,
          colaborador_id: !esColaborador && d.colaborador_sugerido ? d.colaborador_sugerido.id : f.colaborador_id,
        }));
      }
    } catch (err) {
      setLectura(null);
      setMsj({ t: 'error', m: err.message });
    }
  }

  async function remitir(caso) {
    const req = documentosRequeridos(caso.tipo, caso.dias);
    const tipos = [...req, ...Object.keys(DOCUMENTOS).filter((d) => !req.includes(d))];
    const r0 = await dlg.pedir({
      titulo: `Adjuntar soportes · ${caso.numero_caso}`,
      descripcion: `Exigidos para ${tipo(caso.tipo).toLowerCase()}: ${req.map(documento).join(', ')}.\nAdjunte el PDF o la foto de cada uno. Los originales se entregan en físico.`,
      textoAceptar: 'Enviar soportes',
      campos: tipos.map((t) => ({ nombre: t, etiqueta: documento(t), tipo: 'file', requerido: false })),
    });
    if (!r0) return;
    const archivos = Object.fromEntries(Object.entries(r0).filter(([, f]) => f));
    if (!Object.keys(archivos).length) return setMsj({ t: 'error', m: 'No adjuntó ningún archivo.' });
    try {
      const r = await api(`/incapacidades/${caso.id}/documentos`, { method: 'POST', formData: formulario({}, archivos) });
      setMsj({
        t: r.faltantes.length || r.extemporanea ? 'info' : 'ok',
        m: `${r.mensaje}${r.extemporanea ? ' La entrega quedó marcada como extemporánea.' : ''}` +
          (r.faltantes.length ? ` Aún faltan: ${r.faltantes.map(documento).join(', ')}.` : ''),
      });
      cargar();
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
  }

  async function recibir(caso) {
    const cargados = new Set(caso.documentos.map((d) => d.tipo_documento));
    const r0 = await dlg.pedir({
      titulo: `Registrar recepción · ${caso.numero_caso}`,
      descripcion: `${caso.colaborador?.usuario?.nombre} · ${tipo(caso.tipo)}. Marque los documentos físicos que entrega.`,
      textoAceptar: 'Registrar recepción',
      campos: [
        { nombre: 'canal', etiqueta: 'Canal de entrega', tipo: 'select', opciones: CANALES, vacio: false, requerido: true,
          valor: rol === 'RECEPCIONISTA' ? 'PRESENCIAL' : 'GESTION_HUMANA' },
        { nombre: 'fisicos', etiqueta: 'Documentos recibidos en físico', tipo: 'multi',
          opciones: Object.entries(DOCUMENTOS), valor: documentosRequeridos(caso.tipo, caso.dias).filter((d) => !cargados.has(d)).concat([...cargados]) },
      ],
    });
    if (!r0) return;
    try {
      const r = await api(`/incapacidades/${caso.id}/recibir`, { method: 'POST', body: { canal: r0.canal, documentos_fisicos: r0.fisicos } });
      setMsj({ t: 'ok', m: `${r.mensaje} Recibió ${r.comprobante.receptor} el ${fecha(r.comprobante.fecha)}.` });
      cargar();
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
  }

  async function reemplazo(caso) {
    const opciones = colaboradores.filter((c) => c.id !== caso.colaborador_id).map((c) => [c.id, `${c.usuario?.nombre} · ${c.cargo || c.area || ''}`]);
    const r0 = await dlg.pedir({
      titulo: `Asignar reemplazo · ${caso.numero_caso}`,
      descripcion: `${caso.colaborador?.usuario?.nombre} estará ausente del ${fecha(caso.fecha_inicio)} al ${fecha(caso.fecha_fin)}.`,
      textoAceptar: 'Registrar',
      campos: [
        { nombre: 'reemplazo_id', etiqueta: 'Reemplazo', tipo: 'select', opciones, vacio: 'Sin reemplazo disponible' },
        { nombre: 'fecha_inicio', etiqueta: 'Desde', tipo: 'date', valor: caso.fecha_inicio, requerido: true },
        { nombre: 'fecha_fin', etiqueta: 'Hasta', tipo: 'date', valor: caso.fecha_fin, requerido: true },
        { nombre: 'justificacion', etiqueta: 'Justificación', tipo: 'textarea', ayuda: 'Obligatoria si no hay reemplazo.' },
      ],
    });
    if (!r0) return;
    try {
      const r = await api(`/incapacidades/${caso.id}/reemplazo`, { method: 'POST', body: { ...r0, reemplazo_id: r0.reemplazo_id || null } });
      setMsj({ t: 'ok', m: r.mensaje });
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
  }

  async function ver(d) {
    try { await abrirDocumento(d.id); } catch (e) { setMsj({ t: 'error', m: e.message }); }
  }

  const puedeAdjuntar = (c) => ABIERTOS_A_SOPORTES.includes(c.estado) && (gestiona || c.colaborador?.usuario?.id === usuario?.id || rol === 'LIDER');
  const incompletos = (casos || []).filter((c) => c.estado === 'DOCUMENTACION_INCOMPLETA');

  return (
    <div>
      <Encabezado titulo="Reporte y recepción"
        descripcion={esColaborador ? 'Informe su incapacidad o licencia y adjunte los soportes.' : 'Registre incapacidades, adjunte soportes y deje constancia de su recepción.'} />
      <Aviso msj={msj} onCerrar={() => setMsj(null)} />
      {esColaborador && incompletos.length > 0 && (
        <Aviso msj={{ t: 'info', m: `Tiene ${incompletos.length} caso(s) con soportes pendientes. Adjúntelos desde la tabla de abajo.` }} />
      )}

      <Panel titulo="Informar incapacidad" sub="Si las fechas se cruzan con un caso existente, el sistema le preguntará si es una prórroga.">
        {iaActiva !== false && (
          <div className="ia" style={{ marginTop: 0, marginBottom: 16 }}>
            <div className="ia-cabeza">
              <div className="ia-titulo"><Sparkles size={17} aria-hidden="true" />Llenar con el certificado</div>
              <label className={`boton secundario ${lectura?.cargando || !iaActiva ? 'deshabilitado' : ''}`}>
                <Upload size={15} aria-hidden="true" />{lectura?.cargando ? 'Leyendo…' : 'Subir certificado'}
                <input type="file" accept={ARCHIVOS_ACEPTADOS} className="sr-only" onChange={leerCertificado} disabled={lectura?.cargando || !iaActiva} />
              </label>
            </div>
            <p className="ia-nota">Suba el PDF o la foto del certificado: la IA propone tipo, fechas, días, entidad y diagnóstico. Revise los datos antes de enviar.</p>
            {lectura && !lectura.cargando && (
              <div className="ia-cuerpo">
                {lectura.legible === false
                  ? <p className="texto-alerta">No se pudo leer como certificado: {lectura.observaciones}</p>
                  : <>
                      <div className="chips" style={{ marginTop: 0 }}>
                        <span className={`chip ${lectura.confianza === 'ALTA' ? 'ok' : lectura.confianza === 'BAJA' ? 'mal' : ''}`}>Confianza {String(lectura.confianza || '').toLowerCase()}</span>
                        {lectura.nombre_colaborador && <span className="chip">{lectura.nombre_colaborador}</span>}
                        {lectura.documento && <span className="chip">C.C. {lectura.documento}</span>}
                        {lectura.entidad && <span className="chip">{lectura.entidad}{lectura.entidad_id ? '' : ' (no registrada)'}</span>}
                      </div>
                      {lectura.campos_dudosos?.length > 0 && <p className="ayuda" style={{ marginTop: 8 }}>Revise a mano: {lectura.campos_dudosos.join(', ')}.</p>}
                      {!esColaborador && lectura.documento && !lectura.colaborador_sugerido && <p className="ayuda" style={{ marginTop: 4 }}>El documento {lectura.documento} no corresponde a un colaborador registrado: selecciónelo a mano.</p>}
                      {lectura.observaciones && <p className="ayuda" style={{ marginTop: 4 }}>{lectura.observaciones}</p>}
                      <p className="ayuda" style={{ marginTop: 4 }}>El certificado se adjuntará al caso al enviarlo.</p>
                    </>}
              </div>
            )}
          </div>
        )}

        <form onSubmit={informar} className="form-grid">
          {!esColaborador && (
            <div className="campo ancho">
              <label htmlFor="f-col">Colaborador incapacitado</label>
              <BuscadorColaborador
                ref={buscadorRef}
                id="f-col"
                colaboradores={colaboradores}
                valor={form.colaborador_id}
                onCambiar={elegirColaborador}
                casosAbiertos={casosAbiertos}
                invalido={faltaColaborador}
                requerido
                onInvalido={() => setFaltaColaborador(true)}
              />
              {faltaColaborador && <span className="texto-alerta ayuda" role="alert">Busque y seleccione el colaborador que tiene la incapacidad.</span>}
            </div>
          )}
          <div className="campo">
            <label htmlFor="f-tipo">Tipo de novedad</label>
            <select id="f-tipo" value={form.tipo} onChange={set('tipo')}>
              {Object.entries(TIPOS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="f-entidad">Entidad (EPS o ARL)</label>
            <select id="f-entidad" value={form.entidad_id} onChange={set('entidad_id')} required>
              <option value="">Seleccione…</option>
              {entidades.map((en) => <option key={en.id} value={en.id}>{en.nombre} · {en.tipo}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="f-inicio">Fecha de inicio</label>
            <input id="f-inicio" type="date" value={form.fecha_inicio} onChange={set('fecha_inicio')} required />
          </div>
          <div className="campo">
            <label htmlFor="f-dias">Días de incapacidad</label>
            <input id="f-dias" type="number" min="1" step="1" value={form.dias} onChange={set('dias')} required />
          </div>
          <div className="campo">
            <label htmlFor="f-dx">Diagnóstico CIE-10 <span className="texto-tenue">(opcional)</span></label>
            <input id="f-dx" value={form.diagnostico_cie10} onChange={set('diagnostico_cie10')} placeholder="Ej. J06.9" maxLength={10} />
          </div>
          <div className="campo">
            <label htmlFor="f-obs">Observaciones <span className="texto-tenue">(opcional)</span></label>
            <input id="f-obs" value={form.observaciones} onChange={set('observaciones')} />
          </div>
          <div className="campo ancho">
            <span className="etiqueta">Soportes que deberá entregar</span>
            <div className="chips" style={{ marginTop: 0 }}>
              {requeridos.map((d) => <span key={d} className="chip"><FileText size={13} aria-hidden="true" />{documento(d)}</span>)}
            </div>
          </div>
          <div className="form-acciones ancho">
            <button type="submit" disabled={enviando}>{enviando ? 'Registrando…' : 'Informar incapacidad'}</button>
          </div>
        </form>
      </Panel>

      <Panel
        titulo={esColaborador ? 'Mis incapacidades' : rol === 'LIDER' ? 'Incapacidades de mi equipo' : 'Incapacidades'}
        sub={casos ? `${visibles.length} caso(s)${verCerrados ? '' : ' abiertos'}` : 'Cargando…'}
        extra={<label className="opcion-check" style={{ minHeight: 30 }}>
          <input type="checkbox" checked={verCerrados} onChange={(e) => setVerCerrados(e.target.checked)} />Incluir archivados
        </label>}
        cuerpo={false}
      >
        {visibles.length ? (
          <div className="tabla-wrap">
            <table>
              <thead><tr><th style={{ width: 28 }} /><th>Caso</th><th>Tipo</th><th>Inicio</th><th className="num">Días</th><th>Entidad</th><th>Estado</th><th className="th-acciones">Acciones</th></tr></thead>
              <tbody>
                {visibles.map((c) => {
                  const exp = abierto === c.id;
                  const faltantes = documentosRequeridos(c.tipo, c.dias).filter((d) =>
                    !c.documentos.some((x) => x.tipo_documento === d && x.estado !== 'NO_CONFORME'));
                  return (
                    <Fragment key={c.id}>
                      <tr className={c.estado === 'DOCUMENTACION_INCOMPLETA' ? 'fila-alerta' : ''}>
                        <td>
                          <button className="fantasma" style={{ padding: 0, width: 26, minHeight: 26 }} onClick={() => setAbierto(exp ? null : c.id)}
                            aria-expanded={exp} aria-label={`Ver detalle de ${c.numero_caso}`}>
                            {exp ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </td>
                        <td><span className="caso">{c.numero_caso}</span><span className="secundario-texto">{c.colaborador?.usuario?.nombre}</span></td>
                        <td>{tipo(c.tipo)}{c.prorroga_de && <span className="secundario-texto">Prórroga</span>}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{fecha(c.fecha_inicio)}</td>
                        <td className="num">{c.dias}</td>
                        <td>{c.entidad?.nombre}</td>
                        <td><Estado valor={c.estado} />{c.extemporanea && <span className="secundario-texto texto-alerta">Extemporánea</span>}</td>
                        <td>
                          <div className="acciones">
                            {rol === 'LIDER' && !CERRADOS.includes(c.estado) && <button className="secundario" onClick={() => reemplazo(c)}>Reemplazo</button>}
                            {gestiona && ['REPORTADA', 'DOCUMENTACION_REMITIDA'].includes(c.estado) && <button className="secundario" onClick={() => recibir(c)}>Registrar recepción</button>}
                            {puedeAdjuntar(c) && <button onClick={() => remitir(c)}>Adjuntar soportes</button>}
                          </div>
                        </td>
                      </tr>
                      {exp && (
                        <tr>
                          <td />
                          <td colSpan={7} style={{ background: 'var(--superficie-2)' }}>
                            <div className="exp-meta" style={{ marginTop: 0 }}>
                              <span>Del <b>{fecha(c.fecha_inicio)}</b> al <b>{fecha(c.fecha_fin)}</b></span>
                              {c.diagnostico_cie10 && <span>CIE-10 <b>{c.diagnostico_cie10}</b></span>}
                              {c.observaciones && <span>{c.observaciones}</span>}
                            </div>
                            <div className="chips">
                              {c.documentos.length ? c.documentos.map((d) => (
                                <button key={d.id} type="button" className={`chip ${['CONFORME', 'ARCHIVADO_DIGITAL', 'TRANSFERIDO'].includes(d.estado) ? 'ok' : d.estado === 'NO_CONFORME' ? 'mal' : ''}`}
                                  onClick={() => d.url && ver(d)} disabled={!d.url} title={d.url ? 'Abrir archivo' : 'Entregado solo en físico'}
                                  style={{ cursor: d.url ? 'pointer' : 'default' }}>
                                  <FileText size={13} aria-hidden="true" />{documento(d.tipo_documento)}
                                  {d.estado === 'NO_CONFORME' && ' · no conforme'}{!d.url && ' · físico'}
                                </button>
                              )) : <span className="texto-tenue">Sin soportes cargados.</span>}
                            </div>
                            {faltantes.length > 0 && !CERRADOS.includes(c.estado) && (
                              <p className="ayuda" style={{ marginTop: 8 }}>Pendientes: {faltantes.map(documento).join(', ')}.</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : casos && (
          <Vacio icono={FolderOpen} titulo={casos.length ? 'No hay casos abiertos' : 'Aún no hay casos'}>
            {casos.length ? 'Active "Incluir archivados" para ver el historial.' : 'Cuando se informe una incapacidad con el formulario de arriba, aparecerá aquí con su número de caso.'}
          </Vacio>
        )}
      </Panel>
    </div>
  );
}
