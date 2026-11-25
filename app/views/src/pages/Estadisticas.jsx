// Vista Estadísticas - todas las cifras del sistema en un solo módulo.
// Usa las mismas piezas que el resto de SIGI: paneles, tarjetas con tono como las de
// "Mis incapacidades", pastillas de resumen y sellos de estado.
import { useEffect, useState } from 'react';
import {
  Activity, Archive, ArrowRight, Building2, CalendarDays, ChartColumn, CircleCheck, CircleX, FileDown, FileSignature, FileText,
  Flag, Gavel, Inbox, Mail, OctagonAlert, Scale, Send, Stamp, Stethoscope, Timer, Wallet,
} from 'lucide-react';
import { api, descargar } from '../api.js';
import { Aviso, Encabezado, Estado, HITOS, Panel, ROLES, Vacio, dinero, tipo } from '../ui.jsx';

const fmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const n = (v) => fmt.format(Number(v || 0));
const plural = (v, uno, varios) => `${n(v)} ${Number(v) === 1 ? uno : varios}`;
const pct = (parte, total) => (total ? `${fmt.format(Math.round((parte / total) * 1000) / 10)} %` : '0 %');

const CANALES = {
  PRESENCIAL: 'Presencial', CORREO_ELECTRONICO: 'Correo electrónico', OFICINA_PRINCIPAL: 'Oficina principal',
  LIDER_COMERCIAL: 'Líder comercial', GESTION_HUMANA: 'Gestión humana',
};

