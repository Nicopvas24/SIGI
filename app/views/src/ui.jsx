// Componentes compartidos de la interfaz SIGI
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, Info, Sparkles, X } from 'lucide-react';

// ---------- Formato ----------
const fmtDinero = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export const dinero = (v) => fmtDinero.format(Number(v || 0));

const fmtFecha = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export function fecha(v) {
  if (!v) return '—';
  const d = new Date(String(v).length === 10 ? `${v}T00:00:00Z` : v);
  return Number.isNaN(d.getTime()) ? String(v) : fmtFecha.format(d).replace('.', '');
}

export const ROLES = {
  COLABORADOR: 'Colaborador',
  LIDER: 'Líder de área',
  RECEPCIONISTA: 'Recepción',
  AUXILIAR: 'Auxiliar de personal',
  JURIDICA: 'Área jurídica',
  CONTABILIDAD: 'Contabilidad',
  GESTION_DOCUMENTAL: 'Gestión documental',
  ADMIN: 'Administración',
};

export const TIPOS = {
  ENFERMEDAD_GENERAL: 'Enfermedad general',
  ACCIDENTE_LABORAL: 'Accidente laboral',
  ACCIDENTE_TRANSITO: 'Accidente de tránsito',
  LICENCIA_MATERNIDAD: 'Licencia de maternidad',
  LICENCIA_PATERNIDAD: 'Licencia de paternidad',
};
export const tipo = (t) => TIPOS[t] || String(t || '').replaceAll('_', ' ');

export const iniciales = (nombre = '') =>
  nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

// ---------- Sello de estado (DE-01) ----------
const ESTADOS = {
  REPORTADA: ['Reportada', 'pendiente'],
  DOCUMENTACION_REMITIDA: ['Docs. remitidos', 'pendiente'],
  RECIBIDA: ['Recibida', ''],
  DOCUMENTACION_INCOMPLETA: ['Docs. incompletos', 'alerta'],
  VERIFICADA: ['Verificada', ''],
  TRANSCRITA: ['Transcrita', ''],
  RADICADA: ['Radicada', ''],
  ACEPTADA: ['Aceptada', ''],
  RECHAZADA: ['Rechazada', 'alerta'],
  COBRADA: ['Cobrada', 'cobro'],
  EN_COBRO_PERSUASIVO: ['Cobro persuasivo', 'cobro'],
  EN_COBRO_JURIDICO: ['Cobro jurídico', 'cobro'],
  PAGO_NOTIFICADO: ['Pago notificado', 'cerrado'],
  PAGADA: ['Pagada', 'cerrado'],
  DADA_DE_BAJA: ['Dada de baja', 'alerta'],
  ARCHIVADA: ['Archivada', 'cerrado'],
};
export function Estado({ valor }) {
  const [texto, tono] = ESTADOS[valor] || [String(valor || '').replaceAll('_', ' '), 'neutro'];
  return <span className={`sello ${tono}`}>{texto}</span>;
}

// ---------- Estructura ----------
export function Encabezado({ titulo, descripcion, refs = [], children }) {
  return (
    <header className="encabezado">
      <div>
        <h1>{titulo}</h1>
        {descripcion && <p>{descripcion}</p>}
      </div>
      {(refs.length > 0 || children) && (
        <div className="encabezado-extra">
          {refs.map((r) => <span key={r} className="ref" title="Caso de uso de la documentación">{r}</span>)}
          {children}
        </div>
      )}
    </header>
  );
}

export function Panel({ titulo, sub, extra, children, pie, cuerpo = true }) {
  return (
    <section className="panel">
      {(titulo || extra) && (
        <div className="panel-cabeza">
          <div>
            {titulo && <h2>{titulo}</h2>}
            {sub && <div className="sub">{sub}</div>}
          </div>
          {extra}
        </div>
      )}
      {cuerpo ? <div className="panel-cuerpo">{children}</div> : children}
      {pie && <div className="panel-pie">{pie}</div>}
    </section>
  );
}

const ICONO_AVISO = { ok: CircleCheck, error: CircleAlert, info: Info };
export function Aviso({ msj, onCerrar }) {
  if (!msj) return null;
  const Icono = ICONO_AVISO[msj.t] || Info;
  return (
    <div className={`aviso ${msj.t}`} role={msj.t === 'error' ? 'alert' : 'status'}>
      <Icono size={18} aria-hidden="true" />
      <div className="aviso-texto">{msj.m}</div>
      {onCerrar && (
        <button type="button" className="cerrar" onClick={onCerrar} aria-label="Cerrar aviso"><X size={16} /></button>
      )}
    </div>
  );
}

