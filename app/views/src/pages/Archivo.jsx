// Vista Archivo de incapacidades pagadas (CU-29, CU-30)
import { useEffect, useState } from 'react';
import { Archive, Check } from 'lucide-react';
import { api } from '../api.js';
import { Aviso, Encabezado, Panel, Vacio, fecha, useDialogo } from '../ui.jsx';

export default function Archivo() {
  const dlg = useDialogo();
  const [casos, setCasos] = useState(null);
  const [fisicos, setFisicos] = useState(new Set());
  const [verificacion, setVerificacion] = useState(null);
  const [msj, setMsj] = useState(null);

  const cargar = () => api('/archivo/pagadas').then(setCasos).catch((e) => { setCasos([]); setMsj({ t: 'error', m: e.message }); });
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
    const r0 = await dlg.pedir({
      titulo: `Archivar ${c.numero_caso}`,
      descripcion: 'Antes de archivar, retire y destruya la historia clínica o epicrisis (información reservada).',
      textoAceptar: 'Confirmar y archivar',
      campos: [{ nombre: 'ubicacion', etiqueta: 'Ubicación física asignada por Gestión Documental', valor: `${c.entidad?.nombre}/${c.fecha_inicio.slice(0, 4)}`, requerido: true }],
    });
    if (!r0) return;
    try {
      const r = await api(`/incapacidades/${c.id}/archivar`, {
        method: 'POST', body: { confirmacion_destruccion_epicrisis: true, ubicacion_fisica: r0.ubicacion },
      });
      setMsj({ t: 'ok', m: `Archivada. Planilla: ${r.planilla_transferencia.documentos_transferidos} transferido(s), ${r.planilla_transferencia.documentos_destruidos} destruido(s).` });
      cargar();
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
  }

  // Planilla ordenada por entidad y fecha de inicio ascendente (5.3)
  const ordenados = [...(casos || [])].sort((a, b) =>
    (a.entidad?.nombre || '').localeCompare(b.entidad?.nombre || '') || a.fecha_inicio.localeCompare(b.fecha_inicio));

  return (
    <div>
      <Encabezado
        titulo="Archivo de pagadas"
        descripcion="Marque los expedientes físicos encontrados y archive los que tienen soporte de liquidación."
        refs={['CU-29', 'CU-30']}
      />
      <Aviso msj={msj} onCerrar={() => setMsj(null)} />

      <Panel
        titulo="Planilla de transferencia"
        sub={casos ? `${casos.length} caso(s) pagado(s) · ${fisicos.size} físico(s) marcados` : 'Cargando…'}
        extra={casos?.length > 0 && <button className="secundario" onClick={verificar}>Cruzar pagadas con físicas</button>}
        cuerpo={false}
        pie={verificacion && (
          <Aviso msj={{
            t: verificacion.alerta ? 'error' : 'ok',
            m: <>Aptas para envío: {verificacion.aptas_para_envio.join(', ') || 'ninguna'}. Pagadas sin físico: {verificacion.pagadas_sin_fisico.join(', ') || 'ninguna'}.{verificacion.alerta && <> {verificacion.alerta}</>}</>,
          }} onCerrar={() => setVerificacion(null)} />
        )}
      >
        {casos?.length ? (
          <div className="tabla-wrap">
            <table>
              <thead><tr><th style={{ width: 70 }}>Físico</th><th>Caso</th><th>Entidad</th><th>Inicio</th><th>Soporte de liquidación</th><th className="th-acciones"></th></tr></thead>
              <tbody>
                {ordenados.map((c) => (
                  <tr key={c.id}>
                    <td><input type="checkbox" aria-label={`Físico encontrado: ${c.numero_caso}`} checked={fisicos.has(c.id)} onChange={() => alternar(c.id)} /></td>
                    <td><span className="caso">{c.numero_caso}</span><span className="secundario-texto">{c.colaborador?.usuario?.nombre}</span></td>
                    <td>{c.entidad?.nombre}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fecha(c.fecha_inicio)}</td>
                    <td>{c.tiene_soporte_liquidacion
                      ? <span className="texto-ok"><Check size={14} aria-hidden="true" /> Cargado</span>
                      : <span className="texto-alerta">Falta</span>}</td>
                    <td><div className="acciones">
                      <button disabled={!c.tiene_soporte_liquidacion || !fisicos.has(c.id)} onClick={() => archivar(c)}
                        title={!fisicos.has(c.id) ? 'Marque primero el físico como encontrado' : undefined}>Archivar</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : casos && (
          <Vacio icono={Archive} titulo="No hay pagadas pendientes de archivo">
            Los casos llegan aquí cuando su pago queda conciliado.
          </Vacio>
        )}
      </Panel>
    </div>
  );
}