export default function Estadisticas() {
  const [anio, setAnio] = useState('');
  const [datos, setDatos] = useState(null);
  const [msj, setMsj] = useState(null);
  const [medida, setMedida] = useState('casos'); // gráfica mensual: casos o días
  const [generando, setGenerando] = useState(false);

  async function descargarPdf() {
    setGenerando(true);
    try {
      const archivo = await descargar(`/informes/estadisticas${anio ? `?anio=${anio}` : ''}`, 'sigi-estadisticas.pdf');
      setMsj({ t: 'ok', m: `Se descargó ${archivo}.` });
    } catch (e) {
      setMsj({ t: 'error', m: e.message });
    } finally {
      setGenerando(false);
    }
  }

  useEffect(() => {
    setDatos(null);
    api(`/estadisticas${anio ? `?anio=${anio}` : ''}`).then(setDatos).catch((e) => setMsj({ t: 'error', m: e.message }));
  }, [anio]);

  const g = datos?.generales;
  const periodo = anio ? `en ${anio}` : 'en todo el histórico';
  const tiempoPago = datos?.cobro.dias_promedio_pago;

  return (
    <div className="estadisticas">
      <Encabezado titulo="Estadísticas" descripcion="Cifras de incapacidades, cobro y pagos. Los casos se cuentan por su fecha de inicio.">
        <label className="sr-only" htmlFor="est-anio">Año</label>
        <select id="est-anio" value={anio} onChange={(e) => setAnio(e.target.value)} style={{ width: 170 }}>
          <option value="">Todos los años</option>
          {(datos?.anios || (anio ? [anio] : [])).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button type="button" className="secundario" onClick={descargarPdf} disabled={!datos || generando}>
          <FileDown size={16} aria-hidden="true" />{generando ? 'Generando…' : 'Descargar PDF'}
        </button>
      </Encabezado>
      <Aviso msj={msj} onCerrar={() => setMsj(null)} />

      {!datos ? <Panel><p className="texto-tenue">{msj ? 'No se pudieron cargar las estadísticas.' : 'Cargando…'}</p></Panel> : !g.incapacidades && !anio ? (
        <Panel><Vacio icono={ChartColumn} titulo="Todavía no hay incapacidades registradas">Las cifras aparecen cuando se reporte el primer caso.</Vacio></Panel>
      ) : <>
        {/* 1. Resumen: tarjetas con el estilo de "Mis incapacidades" */}
        <section className="est-resumen" aria-labelledby="est-resumen-titulo">
          <div className="mis-casos-cabeza">
            <h2 id="est-resumen-titulo">Resumen <span className="est-resumen-periodo">· {anio || 'todo el histórico'}</span></h2>
            <div className="mis-casos-resumen">
              <Pastilla v={g.colaboradores_con_incapacidad} uno="colaborador" varios="colaboradores" resto={`con incapacidad (${n(g.porcentaje_colaboradores)} % de ${n(g.colaboradores)})`} />
              <Pastilla v={g.prorrogas} uno="prórroga" varios="prórrogas" />
              <Pastilla v={g.extemporaneas} uno="reporte extemporáneo" varios="reportes extemporáneos" tono={g.extemporaneas ? 'accion' : ''} />
            </div>
          </div>
          <div className="tarjetas-datos">
            <TarjetaDato icono={FileText} etiqueta="Incapacidades" valor={n(g.incapacidades)}
              nota={`En ${plural(g.colaboradores_con_incapacidad, 'colaborador', 'colaboradores')}`}>
              <Dividida partes={[
                { nombre: plural(g.abiertas, 'abierta', 'abiertas'), valor: g.abiertas, clase: 'abiertas' },
                { nombre: plural(g.cerradas, 'cerrada', 'cerradas'), valor: g.cerradas, clase: 'cerradas' },
              ]} />
            </TarjetaDato>
            <TarjetaDato icono={CalendarDays} etiqueta="Días de ausencia" valor={n(g.dias_totales)}
              nota={`${n(g.promedio_dias)} días en promedio por caso`}>
              <p className="tarjeta-dato-linea"><Activity size={14} aria-hidden="true" /><b>{n(g.incapacitados_hoy)}</b> {Number(g.incapacitados_hoy) === 1 ? 'persona incapacitada' : 'personas incapacitadas'} hoy</p>
            </TarjetaDato>
            <TarjetaDato tono="neutra" icono={Wallet} etiqueta="Valor solicitado" valor={dinero(datos.dinero.solicitado)} nota="A las EPS y ARL">
              <p className="tarjeta-dato-linea"><Building2 size={14} aria-hidden="true" />La empresa asume <b>{dinero(datos.dinero.a_cargo_empresa)}</b></p>
            </TarjetaDato>
            <TarjetaDato tono="pagada" icono={CircleCheck} etiqueta="Valor recuperado" valor={dinero(datos.dinero.pagado)}
              nota={`${n(datos.dinero.porcentaje_recuperado)} % de lo solicitado`}>
              <div className="tarjeta-progreso" role="img" aria-label={`${n(datos.dinero.porcentaje_recuperado)} % recuperado`}>
                <span style={{ width: `${Math.min(Number(datos.dinero.porcentaje_recuperado) || 0, 100)}%` }} />
              </div>
            </TarjetaDato>
          </div>
        </section>

        {/* 2. Proceso: dónde están los casos y cómo han llegado */}
        <section className="est-bloque" aria-labelledby="est-etapas-titulo">
          <div className="mis-casos-cabeza">
            <h2 id="est-etapas-titulo">Dónde están los casos <span className="est-resumen-periodo">· {plural(g.incapacidades, 'incapacidad', 'incapacidades')} por etapa</span></h2>
          </div>
          <TarjetasEtapas etapas={datos.por_etapa} total={g.incapacidades} />
        </section>

        <Panel
          titulo={medida === 'casos' ? 'Incapacidades por mes' : 'Días de ausencia por mes'}
          sub={anio ? `Según el mes de inicio, ${anio}` : 'Según el mes de inicio, últimos 12 meses'}
          extra={
            <div className="selector" role="group" aria-label="Medida">
              {[['casos', 'Casos'], ['dias', 'Días']].map(([v, t]) => (
                <button key={v} type="button" className={medida === v ? 'activo' : ''} aria-pressed={medida === v} onClick={() => setMedida(v)}>{t}</button>
              ))}
            </div>
          }
        >
          <Columnas filas={datos.por_mes} medida={medida} unidad={medida === 'casos' ? 'casos' : 'días'} />
        </Panel>

        {/* 3. Ausentismo */}
        <div className="rejilla-2">
          <Panel titulo="Por tipo de novedad" sub="Días de ausencia">
            <Barras filas={datos.por_tipo.map((f) => ({ ...f, valor: f.dias }))} etiqueta={(f) => tipo(f.clave)}
              detalle={(f) => plural(f.casos, 'caso', 'casos')} unidad="días" />
          </Panel>
          <Panel titulo="Por área" sub="Días de ausencia">
            <Barras filas={datos.por_area.map((f) => ({ ...f, valor: f.dias }))}
              detalle={(f) => plural(f.colaboradores, 'persona', 'personas')} unidad="días" />
          </Panel>
          <Panel titulo="Diagnósticos más frecuentes" sub="Días de ausencia por grupo CIE-10 (los 8 primeros)">
            <Barras filas={datos.por_diagnostico.map((f) => ({ ...f, valor: f.dias }))} detalle={(f) => plural(f.casos, 'caso', 'casos')} unidad="días" />
          </Panel>
          <Panel titulo="Duración de las incapacidades" sub="Número de casos según los días otorgados">
            <Barras filas={datos.duracion.map((f) => ({ ...f, valor: f.casos }))} unidad="casos" ordenFijo />
          </Panel>
        </div>

        {/* 4. Dinero */}
        <Panel titulo="Cartera con EPS y ARL" sub={`De ${dinero(datos.dinero.solicitado)} solicitados, cuánto se ha pagado y cuánto falta`}>
          <Cartera d={datos.dinero} />
          <div className="tarjetas-mini est-separado">
            <MiniDato icono={Building2} etiqueta="A cargo de la empresa" valor={dinero(datos.dinero.a_cargo_empresa)} nota="Días que paga el empleador" />
            <MiniDato icono={Timer} etiqueta="Tiempo de pago" valor={tiempoPago === null ? '—' : tiempoPago === 0 ? 'Mismo día' : plural(tiempoPago, 'día', 'días')} nota="Desde la radicación hasta el pago" />
            <MiniDato icono={CircleX} etiqueta="Rechazos vigentes" valor={n(datos.cobro.rechazos)} nota="Casos negados por la entidad" tono={datos.cobro.rechazos > 0 ? 'critico' : ''} />
            <MiniDato icono={Mail} etiqueta="Requerimientos" valor={n(datos.cobro.requerimientos)} nota="Cartas de cobro persuasivo" />
          </div>
        </Panel>

        <Panel titulo="Por entidad" sub="Casos, días y dinero por EPS y ARL" cuerpo={false}>
          {datos.por_entidad.length ? (
            <div className="tabla-wrap">
              <table>
                <thead><tr>
                  <th>Entidad</th><th className="num">Casos</th><th className="num">Días</th>
                  <th className="num">Solicitado</th><th className="num">Pagado</th><th className="est-col-avance">Recuperado</th>
                </tr></thead>
                <tbody>
                  {datos.por_entidad.map((e) => {
                    const p = e.solicitado ? (e.pagado / e.solicitado) * 100 : null;
                    return (
                      <tr key={e.clave}>
                        <td><b>{e.clave}</b><span className="secundario-texto">{e.tipo}</span></td>
                        <td className="num">{n(e.casos)}</td>
                        <td className="num">{n(e.dias)}</td>
                        <td className="num">{dinero(e.solicitado)}</td>
                        <td className="num">{dinero(e.pagado)}</td>
                        <td className="est-col-avance">
                          {p === null ? <span className="texto-tenue">—</span> : (
                            <div className="mini-regla">
                              <b>{pct(e.pagado, e.solicitado)}</b>
                              <div className="mini-pista" aria-hidden="true">
                                <div className={`mini-relleno ${p >= 100 ? 'completo' : ''}`} style={{ width: `${Math.min(p, 100)}%` }} />
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <div className="panel-cuerpo"><p className="texto-tenue">Sin casos {periodo}.</p></div>}
        </Panel>

        {/* 5. Control: plazos de ley, cobro jurídico y plataforma */}
        <section className="est-bloque" aria-labelledby="est-hitos-titulo">
          <div className="mis-casos-cabeza">
            <h2 id="est-hitos-titulo">Días acumulados <span className="est-resumen-periodo">· {plural(datos.monitoreo.casos_vigentes, 'caso vigente', 'casos vigentes')} hoy, sumando prórrogas</span></h2>
            <span className="resumen-pastilla">No depende del año elegido</span>
          </div>
          <div className="tarjetas-datos">
            {[
              [Flag, `Desde el día ${HITOS[0].dia}`, datos.monitoreo.desde_90, HITOS[0].que, ''],
              [Stethoscope, `Desde el día ${HITOS[1].dia}`, datos.monitoreo.desde_120, HITOS[1].que, ''],
              [Send, `Desde el día ${HITOS[2].dia}`, datos.monitoreo.desde_150, HITOS[2].que, 'accion'],
              [OctagonAlert, `Más de ${HITOS[3].dia} días`, datos.monitoreo.mas_de_180, HITOS[3].que, 'critico'],
            ].map(([Icono, etiqueta, v, que, tono]) => (
              <TarjetaDato key={etiqueta} icono={Icono} etiqueta={etiqueta} valor={n(v)} nota={plural(v, 'caso', 'casos')} tono={`${tono} ${v ? '' : 'en-cero'}`}>
                <p className="tarjeta-dato-linea"><ArrowRight size={14} aria-hidden="true" />{que}</p>
              </TarjetaDato>
            ))}
          </div>
        </section>

        <div className="rejilla-2 arriba">
          <Panel titulo="Cobro y jurídica" sub={`Gestiones de los casos con fecha de inicio ${periodo}`}>
            <Lista filas={[
              ['Transcripciones', datos.cobro.transcripciones, null, false, Stamp],
              ['Radicaciones', datos.cobro.radicaciones, null, false, Send],
              ['En cobro persuasivo', datos.cobro.en_cobro_persuasivo, null, false, Mail],
              ['En cobro jurídico', datos.cobro.en_cobro_juridico, null, false, Gavel],
              ['Derechos de petición', datos.cobro.derechos_peticion.total, resultados(datos.cobro.derechos_peticion), false, FileSignature],
              ['Acciones de tutela', datos.cobro.tutelas.total, resultados(datos.cobro.tutelas), false, Scale],
              ['Dados de baja', datos.cobro.dados_de_baja, null, false, Archive],
            ]} />
          </Panel>
          <div>
            <Panel titulo="Canal de recepción" sub="Por dónde llegaron los soportes">
              <Barras filas={datos.por_canal.map((f) => ({ ...f, valor: f.casos }))} etiqueta={(f) => CANALES[f.clave] || f.clave} unidad="casos" />
            </Panel>
            <Panel titulo="Usuarios de la plataforma" sub={`${plural(datos.usuarios.activos, 'activo', 'activos')}${datos.usuarios.inactivos ? ` · ${plural(datos.usuarios.inactivos, 'inactivo', 'inactivos')}` : ''}`}>
              <Barras filas={datos.usuarios.por_rol.map((f) => ({ clave: f.rol, valor: f.total }))} etiqueta={(f) => ROLES[f.clave] || f.clave} unidad="usuarios" />
            </Panel>
          </div>
        </div>
      </>}
    </div>
  );
}

function resultados(p) {
  if (!p.total) return null;
  return [
    p.favorables && `${p.favorables} favorables`, p.desfavorables && `${p.desfavorables} desfavorables`,
    p.sin_respuesta && `${p.sin_respuesta} sin respuesta`, p.en_curso && `${p.en_curso} en curso`,
  ].filter(Boolean).join(' · ');
}

// ---------- Piezas de la pantalla ----------

/** Pastilla de resumen, la misma que ve el colaborador en "Mis incapacidades". */
function Pastilla({ v, uno, varios, resto, tono = '' }) {
  return <span className={`resumen-pastilla ${tono}`}><b>{n(v)}</b> {Number(v) === 1 ? uno : varios}{resto ? ` ${resto}` : ''}</span>;
}

/** Tarjeta de una cifra principal: círculo con icono, número grande, nota y una franja inferior. */
function TarjetaDato({ icono: Icono, etiqueta, valor, nota, tono = '', children }) {
  return (
    <div className={`tarjeta tarjeta-dato ${tono}`}>
      <div className="tarjeta-dato-cabeza">
        <span className="tarjeta-icono" aria-hidden="true"><Icono size={20} strokeWidth={2} /></span>
        <span className="tarjeta-dato-etiqueta">{etiqueta}</span>
      </div>
      <div className="tarjeta-dato-valor">{valor}</div>
      {nota && <div className="tarjeta-dato-nota">{nota}</div>}
      {children && <div className="tarjeta-dato-pie">{children}</div>}
    </div>
  );
}

/** Barra partida en dos o más tramos con su leyenda (abiertas y cerradas). */
function Dividida({ partes }) {
  const total = partes.reduce((s, p) => s + Number(p.valor || 0), 0);
  return (
    <div className="tarjeta-dividida">
      <div className="tarjeta-dividida-barra" aria-hidden="true">
        {partes.filter((p) => p.valor > 0).map((p) => <span key={p.clase} className={p.clase} style={{ flexGrow: p.valor }} />)}
        {!total && <span className="vacia" style={{ flexGrow: 1 }} />}
      </div>
      <div className="tarjeta-dividida-leyenda">
        {partes.map((p) => <span key={p.clase}><i className={p.clase} aria-hidden="true" />{p.nombre}</span>)}
      </div>
    </div>
  );
}

const ETAPAS_VISTA = [
  { icono: Inbox, tono: 'neutra' },
  { icono: Stamp, tono: '' },
  { icono: Wallet, tono: 'cobro' },
  { icono: CircleCheck, tono: 'pagada' },
];

/** Etapas del proceso como tarjetas en fila, con flecha entre una y otra y los estados que tienen casos. */
function TarjetasEtapas({ etapas, total }) {
  return (
    <ol className="tarjetas-etapas">
      {etapas.map((e, i) => {
        const { icono: Icono, tono } = ETAPAS_VISTA.at(i) || ETAPAS_VISTA.at(1);
        const conCasos = e.estados.filter((s) => s.casos > 0);
        return (
          <li key={e.etapa} className={`tarjeta tarjeta-etapa ${tono} ${e.casos ? '' : 'en-cero'}`}>
            <div className="tarjeta-dato-cabeza">
              <span className="tarjeta-icono" aria-hidden="true"><Icono size={20} strokeWidth={2} /></span>
              <div className="tarjeta-etapa-nombre">
                <span>Paso {i + 1} de {etapas.length}</span>
                <b>{e.etapa}</b>
              </div>
            </div>
            <div className="tarjeta-dato-valor">{n(e.casos)} <small>{e.casos === 1 ? 'caso' : 'casos'}</small></div>
            <div className="tarjeta-progreso" role="img" aria-label={`${pct(e.casos, total)} de los casos`}>
              <span style={{ width: `${total ? (e.casos / total) * 100 : 0}%` }} />
            </div>
            <div className="tarjeta-dato-nota">{e.casos ? `${pct(e.casos, total)} de los casos` : 'Sin casos en esta etapa'}</div>
            {conCasos.length > 0 && (
              <ul className="tarjeta-etapa-estados">
                {conCasos.map((s) => <li key={s.estado}><Estado valor={s.estado} /><b>{n(s.casos)}</b></li>)}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Cifra pequeña con icono, para los datos que acompañan un panel (cartera). */
function MiniDato({ icono: Icono, etiqueta, valor, nota, tono = '' }) {
  return (
    <div className={`tarjeta mini-dato ${tono}`}>
      <span className="tarjeta-icono" aria-hidden="true"><Icono size={17} strokeWidth={2} /></span>
      <div className="mini-dato-texto">
        <span className="tarjeta-dato-etiqueta">{etiqueta}</span>
        <b className="mini-dato-valor">{valor}</b>
        {nota && <span className="mini-dato-nota">{nota}</span>}
      </div>
    </div>
  );
}

/** Lista de cifras: nombre, explicación opcional y número a la derecha. */
function Lista({ filas }) {
  return (
    <dl className="lista-cifras">
      {filas.map(([t, v, nota, alerta, Icono]) => (
        <div key={t} className={v ? '' : 'en-cero'}>
          <dt>
            {Icono && <span className="lista-icono" aria-hidden="true"><Icono size={15} strokeWidth={2} /></span>}
            <span>{t}{nota && <span className="secundario-texto">{nota}</span>}</span>
          </dt>
          <dd className={!v ? 'cero' : alerta ? 'texto-alerta' : ''}>{n(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

const SINGULAR = { días: 'día', casos: 'caso', usuarios: 'usuario' };

/** Barras horizontales de una sola serie: nombre y cifra en una línea, la barra debajo a todo el ancho. */
function Barras({ filas, etiqueta = (f) => f.clave, detalle, unidad = '', maximo, ordenFijo }) {
  if (!filas.length || filas.every((f) => !f.valor) && !ordenFijo && !maximo) return <p className="texto-tenue">Sin datos para el periodo.</p>;
  const tope = maximo || Math.max(1, ...filas.map((f) => f.valor));
  return (
    <ul className="barras">
      {filas.map((f) => {
        const texto = typeof etiqueta(f) === 'string' ? etiqueta(f) : f.clave;
        const medida = Number(f.valor) === 1 ? SINGULAR[unidad] || unidad : unidad;
        return (
          <li key={f.clave} className={f.valor ? '' : 'cero'} title={`${texto}: ${n(f.valor)} ${medida}${detalle ? ` (${detalle(f)})` : ''}`}>
            <div className="barra-cabeza">
              <span className="barra-nombre">{etiqueta(f)}</span>
              <span className="barra-cifra"><b>{n(f.valor)}</b> {medida}{detalle && <span className="barra-detalle"> · {detalle(f)}</span>}</span>
            </div>
            <div className="barra-pista" aria-hidden="true">
              {f.valor > 0 && <div className="barra" style={{ width: `${(f.valor / tope) * 100}%` }} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Divide el máximo en 4 marcas redondas (1, 2, 5, 10… por paso). */
function escala(max) {
  const bruto = Math.max(max, 1) / 4;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const paso = Math.max(1, [1, 2, 5, 10].map((m) => m * pot).find((p) => p >= bruto));
  return [0, 1, 2, 3, 4].map((i) => i * paso);
}

/** Columnas por mes, una sola serie. El valor sale al pasar el cursor; se rotula solo el mes más alto. */
function Columnas({ filas, medida, unidad }) {
  const marcas = escala(Math.max(...filas.map((f) => f[medida])));
  const tope = marcas[marcas.length - 1];
  const mayor = filas.reduce((m, f) => (f[medida] > m[medida] ? f : m), filas[0]);
  return (
    <div className="columnas">
      <div className="columnas-area" role="img" aria-label={`${unidad} por mes`}>
        {marcas.map((m) => (
          <div key={m} className="columnas-marca" style={{ bottom: `${(m / tope) * 100}%` }}><span>{n(m)}</span></div>
        ))}
        <div className="columnas-barras">
          {filas.map((f) => (
            <div key={f.mes} className="columna" tabIndex={0} aria-label={`${f.etiqueta}: ${n(f[medida])} ${unidad}`}>
              {f[medida] > 0 && <div className="columna-barra" style={{ height: `${(f[medida] / tope) * 100}%` }}>
                {f === mayor && <span className="columna-rotulo">{n(f[medida])}</span>}
              </div>}
              <div className="columna-tip" role="tooltip">
                <b>{f.etiqueta}</b>{n(f.casos)} casos · {n(f.dias)} días
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="columnas-ejes">
        {filas.map((f) => <span key={f.mes}>{f.etiqueta}</span>)}
      </div>
      <table className="sr-only">
        <caption>{unidad} por mes</caption>
        <thead><tr><th>Mes</th><th>Casos</th><th>Días</th></tr></thead>
        <tbody>{filas.map((f) => <tr key={f.mes}><td>{f.etiqueta}</td><td>{f.casos}</td><td>{f.dias}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

/** Barra dividida: de todo lo solicitado, cuánto se pagó, cuánto se cobra, cuánto falta cobrar y cuánto se perdió. */
function Cartera({ d }) {
  const partes = [
    { clave: 'pagado', nombre: 'Pagado', valor: d.pagado },
    { clave: 'cobro', nombre: 'En cobro', valor: d.por_cobrar },
    { clave: 'tramite', nombre: 'Aún en trámite', valor: d.sin_cobrar_aun },
    { clave: 'baja', nombre: 'Dado de baja', valor: d.dado_de_baja },
  ];
  const total = partes.reduce((s, p) => s + p.valor, 0);
  if (!total) return <p className="texto-tenue">Todavía no hay valores liquidados para cobrar.</p>;
  return (
    <div className="cartera">
      <div className="cartera-barra" role="img"
        aria-label={partes.map((p) => `${p.nombre}: ${dinero(p.valor)} (${pct(p.valor, total)})`).join('; ')}>
        {partes.filter((p) => p.valor > 0).map((p) => (
          <div key={p.clave} className={`cartera-parte ${p.clave}`} style={{ flexGrow: p.valor }}
            title={`${p.nombre}: ${dinero(p.valor)} (${pct(p.valor, total)})`}>
            {p.valor / total >= 0.1 && <span>{pct(p.valor, total)}</span>}
          </div>
        ))}
      </div>
      <ul className="cartera-leyenda">
        {partes.map((p) => (
          <li key={p.clave} className={p.valor ? '' : 'cero'}>
            <i className={`cartera-parte ${p.clave}`} aria-hidden="true" />
            <span className="cartera-leyenda-nombre">{p.nombre}</span>
            <b>{dinero(p.valor)}</b>
            <span className="cartera-leyenda-pct">{pct(p.valor, total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
