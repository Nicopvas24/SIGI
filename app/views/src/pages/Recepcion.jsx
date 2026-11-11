// Vista Reporte y recepción (CU-01 a CU-06)
import { useEffect, useState } from 'react';
import { api, sesion } from '../api.js';

const TIPOS = [
  ['ENFERMEDAD_GENERAL', 'Enfermedad general'],
  ['ACCIDENTE_LABORAL', 'Accidente laboral'],
  ['ACCIDENTE_TRANSITO', 'Accidente de tránsito'],
  ['LICENCIA_MATERNIDAD', 'Licencia de maternidad'],
  ['LICENCIA_PATERNIDAD', 'Licencia de paternidad'],
];

export default function Recepcion() {
  const rol = sesion()?.usuario?.rol;
  const [casos, setCasos] = useState([]);
  const [entidades, setEntidades] = useState([]);
  const [form, setForm] = useState({ tipo: 'ENFERMEDAD_GENERAL', fecha_inicio: '', dias: 1, entidad_id: '', observaciones: '' });
  const [msj, setMsj] = useState(null);
  const [ocr, setOcr] = useState(null);
  const [textoCert, setTextoCert] = useState('');

  const cargar = () => api('/incapacidades').then(setCasos).catch((e) => setMsj({ t: 'error', m: e.message }));
  useEffect(() => { cargar(); api('/entidades').then(setEntidades).catch(() => {}); }, []);

  async function informar(e, confirmarNoProrroga = false, prorrogaDe = null) {
    e?.preventDefault();
    setMsj(null);
    try {
      const r = await api('/incapacidades', {
        method: 'POST',
        body: { ...form, dias: Number(form.dias), confirmar_no_prorroga: confirmarNoProrroga, prorroga_de: prorrogaDe },
      });
      setMsj({ t: 'ok', m: `${r.mensaje} Documentos requeridos: ${r.documentos_requeridos.join(', ')}` });
      cargar();
    } catch (err) {
      if (err.status === 409 && err.datos?.caso_existente_id) {
        const esProrroga = window.confirm(
          `${err.message}\nCaso existente: ${err.datos.caso_existente}.\n¿Registrar como PRÓRROGA de ese caso?`
        );
        return informar(null, !esProrroga, esProrroga ? err.datos.caso_existente_id : null);
      }
      setMsj({ t: 'error', m: err.message });
    }
  }

  async function remitirDocs(caso) {
    const docs = prompt('Tipos de documento a remitir (separados por coma):\nCERTIFICADO, EPICRISIS, FURIPS, NACIDO_VIVO, REGISTRO_CIVIL, DOC_IDENTIDAD', 'CERTIFICADO,EPICRISIS');
    if (!docs) return;
    const fd = new FormData();
    docs.split(',').map((t) => t.trim()).forEach((t) => fd.append('tipos_documento', t));
    fd.append('canal_entrega', 'PRESENCIAL');
    try {
      const r = await api(`/incapacidades/${caso.id}/documentos`, { method: 'POST', formData: fd });
      setMsj({ t: r.extemporanea ? 'info' : 'ok', m: `${r.mensaje}${r.extemporanea ? ' (remisión EXTEMPORÁNEA)' : ''} Faltantes: ${r.faltantes.join(', ') || 'ninguno'}` });
      cargar();
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
  }

  async function recibir(caso) {
    try {
      const r = await api(`/incapacidades/${caso.id}/recibir`, { method: 'POST', body: {} });
      setMsj({ t: 'ok', m: `Recibida. Comprobante: ${r.comprobante.numero_caso} · ${r.comprobante.canal} · ${r.comprobante.receptor}` });
      cargar();
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
  }

  async function reemplazo(caso) {
    const justificacion = prompt('Justificación / nombre del reemplazo ("Sin reemplazo" si no hay disponibles):', 'Reemplazo interno del área');
    if (justificacion === null) return;
    try {
      await api(`/incapacidades/${caso.id}/reemplazo`, { method: 'POST', body: { justificacion } });
      setMsj({ t: 'ok', m: 'Reemplazo registrado y notificado (CU-03).' });
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
  }

  async function extraerIA() {
    if (!textoCert.trim()) return setMsj({ t: 'error', m: 'Pegue el texto del certificado para el OCR/IA' });
    setOcr({ cargando: true });
    try {
      const datos = await api('/ia/extraer-certificado', { method: 'POST', body: { texto: textoCert } });
      setOcr(datos);
      if (datos.fecha_inicio) setForm((f) => ({ ...f, fecha_inicio: datos.fecha_inicio, dias: datos.dias || f.dias, tipo: datos.tipo_novedad || f.tipo }));
    } catch (e) { setOcr(null); setMsj({ t: 'error', m: e.message }); }
  }

  return (
    <div>
      <h2>Reporte y recepción de incapacidades</h2>
      {msj && <div className={`alerta ${msj.t}`}>{msj.m}</div>}

      <div className="tarjeta">
        <h3>CU-01 · Informar incapacidad</h3>
        <form onSubmit={informar} className="form-grid">
          <div>
            <label>Tipo de novedad</label>
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              {TIPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </div>
          <div>
            <label>Entidad (EPS/ARL)</label>
            <select value={form.entidad_id} onChange={(e) => setForm({ ...form, entidad_id: Number(e.target.value) })} required>
              <option value="">Seleccione…</option>
              {entidades.map((en) => <option key={en.id} value={en.id}>{en.nombre} ({en.tipo})</option>)}
            </select>
          </div>
          <div>
            <label>Fecha de inicio</label>
            <input type="date" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} required />
          </div>
          <div>
            <label>Número de días</label>
            <input type="number" min="1" value={form.dias} onChange={(e) => setForm({ ...form, dias: e.target.value })} required />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label>Observaciones</label>
            <input value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
          </div>
          <div style={{ marginTop: 12 }}><button type="submit">Informar incapacidad</button></div>
        </form>

        {(rol === 'AUXILIAR' || rol === 'RECEPCIONISTA' || rol === 'ADMIN') && (
          <div className="ia-caja">
            <h4>🤖 IA/OCR · Extraer datos del certificado (CU-06)</h4>
            <textarea rows={3} placeholder="Pegue aquí el texto del certificado recibido por correo…"
              value={textoCert} onChange={(e) => setTextoCert(e.target.value)} />
            <div style={{ marginTop: 8 }}>
              <button type="button" onClick={extraerIA}>{ocr?.cargando ? 'Extrayendo…' : 'Extraer con IA'}</button>
            </div>
            {ocr && !ocr.cargando && (
              <div style={{ marginTop: 8, fontSize: 13 }}>
                Propuesta: <b>{ocr.tipo_novedad}</b> · inicio {ocr.fecha_inicio} · {ocr.dias} día(s) ·
                dx {ocr.diagnostico_cie10} · entidad {ocr.entidad} · confianza <b>{ocr.confianza}</b>
                {ocr.campos_dudosos?.length > 0 && <div style={{ color: '#b7791f' }}>Revisar manualmente: {ocr.campos_dudosos.join(', ')}</div>}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="tarjeta">
        <h3>Mis casos / casos abiertos</h3>
        <table>
          <thead><tr><th>Caso</th><th>Colaborador</th><th>Tipo</th><th>Inicio</th><th>Días</th><th>Entidad</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {casos.map((c) => (
              <tr key={c.id}>
                <td>{c.numero_caso}</td>
                <td>{c.colaborador?.usuario?.nombre}</td>
                <td>{c.tipo.replaceAll('_', ' ')}</td>
                <td>{c.fecha_inicio}</td>
                <td>{c.dias}</td>
                <td>{c.entidad?.nombre}</td>
                <td><span className={`estado ${c.estado}`}>{c.estado.replaceAll('_', ' ')}</span></td>
                <td>
                  {c.estado === 'REPORTADA' && <button onClick={() => remitirDocs(c)}>Remitir docs</button>}
                  {rol === 'LIDER' && <button className="secundario" onClick={() => reemplazo(c)}>Reemplazo</button>}
                  {['DOCUMENTACION_REMITIDA', 'REPORTADA'].includes(c.estado) &&
                    ['RECEPCIONISTA', 'AUXILIAR', 'ADMIN'].includes(rol) &&
                    <button className="secundario" onClick={() => recibir(c)}>Recibir</button>}
                </td>
              </tr>
            ))}
            {!casos.length && <tr><td colSpan={8}>Sin casos registrados.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
