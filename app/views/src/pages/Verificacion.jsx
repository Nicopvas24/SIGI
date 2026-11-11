// Vista Verificación documental (CU-07 a CU-10) + preverificación con IA
import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Verificacion() {
  const [casos, setCasos] = useState([]);
  const [msj, setMsj] = useState(null);
  const [ia, setIa] = useState({});

  const cargar = () => api('/verificacion/pendientes').then(setCasos).catch((e) => setMsj({ t: 'error', m: e.message }));
  useEffect(() => { cargar(); }, []);

  async function verificar(caso) {
    try {
      // Marca todos los documentos cargados como conformes y ejecuta CU-07/08/09
      const conformidades = (caso.documentos || []).map((d) => ({ documento_id: d.id, conforme: true }));
      const r = await api(`/incapacidades/${caso.id}/verificar`, {
        method: 'POST', body: { conformidades },
      });
      if (r.faltantes?.length) {
        setMsj({ t: 'info', m: `Documentación incompleta (CU-09). Faltan: ${r.faltantes.join(', ')}. Límite: ${String(r.fecha_limite).slice(0, 10)}` });
      } else {
        setMsj({ t: 'ok', m: `Verificada. Formato de seguimiento v${r.formato_seguimiento.version}: empresa $${r.liquidacion.valorEmpresa} (${r.liquidacion.diasEmpresa} días) · EPS $${r.liquidacion.valorEntidad} (${r.liquidacion.diasEntidad} días). ${r.advertencias?.join(' ') || ''}` });
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
      <h2>Bandeja: pendientes de verificación (CU-07)</h2>
      {msj && <div className={`alerta ${msj.t}`}>{msj.m}</div>}
      {casos.map((c) => (
        <div className="tarjeta" key={c.id}>
          <b>{c.numero_caso}</b> · {c.colaborador?.usuario?.nombre} · {c.tipo.replaceAll('_', ' ')} ·
          {' '}{c.dias} día(s) desde {c.fecha_inicio} · {c.entidad?.nombre} ·{' '}
          <span className={`estado ${c.estado}`}>{c.estado.replaceAll('_', ' ')}</span>
          <div style={{ margin: '8px 0', fontSize: 13 }}>
            Soportes: {(c.documentos || []).map((d) => `${d.tipo_documento} (${d.estado})`).join(' · ') || 'ninguno cargado'}
          </div>
          <button onClick={() => verificar(c)}>Verificar documentación</button>
          <button className="secundario" onClick={() => preverificar(c)}>
            {ia[c.id]?.cargando ? 'IA analizando…' : '🤖 Preverificar con IA'}
          </button>
          {c.estado === 'DOCUMENTACION_INCOMPLETA' && (
            <button className="peligro" onClick={() => segundoLlamado(c)}>Segundo llamado</button>
          )}
          {ia[c.id] && !ia[c.id].cargando && (
            <div className="ia-caja">
              <h4>Preverificación IA {ia[c.id].apto_para_verificar ? '· ✅ apto' : '· ⚠️ con observaciones'}</h4>
              {ia[c.id].faltantes?.length > 0 && <div>Faltantes: {ia[c.id].faltantes.join(', ')}</div>}
              {ia[c.id].inconsistencias?.length > 0 && <ul>{ia[c.id].inconsistencias.map((x, i) => <li key={i}>{x}</li>)}</ul>}
              {ia[c.id].recomendaciones?.length > 0 && <ul>{ia[c.id].recomendaciones.map((x, i) => <li key={i}>💡 {x}</li>)}</ul>}
            </div>
          )}
        </div>
      ))}
      {!casos.length && <div className="tarjeta">No hay casos en estado RECIBIDA.</div>}
    </div>
  );
}
