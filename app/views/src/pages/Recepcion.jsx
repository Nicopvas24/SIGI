// Vista Reporte y recepción (CU-01 a CU-06)
import { useEffect, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { api, sesion } from '../api.js';
import { Aviso, Encabezado, Estado, Panel, PanelIA, TIPOS, Vacio, fecha, tipo, useDialogo } from '../ui.jsx';

const DOCUMENTOS = [
  ['CERTIFICADO', 'Certificado'], ['EPICRISIS', 'Epicrisis'], ['FURIPS', 'FURIPS'],
  ['NACIDO_VIVO', 'Certificado nacido vivo'], ['REGISTRO_CIVIL', 'Registro civil'], ['DOC_IDENTIDAD', 'Documento de identidad'],
];

export default function Recepcion() {
  const rol = sesion()?.usuario?.rol;
  const dlg = useDialogo();
  const [casos, setCasos] = useState(null);
  const [entidades, setEntidades] = useState([]);
  const [form, setForm] = useState({ tipo: 'ENFERMEDAD_GENERAL', fecha_inicio: '', dias: 1, entidad_id: '', observaciones: '' });
  const [msj, setMsj] = useState(null);
  const [ocr, setOcr] = useState(null);
  const [textoCert, setTextoCert] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cargar = () => api('/incapacidades').then(setCasos).catch((e) => { setCasos([]); setMsj({ t: 'error', m: e.message }); });
  useEffect(() => { cargar(); api('/entidades').then(setEntidades).catch(() => {}); }, []);

  async function informar(e, confirmarNoProrroga = false, prorrogaDe = null) {
    e?.preventDefault();
    setMsj(null);
    setEnviando(true);
    try {
      const r = await api('/incapacidades', {
        method: 'POST',
        body: { ...form, dias: Number(form.dias), confirmar_no_prorroga: confirmarNoProrroga, prorroga_de: prorrogaDe },
      });
      setMsj({ t: 'ok', m: `${r.mensaje} Documentos requeridos: ${r.documentos_requeridos.join(', ')}.` });
      cargar();
    } catch (err) {
      if (err.status === 409 && err.datos?.caso_existente_id) {
        const esProrroga = await dlg.confirmar(
          '¿Es una prórroga?',
          `${err.message}\nCaso existente: ${err.datos.caso_existente}.\n\nConfirme para registrarla como prórroga de ese caso, o cancele para registrarla como un caso nuevo.`,
          { textoAceptar: 'Registrar como prórroga' }
        );
        return informar(null, !esProrroga, esProrroga ? err.datos.caso_existente_id : null);
      }
      setMsj({ t: 'error', m: err.message });
    } finally {
      setEnviando(false);
    }
  }

  async function remitirDocs(caso) {
    const r0 = await dlg.pedir({
      titulo: `Remitir soportes · ${caso.numero_caso}`,
      descripcion: 'Marque los documentos que entrega el colaborador.',
      textoAceptar: 'Remitir',
      campos: [{ nombre: 'tipos', etiqueta: 'Documentos', tipo: 'multi', opciones: DOCUMENTOS, valor: ['CERTIFICADO'] }],
    });
    if (!r0?.tipos?.length) return;
    const fd = new FormData();
    r0.tipos.forEach((t) => fd.append('tipos_documento', t));
    fd.append('canal_entrega', 'PRESENCIAL');
    try {
      const r = await api(`/incapacidades/${caso.id}/documentos`, { method: 'POST', formData: fd });
      setMsj({ t: r.extemporanea ? 'info' : 'ok', m: `${r.mensaje}${r.extemporanea ? ' Remisión extemporánea.' : ''} Faltantes: ${r.faltantes.join(', ') || 'ninguno'}.` });
      cargar();
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
  }

  async function recibir(caso) {
    try {
      const r = await api(`/incapacidades/${caso.id}/recibir`, { method: 'POST', body: {} });
      setMsj({ t: 'ok', m: `Recibida. Comprobante ${r.comprobante.numero_caso} · ${r.comprobante.canal} · ${r.comprobante.receptor}.` });
      cargar();
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
  }

  async function reemplazo(caso) {
    const justificacion = await dlg.pedirTexto(`Reemplazo · ${caso.numero_caso}`, 'Nombre del reemplazo o justificación',
      'Reemplazo interno del área', { descripcion: 'Escriba "Sin reemplazo" si no hay personal disponible.', textoAceptar: 'Registrar' });
    if (justificacion === null) return;
    try {
      await api(`/incapacidades/${caso.id}/reemplazo`, { method: 'POST', body: { justificacion } });
      setMsj({ t: 'ok', m: 'Reemplazo registrado y notificado.' });
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
  }

  async function extraerIA() {
    if (!textoCert.trim()) return setMsj({ t: 'error', m: 'Pegue el texto del certificado para extraer los datos.' });
    setOcr({ cargando: true });
    try {
      const datos = await api('/ia/extraer-certificado', { method: 'POST', body: { texto: textoCert } });
      setOcr(datos);
      if (datos.fecha_inicio) setForm((f) => ({ ...f, fecha_inicio: datos.fecha_inicio, dias: datos.dias || f.dias, tipo: datos.tipo_novedad || f.tipo }));
    } catch (e) { setOcr(null); setMsj({ t: 'error', m: e.message }); }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const gestiona = ['AUXILIAR', 'RECEPCIONISTA', 'ADMIN'].includes(rol);

  return (
    <div>
      <Encabezado
        titulo="Reporte y recepción"
        descripcion="Informe una incapacidad, remita los soportes y registre su recepción."
        refs={['CU-01', 'CU-06']}
      />
      <Aviso msj={msj} onCerrar={() => setMsj(null)} />

      <Panel titulo="Informar incapacidad" sub="Si las fechas se cruzan con un caso existente, el sistema le preguntará si es una prórroga.">
        <form onSubmit={informar} className="form-grid">
          <div className="campo">
            <label htmlFor="f-tipo">Tipo de novedad</label>
            <select id="f-tipo" value={form.tipo} onChange={set('tipo')}>
              {Object.entries(TIPOS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="f-entidad">Entidad (EPS o ARL)</label>
            <select id="f-entidad" value={form.entidad_id} onChange={(e) => setForm({ ...form, entidad_id: Number(e.target.value) })} required>
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
            <input id="f-dias" type="number" min="1" value={form.dias} onChange={set('dias')} required />
          </div>
          <div className="campo ancho">
            <label htmlFor="f-obs">Observaciones</label>
            <input id="f-obs" value={form.observaciones} onChange={set('observaciones')} placeholder="Opcional" />
          </div>
          <div className="form-acciones ancho">
            <button type="submit" disabled={enviando}>{enviando ? 'Informando…' : 'Informar incapacidad'}</button>
          </div>
        </form>

        {gestiona && (
          <PanelIA
            titulo="Extraer datos del certificado"
            descripcion="Pegue el texto del certificado recibido por correo y la IA propondrá fechas, días y diagnóstico."
            accion="Extraer con IA"
            cargando={ocr?.cargando}
            onEjecutar={extraerIA}
          >
            <textarea rows={3} aria-label="Texto del certificado" placeholder="Texto del certificado recibido por correo…"
              value={textoCert} onChange={(e) => setTextoCert(e.target.value)} />
            {ocr && !ocr.cargando && (
              <div style={{ marginTop: 10 }}>
                <div className="chips">
                  <span className="chip">{tipo(ocr.tipo_novedad)}</span>
                  <span className="chip">Inicio {fecha(ocr.fecha_inicio)}</span>
                  <span className="chip">{ocr.dias} día(s)</span>
                  <span className="chip">CIE-10 {ocr.diagnostico_cie10 || '—'}</span>
                  <span className="chip">{ocr.entidad || 'Entidad sin identificar'}</span>
                  <span className={`chip ${ocr.confianza === 'ALTA' ? 'ok' : ocr.confianza === 'BAJA' ? 'mal' : ''}`}>Confianza {ocr.confianza?.toLowerCase()}</span>
                </div>
                {ocr.campos_dudosos?.length > 0 && <p className="ayuda" style={{ marginTop: 8 }}>Revisar manualmente: {ocr.campos_dudosos.join(', ')}</p>}
              </div>
            )}
          </PanelIA>
        )}
      </Panel>

      <Panel titulo={rol === 'COLABORADOR' ? 'Mis incapacidades' : 'Casos abiertos'} sub={casos ? `${casos.length} caso(s)` : 'Cargando…'} cuerpo={false}>
        {casos?.length ? (
          <div className="tabla-wrap">
            <table>
              <thead><tr><th>Caso</th><th>Tipo</th><th>Inicio</th><th className="num">Días</th><th>Entidad</th><th>Estado</th><th className="th-acciones">Acciones</th></tr></thead>
              <tbody>
                {casos.map((c) => (
                  <tr key={c.id}>
                    <td><span className="caso">{c.numero_caso}</span><span className="secundario-texto">{c.colaborador?.usuario?.nombre}</span></td>
                    <td>{tipo(c.tipo)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fecha(c.fecha_inicio)}</td>
                    <td className="num">{c.dias}</td>
                    <td>{c.entidad?.nombre}</td>
                    <td><Estado valor={c.estado} /></td>
                    <td>
                      <div className="acciones">
                        {c.estado === 'REPORTADA' && <button onClick={() => remitirDocs(c)}>Remitir soportes</button>}
                        {rol === 'LIDER' && <button className="secundario" onClick={() => reemplazo(c)}>Reemplazo</button>}
                        {['DOCUMENTACION_REMITIDA', 'REPORTADA'].includes(c.estado) && gestiona &&
                          <button className="secundario" onClick={() => recibir(c)}>Recibir</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : casos && (
          <Vacio icono={FolderOpen} titulo="Aún no hay casos">
            Cuando se informe una incapacidad con el formulario de arriba, aparecerá aquí con su número de caso.
          </Vacio>
        )}
      </Panel>
    </div>
  );
}
