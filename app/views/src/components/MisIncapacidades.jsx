// Estado de las incapacidades del colaborador, en lenguaje claro y en la parte superior de su inicio.
// Muestra primero lo que requiere una acción suya, luego lo que está en trámite y al final lo pagado.
import { BadgeCheck, Building2, CalendarDays, CircleAlert, CircleSlash, Hourglass, Upload } from 'lucide-react';
import { dinero, documento, documentosRequeridos, fecha, tipo } from '../ui.jsx';

const PASOS = ['Reportada', 'Soportes recibidos', 'Aprobada por Gestión Humana', 'Trámite con la entidad', 'Pagada'];
const DIAS_VISIBLE_PAGADA = 60; // las pagadas se muestran arriba durante 60 días; después quedan en la tabla

/** Traduce el estado interno a lo que el colaborador necesita saber. */
function situacion(c) {
  const entidad = c.entidad?.nombre || 'la entidad';
  const faltantes = () => {
    const entregados = new Set((c.documentos || []).filter((d) => d.estado !== 'NO_CONFORME').map((d) => d.tipo_documento));
    return documentosRequeridos(c.tipo, c.dias).filter((t) => !entregados.has(t)).map(documento);
  };
  switch (c.estado) {
    case 'REPORTADA':
      return { paso: 0, tono: 'accion', icono: Upload, titulo: 'Entregue sus soportes', accion: true,
        texto: 'Adjunte el certificado y los demás documentos dentro de los 2 días siguientes al inicio de la incapacidad.' };
    case 'DOCUMENTACION_INCOMPLETA': {
      const f = faltantes();
      return { paso: 1, tono: 'accion', icono: CircleAlert, titulo: 'Faltan soportes', accion: true,
        texto: f.length ? `Gestión Humana necesita: ${f.join(', ')}. Entréguelos lo antes posible.` : 'Gestión Humana le pidió corregir algunos documentos. Revise sus notificaciones.' };
    }
    case 'DOCUMENTACION_REMITIDA':
      return { paso: 1, tono: 'proceso', icono: Hourglass, titulo: 'Soportes enviados',
        texto: 'Recuerde entregar los originales en físico a Gestión Humana.' };
    case 'RECIBIDA':
      return { paso: 1, tono: 'proceso', icono: Hourglass, titulo: 'En revisión',
        texto: 'Gestión Humana recibió sus soportes y los está revisando.' };
    case 'VERIFICADA':
    case 'TRANSCRITA':
      return { paso: 3, tono: 'proceso', icono: Hourglass, titulo: `En trámite con ${entidad}`,
        texto: `Sus soportes fueron aprobados. Gestión Humana está tramitando la incapacidad ante ${entidad}.` };
    case 'RADICADA':
      return { paso: 3, tono: 'proceso', icono: Hourglass, titulo: `Radicada ante ${entidad}`,
        texto: `Estamos esperando la respuesta de ${entidad}. No tiene que hacer nada.` };
    case 'RECHAZADA':
      return { paso: 3, tono: 'proceso', icono: Hourglass, titulo: 'En corrección',
        texto: `${entidad} devolvió el trámite y Gestión Humana lo está corrigiendo. Si necesitan algo de usted, le avisarán.` };
    case 'ACEPTADA':
    case 'COBRADA':
    case 'EN_COBRO_PERSUASIVO':
    case 'EN_COBRO_JURIDICO':
      return { paso: 3, tono: 'proceso', icono: Hourglass, titulo: 'Aprobada, pago en proceso',
        texto: `${entidad} aprobó la incapacidad. El pago está en proceso.` };
    case 'PAGO_NOTIFICADO':
      return { paso: 3, tono: 'proceso', icono: Hourglass, titulo: 'Pago en confirmación',
        texto: `${entidad} informó el pago y Contabilidad lo está confirmando.` };
    case 'PAGADA':
    case 'ARCHIVADA': {
      const pago = [...(c.pagos || [])].sort((a, b) => String(b.fecha_pago).localeCompare(String(a.fecha_pago)))[0];
      return { paso: 4, tono: 'pagada', icono: BadgeCheck, titulo: 'Pagada',
        texto: `${entidad} pagó esta incapacidad${pago ? ` el ${fecha(pago.fecha_pago)}` : ''}.`,
        valor: Number(c.valor_pagado) > 0 ? c.valor_pagado : null };
    }
    case 'DADA_DE_BAJA':
      return { paso: -1, tono: 'cerrada', icono: CircleSlash, titulo: 'Trámite cerrado',
        texto: 'El trámite con la entidad se cerró. Si tiene dudas, comuníquese con Gestión Humana.' };
    default:
      return { paso: 0, tono: 'proceso', icono: Hourglass, titulo: 'En trámite', texto: '' };
  }
}

