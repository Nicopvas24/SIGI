// Vista Archivo de incapacidades pagadas (CU-29, CU-30)
import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Archivo() {
  const [casos, setCasos] = useState([]);
  const [fisicos, setFisicos] = useState(new Set());
  const [verificacion, setVerificacion] = useState(null);
  const [msj, setMsj] = useState(null);

  const cargar = () => api('/archivo/pagadas').then(setCasos).catch((e) => setMsj({ t: 'error', m: e.message }));
  useEffect(() => { cargar(); }, []);

  function alternar(id) {
    const s = new Set(fisicos);
    s.has(id) ? s.delete(id) : s.add(id);
    setFisicos(s);
  }

  async function verificar() {
    try {
      setVerificacion(await api('/archivo/verificar-fisicos', { method: 'POST', body: { fisicos_encontrados: [...fisicos] } }));
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
  }

  async function archivar(c) {
    if (!window.confirm(`¿Confirma que retiró y destruyó la historia clínica/epicrisis de ${c.numero_caso}?`)) return;
    const ubicacion = prompt('Ubicación física asignada por Gestión Documental:', `${c.entidad?.nombre}/${c.fecha_inicio.slice(0, 4)}`);
    try {
      const r = await api(`/incapacidades/${c.id}/archivar`, {
        method: 'POST', body: { confirmacion_destruccion_epicrisis: true, ubicacion_fisica: ubicacion },
      });
      setMsj({ t: 'ok', m: `Archivada. Planilla: ${r.planilla_transferencia.documentos_transferidos} transferido(s), ${r.planilla_transferencia.documentos_destruidos} destruido(s).` });
      cargar();
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
  }

  // Planilla ordenada por entidad y fecha de inicio ascendente (5.3)
  const ordenados = [...casos].sort((a, b) =>
    (a.entidad?.nombre || '').localeCompare(b.entidad?.nombre || '') || a.fecha_inicio.localeCompare(b.fecha_inicio));

  return (
    <div>
      <h2>Archivo de incapacidades pagadas (CU-29 / CU-30)</h2>
      {msj && <div className={`alerta ${msj.t}`}>{msj.m}</div>}
      <div className="tarjeta">
        <table>
          <thead><tr><th>Físico</th><th>Caso</th><th>Entidad</th><th>Inicio</th><th>Soporte liquidación</th><th></th></tr></thead>
          <tbody>
            {ordenados.map((c) => (
              <tr key={c.id}>
                <td><input type="checkbox" style={{ width: 'auto' }} checked={fisicos.has(c.id)} onChange={() => alternar(c.id)} /></td>
                <td>{c.numero_caso} · {c.colaborador?.usuario?.nombre}</td>
                <td>{c.entidad?.nombre}</td>
                <td>{c.fecha_inicio}</td>
                <td>{c.tiene_soporte_liquidacion ? '✔' : <span style={{ color: '#c0392b' }}>Falta</span>}</td>
                <td><button disabled={!c.tiene_soporte_liquidacion || !fisicos.has(c.id)} onClick={() => archivar(c)}>Archivar</button></td>
              </tr>
            ))}
            {!casos.length && <tr><td colSpan={6}>No hay incapacidades pagadas pendientes de archivo.</td></tr>}
          </tbody>
        </table>
        <div style={{ marginTop: 10 }}><button className="secundario" onClick={verificar}>Verificar pagadas vs. físicas (CU-30)</button></div>
        {verificacion && (
          <div className={`alerta ${verificacion.alerta ? 'error' : 'ok'}`}>
            Aptas para envío: {verificacion.aptas_para_envio.join(', ') || 'ninguna'}<br />
            Pagadas sin físico: {verificacion.pagadas_sin_fisico.join(', ') || 'ninguna'}
            {verificacion.alerta && <><br />{verificacion.alerta}</>}
          </div>
        )}
      </div>
    </div>
  );
}
