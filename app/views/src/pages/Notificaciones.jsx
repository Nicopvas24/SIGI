// Vista Notificaciones del usuario (avisos de plazos, faltantes, traslados...)
import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import { Aviso, Encabezado, Panel, Vacio, fecha } from '../ui.jsx';

export default function Notificaciones() {
  const ctx = useOutletContext();
  const [lista, setLista] = useState(null);
  const [msj, setMsj] = useState(null);

  const cargar = () => api('/notificaciones').then(setLista).catch((e) => { setLista([]); setMsj({ t: 'error', m: e.message }); });
  useEffect(() => { cargar(); }, []);

  async function leida(n) {
    if (n.leida) return;
    await api(`/notificaciones/${n.id}/leida`, { method: 'POST', body: {} }).catch(() => {});
    setLista((l) => l.map((x) => (x.id === n.id ? { ...x, leida: true } : x)));
  }

  async function todas() {
    try {
      await api('/notificaciones/leidas', { method: 'POST', body: {} });
      setLista((l) => l.map((x) => ({ ...x, leida: true })));
      ctx?.refrescarNotificaciones?.();
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
  }

  const sinLeer = (lista || []).filter((n) => !n.leida).length;

  return (
    <div>
      <Encabezado titulo="Notificaciones" descripcion="Avisos del trámite de sus incapacidades y de las tareas a su cargo." />
      <Aviso msj={msj} onCerrar={() => setMsj(null)} />
      <Panel titulo="Recientes" sub={lista ? `${sinLeer} sin leer` : 'Cargando…'} cuerpo={false}
        extra={sinLeer > 0 && <button className="secundario" onClick={todas}>Marcar todas como leídas</button>}>
        {lista?.length ? (
          <ul className="expedientes">
            {lista.map((n) => (
              <li key={n.id} onClick={() => leida(n)} style={{ cursor: n.leida ? 'default' : 'pointer', background: n.leida ? undefined : 'var(--superficie-hover)' }}>
                <div className="exp-cabeza">
                  <div>
                    <div className="exp-titulo">
                      {!n.leida && <span className="punto-nuevo" aria-label="Sin leer" />}
                      <b>{n.asunto}</b>
                    </div>
                    {n.mensaje && <p style={{ marginTop: 4, color: 'var(--texto-2)' }}>{n.mensaje}</p>}
                  </div>
                  <span className="texto-tenue" style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>{fecha(n.created_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : lista && (
          <Vacio icono={Bell} titulo="Sin notificaciones">Aquí verá los avisos de soportes pendientes, plazos y cambios en sus casos.</Vacio>
        )}
      </Panel>
    </div>
  );
}