const ORDEN = { accion: 0, proceso: 1, pagada: 2, cerrada: 3 };
const reciente = (c) => (Date.now() - new Date(c.updated_at || c.created_at).getTime()) / 86400000 <= DIAS_VISIBLE_PAGADA;

export default function MisIncapacidades({ casos, onAdjuntar }) {
  if (!casos) return null;
  const visibles = casos
    .map((c) => ({ c, s: situacion(c) }))
    .filter(({ c, s }) => !['pagada', 'cerrada'].includes(s.tono) || reciente(c))
    .sort((a, b) => ORDEN[a.s.tono] - ORDEN[b.s.tono] || String(b.c.fecha_inicio).localeCompare(String(a.c.fecha_inicio)));

  const cuenta = (tono) => visibles.filter((x) => x.s.tono === tono).length;
  const resumen = [
    [cuenta('accion'), 'requiere su acción', 'requieren su acción', 'accion'],
    [cuenta('proceso'), 'en trámite', 'en trámite', 'proceso'],
    [cuenta('pagada'), 'pagada', 'pagadas', 'pagada'],
  ].filter(([n]) => n > 0);

  return (
    <section className="mis-casos" aria-labelledby="mis-casos-titulo">
      <div className="mis-casos-cabeza">
        <h2 id="mis-casos-titulo">Mis incapacidades</h2>
        {resumen.length > 0 && (
          <div className="mis-casos-resumen">
            {resumen.map(([n, uno, varios, tono]) => <span key={tono} className={`resumen-pastilla ${tono}`}><b>{n}</b> {n === 1 ? uno : varios}</span>)}
          </div>
        )}
      </div>

      {visibles.length ? (
        <ul className="mis-casos-lista">
          {visibles.map(({ c, s }) => {
            const Icono = s.icono;
            return (
              <li key={c.id} className={`mi-caso ${s.tono}`}>
                <div className="mi-caso-estado">
                  <span className="mi-caso-icono" aria-hidden="true"><Icono size={26} strokeWidth={2} /></span>
                  <div className="mi-caso-texto">
                    <p className="mi-caso-titulo">{s.titulo}</p>
                    <p className="mi-caso-mensaje">{s.texto}</p>
                  </div>
                  {s.valor && (
                    <div className="mi-caso-valor"><span>Valor reconocido</span><b>{dinero(s.valor)}</b></div>
                  )}
                  {s.accion && onAdjuntar && (
                    <button className="mi-caso-boton" onClick={() => onAdjuntar(c)}><Upload size={16} aria-hidden="true" />Adjuntar soportes</button>
                  )}
                </div>
                <div className="mi-caso-datos">
                  <span className="caso">{c.numero_caso}</span>
                  <span>{tipo(c.tipo)}{c.prorroga_de ? ' (prórroga)' : ''}</span>
                  <span><CalendarDays size={14} aria-hidden="true" />{fecha(c.fecha_inicio)} al {fecha(c.fecha_fin)} · {c.dias} día(s)</span>
                  <span><Building2 size={14} aria-hidden="true" />{c.entidad?.nombre}</span>
                </div>
                {s.paso >= 0 && (
                  <ol className="mi-caso-pasos" aria-label={`Avance: paso ${s.paso + 1} de ${PASOS.length}, ${PASOS[s.paso]}`}>
                    {PASOS.map((p, i) => (
                      <li key={p} className={i < s.paso ? 'hecho' : i === s.paso ? 'actual' : ''} aria-current={i === s.paso ? 'step' : undefined}>
                        <span className="punto" aria-hidden="true" /><span className="nombre">{p}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mis-casos-vacio">No tiene incapacidades en trámite. Si está incapacitado, infórmelo con el formulario de abajo.</p>
      )}
    </section>
  );
}
