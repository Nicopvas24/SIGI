// Vista Archivo de incapacidades pagadas
import { useEffect, useState } from 'react';
import { Archive, Check, ExternalLink, Upload } from 'lucide-react';
import { api, formulario } from '../api.js';
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

  async function adjuntarLiquidacion(c) {
    const r0 = await dlg.pedir({
      titulo: `${c.tiene_soporte_liquidacion ? 'Reemplazar' : 'Adjuntar'} soporte de liquidación del caso ${c.numero_caso}`,
      descripcion: `Liquidación o comprobante de pago emitido por ${c.entidad?.nombre || 'la entidad'}. Sin este soporte el caso no puede archivarse.`,
      textoAceptar: c.tiene_soporte_liquidacion ? 'Reemplazar' : 'Adjuntar',
      campos: [{ nombre: 'soporte', etiqueta: 'Archivo (PDF, JPG, PNG o WEBP, máximo 10 MB)', tipo: 'file', requerido: true }],
    });
    if (!r0?.soporte) return;
    try {
      const r = await api(`/incapacidades/${c.id}/soporte-liquidacion`, { method: 'POST', formData: formulario({}, { soporte: r0.soporte }) });
      setMsj({ t: 'ok', m: r.mensaje });
      cargar();
    } catch (e) { setMsj({ t: 'error', m: e.message }); }
  }

  async function verLiquidacion(c) {
    const ventana = window.open('', '_blank');
    try {
      const { url } = await api(`/incapacidades/${c.id}/soporte-liquidacion`);
      if (ventana) ventana.location = url; else window.open(url, '_blank');
    } catch (e) { ventana?.close(); setMsj({ t: 'error', m: e.message }); }
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
      setMsj({ t: 'ok', m: r.mensaje });
      setFisicos((s) => { const n = new Set(s); n.delete(c.id); return n; });
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
        descripcion="Para archivar un caso debe tener el soporte de liquidación y el expediente físico marcado como encontrado."
      />
      <Aviso msj={msj} onCerrar={() => setMsj(null)} />

      <Panel
        titulo="Planilla de transferencia"
        sub={casos ? `${casos.length} caso(s) pagado(s), ${fisicos.size} con físico marcado` : 'Cargando…'}
        extra={casos?.length > 0 && <button className="secundario" onClick={verificar}>Cruzar pagadas con físicas</button>}
        cuerpo={false}
        pie={verificacion && (
          <Aviso msj={{
            t: verificacion.alerta ? 'error' : 'ok',
            m: <>Aptas para envío: {verificacion.aptas_para_envio.join(', ') || 'ninguna'}. Pagadas sin físico: {verificacion.pagadas_sin_fisico.join(', ') || 'ninguna'}.
              {verificacion.sin_soporte_liquidacion.length > 0 && <> Sin soporte de liquidación: {verificacion.sin_soporte_liquidacion.join(', ')}.</>}
              {verificacion.alerta && <> {verificacion.alerta}</>}</>,
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
                      ? <div className="acciones" style={{ justifyContent: 'flex-start' }}>
                          <span className="texto-ok"><Check size={14} aria-hidden="true" /> Cargado</span>
                          <button className="fantasma" onClick={() => verLiquidacion(c)}><ExternalLink size={14} aria-hidden="true" />Ver</button>
                          <button className="fantasma" onClick={() => adjuntarLiquidacion(c)}>Reemplazar</button>
                        </div>
                      : <div className="acciones" style={{ justifyContent: 'flex-start' }}>
                          <span className="texto-alerta">Falta</span>
                          <button className="secundario" onClick={() => adjuntarLiquidacion(c)}><Upload size={14} aria-hidden="true" />Adjuntar</button>
                        </div>}</td>
                    <td><div className="acciones">
                      <button disabled={!c.tiene_soporte_liquidacion || !fisicos.has(c.id)} onClick={() => archivar(c)}
                        title={!c.tiene_soporte_liquidacion ? 'Adjunte primero el soporte de liquidación'
                          : !fisicos.has(c.id) ? 'Marque primero el físico como encontrado' : undefined}>Archivar</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : casos && (
          <Vacio icono={Archive} titulo="No hay pagadas pendientes de archivo">
            Aparecen cuando Contabilidad concilia el pago.
          </Vacio>
        )}
      </Panel>
    </div>
  );
}