export function Vacio({ icono: Icono, titulo, children }) {
  return (
    <div className="vacio">
      {Icono && <Icono size={30} strokeWidth={1.5} aria-hidden="true" />}
      <b>{titulo}</b>
      {children && <p>{children}</p>}
    </div>
  );
}

// ---------- Regla de 180 días ----------
// Escala 0–200 días: los hitos legales caen en 45 %, 60 %, 75 % y 90 %.
const ESCALA = 200;
export const HITOS = [
  { dia: 90, que: 'Reporte de casos prolongados' },
  { dia: 120, que: 'Concepto de rehabilitación' },
  { dia: 150, que: 'Envío del concepto al AFP' },
  { dia: 180, que: 'Suspensión de pago por nómina', critico: true },
];
const pct = (d) => `${Math.min(d, ESCALA) / ESCALA * 100}%`;

export function ReglaDias({ casos = [] }) {
  const zonas = [[0, 90], [90, 120], [120, 150], [150, 180], [180, ESCALA]];
  const cuenta = (desde, hasta = Infinity) => casos.filter((c) => c.dias >= desde && c.dias < hasta).length;
  const tramos = [
    { dia: 'Antes del día 90', n: null, que: 'Seguimiento ordinario; no entra en este reporte' },
    ...HITOS.map((h, i) => ({ dia: `Día ${h.dia}`, n: cuenta(h.dia, HITOS[i + 1]?.dia), que: h.que })),
  ];
  return (
    <div className="regla">
      <div className="regla-pista" role="img"
        aria-label={`Distribución de ${casos.length} casos según días acumulados de incapacidad`}>
        {zonas.map(([a, b], i) => (
          <div key={a} className={`regla-zona z${i}`} style={{ left: pct(a), width: `calc(${pct(b)} - ${pct(a)})` }} />
        ))}
        {HITOS.map((h) => <div key={h.dia} className={`regla-hito ${h.critico ? 'critico' : ''}`} style={{ left: pct(h.dia) }} />)}
        <div className="regla-ticks" />
        {casos.map((c) => (
          <span key={c.id} className={`regla-marca ${c.dias >= 180 ? 'critico' : ''}`} style={{ left: pct(c.dias) }}
            title={`${c.etiqueta} · ${c.dias} días`} />
        ))}
      </div>
      <div className="regla-hitos">
        {tramos.map((t) => (
          <div key={t.dia}>
            <div className="dia">{t.dia}</div>
            {t.n !== null && <div className={`n ${t.n ? '' : 'cero'}`}>{t.n}</div>}
            <div className="que">{t.que}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MiniRegla({ dias }) {
  const tono = dias >= 180 ? 'critico' : dias >= 150 ? 'alto' : '';
  return (
    <div className="mini-regla" title={`${dias} días acumulados`}>
      <b>{dias}</b>
      <div className="mini-pista" aria-hidden="true">
        <div className={`mini-relleno ${tono}`} style={{ width: pct(dias) }} />
        {HITOS.map((h) => <div key={h.dia} className="mini-hito" style={{ left: pct(h.dia) }} />)}
      </div>
    </div>
  );
}

// ---------- Asistente IA (pendiente hasta configurar la clave) ----------
let saludCache = null;
export function useIA() {
  const [activa, setActiva] = useState(saludCache);
  useEffect(() => {
    if (saludCache !== null) return;
    fetch('/api/salud').then((r) => r.json())
      .then((s) => { saludCache = s.ia === 'activa'; setActiva(saludCache); })
      .catch(() => setActiva(false));
  }, []);
  return activa;
}

export function PanelIA({ titulo, descripcion, accion, cargando, onEjecutar, children }) {
  const activa = useIA();
  const pendiente = activa === false;
  return (
    <div className={`ia ${pendiente ? 'pendiente' : ''}`}>
      <div className="ia-cabeza">
        <div className="ia-titulo"><Sparkles size={17} aria-hidden="true" />{titulo}</div>
        {pendiente
          ? <span className="sello neutro">Pendiente de configurar</span>
          : <button type="button" className="secundario" onClick={onEjecutar} disabled={cargando || activa === null}>
              <Sparkles size={15} aria-hidden="true" />{cargando ? 'Analizando…' : accion}
            </button>}
      </div>
      <p className="ia-nota">
        {pendiente ? 'Esta función se activará cuando se configure el servicio de inteligencia artificial.' : descripcion}
      </p>
      {children && !pendiente && <div className="ia-cuerpo">{children}</div>}
    </div>
  );
}

// ---------- Diálogos (reemplazan prompt/confirm del navegador) ----------
const DialogoCtx = createContext(null);
export const useDialogo = () => useContext(DialogoCtx);

export function DialogoProvider({ children }) {
  const ref = useRef(null);
  const [cfg, setCfg] = useState(null);
  const resolver = useRef(null);

  const abrir = useCallback((c) => new Promise((res) => {
    resolver.current = res;
    setCfg(c);
  }), []);

  useEffect(() => { if (cfg && ref.current && !ref.current.open) ref.current.showModal(); }, [cfg]);

  function cerrar(valor) {
    ref.current?.close();
    resolver.current?.(valor);
    resolver.current = null;
    setCfg(null);
  }

  function enviar(e) {
    e.preventDefault();
    if (!cfg.campos?.length) return cerrar(true);
    const fd = new FormData(e.currentTarget);
    const valores = {};
    for (const c of cfg.campos) valores[c.nombre] = c.tipo === 'multi' ? fd.getAll(c.nombre) : String(fd.get(c.nombre) ?? '').trim();
    cerrar(valores);
  }

  const api = {
    /** Formulario corto. Devuelve {campo: valor} o null si se cancela. */
    pedir: (c) => abrir(c),
    /** Un solo texto. Devuelve string o null. */
    pedirTexto: async (titulo, etiqueta, valor = '', extra = {}) => {
      const r = await abrir({ titulo, ...extra, campos: [{ nombre: 'v', etiqueta, valor, requerido: true, ...extra.campo }] });
      return r ? r.v : null;
    },
    /** Confirmación. Devuelve true/false. */
    confirmar: async (titulo, descripcion, { textoAceptar = 'Confirmar', peligro = false } = {}) =>
      Boolean(await abrir({ titulo, descripcion, textoAceptar, peligro })),
  };

  return (
    <DialogoCtx.Provider value={api}>
      {children}
      <dialog ref={ref} className="dialogo" onCancel={(e) => { e.preventDefault(); cerrar(null); }}
        aria-labelledby="dialogo-titulo">
        {cfg && (
          <form onSubmit={enviar}>
            <div className="dialogo-cabeza">
              <h2 id="dialogo-titulo">{cfg.titulo}</h2>
              {cfg.descripcion && <p>{cfg.descripcion}</p>}
            </div>
            {cfg.campos?.length > 0 && (
              <div className="dialogo-cuerpo">
                {cfg.campos.map((c, i) => <CampoDialogo key={c.nombre} c={c} autoFocus={i === 0} />)}
              </div>
            )}
            <div className="dialogo-pie">
              <button type="button" className="secundario" onClick={() => cerrar(null)}>Cancelar</button>
              <button type="submit" className={cfg.peligro ? 'peligro-solido' : ''} autoFocus={!cfg.campos?.length}>
                {cfg.textoAceptar || 'Guardar'}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </DialogoCtx.Provider>
  );
}

function CampoDialogo({ c, autoFocus }) {
  const id = `dlg-${c.nombre}`;
  if (c.tipo === 'multi') {
    return (
      <fieldset className="campo" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="etiqueta" style={{ marginBottom: 6 }}>{c.etiqueta}</legend>
        <div className="opciones-check">
          {c.opciones.map(([v, t]) => (
            <label key={v} className="opcion-check">
              <input type="checkbox" name={c.nombre} value={v} defaultChecked={c.valor?.includes(v)} />{t}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <div className="campo">
      <label htmlFor={id}>{c.etiqueta}</label>
      {c.tipo === 'textarea'
        ? <textarea id={id} name={c.nombre} rows={3} defaultValue={c.valor} required={c.requerido} autoFocus={autoFocus} />
        : <input id={id} name={c.nombre} type={c.tipo || 'text'} defaultValue={c.valor} required={c.requerido}
            autoFocus={autoFocus} min={c.min} step={c.step} />}
      {c.ayuda && <span className="ayuda">{c.ayuda}</span>}
    </div>
  );
}
