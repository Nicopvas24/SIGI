// Vista Estadísticas - todas las cifras del sistema en un solo módulo
import { useEffect, useState } from 'react';
import { ChartColumn } from 'lucide-react';
import { api } from '../api.js';
import { Aviso, Encabezado, Estado, Panel, ROLES, Vacio, dinero, tipo } from '../ui.jsx';

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

  useEffect(() => {
    setDatos(null);
    api(`/estadisticas${anio ? `?anio=${anio}` : ''}`).then(setDatos).catch((e) => setMsj({ t: 'error', m: e.message }));
  }, [anio]);

  const g = datos?.generales;
  const periodo = anio ? `en ${anio}` : 'en todo el histórico';

  return (
    <div>
      <Encabezado titulo="Estadísticas" descripcion="Cifras de incapacidades, colaboradores, cobro y pagos.">
        <select aria-label="Año" value={anio} onChange={(e) => setAnio(e.target.value)} style={{ width: 170 }}>
          <option value="">Todos los años</option>
          {(datos?.anios || (anio ? [anio] : [])).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </Encabezado>
      <Aviso msj={msj} onCerrar={() => setMsj(null)} />

      {!datos ? <Panel><p className="texto-tenue">{msj ? 'No se pudieron cargar las estadísticas.' : 'Cargando…'}</p></Panel> : !g.incapacidades && !anio ? (
        <Panel><Vacio icono={ChartColumn} titulo="Todavía no hay incapacidades registradas">Las cifras aparecen cuando se reporte el primer caso.</Vacio></Panel>
      ) : <>
        {/* ---------- Resumen ---------- */}
        <Panel titulo="Resumen" sub={`Casos con fecha de inicio ${periodo}. Los dados de baja no suman días.`}>
          <div className="kpis">
            <Cifra etiqueta="Incapacidades" valor={n(g.incapacidades)} nota={`${n(g.abiertas)} abiertas · ${n(g.cerradas)} cerradas`} />
            <Cifra etiqueta="Días de ausencia" valor={n(g.dias_totales)} nota={`${n(g.promedio_dias)} días en promedio por caso`} />
            <Cifra etiqueta="Colaboradores con incapacidad" valor={n(g.colaboradores_con_incapacidad)}
              nota={`${n(g.porcentaje_colaboradores)} % de ${n(g.colaboradores)} colaboradores`} />
            <Cifra etiqueta="Incapacitados hoy" valor={n(g.incapacitados_hoy)} nota="Personas con una incapacidad vigente" />
            <Cifra etiqueta="Prórrogas" valor={n(g.prorrogas)} nota={`${pct(g.prorrogas, g.incapacidades)} de los casos`} />
            <Cifra etiqueta="Reportes extemporáneos" valor={n(g.extemporaneas)} nota="Remitidos después de 2 días" />
            <Cifra etiqueta="Valor solicitado" valor={dinero(datos.dinero.solicitado)} nota="A EPS y ARL" />
            <Cifra etiqueta="Valor recuperado" valor={dinero(datos.dinero.pagado)} nota={`${n(datos.dinero.porcentaje_recuperado)} % de lo solicitado`} />
          </div>
        </Panel>

        {/* ---------- Tendencia ---------- */}
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

        {/* ---------- Estado del proceso ---------- */}
        <Panel titulo="Dónde están los casos" sub={`Estado actual de las ${n(g.incapacidades)} incapacidades, por etapa del proceso`}>
          <div className="etapas">
            {datos.por_etapa.map((e) => (
              <div key={e.etapa} className="etapa">
                <div className="etapa-cabeza"><b>{e.etapa}</b><span>{plural(e.casos, "caso", "casos")}</span></div>
                <Barras
                  filas={e.estados.map((s) => ({ clave: s.estado, valor: s.casos }))}
                  maximo={Math.max(1, ...datos.por_etapa.flatMap((x) => x.estados.map((s) => s.casos)))}
                  etiqueta={(f) => <Estado valor={f.clave} />}
                />
              </div>
            ))}
          </div>
        </Panel>

        {/* ---------- Distribuciones ---------- */}
        <div className="rejilla-2">
          <Panel titulo="Por tipo de novedad" sub="Días de ausencia">
            <Barras filas={datos.por_tipo.map((f) => ({ ...f, valor: f.dias }))} etiqueta={(f) => tipo(f.clave)}
              detalle={(f) => plural(f.casos, "caso", "casos")} unidad="días" />
          </Panel>
          <Panel titulo="Por área" sub="Días de ausencia">
            <Barras filas={datos.por_area.map((f) => ({ ...f, valor: f.dias }))}
              detalle={(f) => `${plural(f.casos, "caso", "casos")} · ${plural(f.colaboradores, "persona", "personas")}`} unidad="días" />
          </Panel>
          <Panel titulo="Diagnósticos más frecuentes" sub="Días de ausencia por grupo CIE-10 (los 8 primeros)">
            <Barras filas={datos.por_diagnostico.map((f) => ({ ...f, valor: f.dias }))} detalle={(f) => plural(f.casos, "caso", "casos")} unidad="días" />
          </Panel>
          <Panel titulo="Duración de las incapacidades" sub="Número de casos según los días otorgados">
            <Barras filas={datos.duracion.map((f) => ({ ...f, valor: f.casos }))} unidad="casos" ordenFijo />
          </Panel>
        </div>

        {/* ---------- Cartera ---------- */}
        <Panel titulo="Cartera con EPS y ARL" sub="Lo que las entidades deben reconocer y cuánto se ha recuperado">
          <Cartera d={datos.dinero} />
          <div className="kpis kpis-cartera">
            <Cifra etiqueta="A cargo de la empresa" valor={dinero(datos.dinero.a_cargo_empresa)} nota="Días que paga el empleador según la liquidación" />
            <Cifra etiqueta="Tiempo de pago" valor={datos.cobro.dias_promedio_pago === null ? '—' : `${n(datos.cobro.dias_promedio_pago)} días`}
              nota="Promedio desde la radicación hasta el pago" />
            <Cifra etiqueta="Rechazos vigentes" valor={n(datos.cobro.rechazos)} nota="Casos negados por la entidad" />
            <Cifra etiqueta="Requerimientos enviados" valor={n(datos.cobro.requerimientos)} nota="Cartas de cobro persuasivo" />
          </div>
        </Panel>

        <Panel titulo="Por entidad" sub="Casos, días y dinero por EPS y ARL" cuerpo={false}>
          {datos.por_entidad.length ? (
            <div className="tabla-wrap">
              <table>
                <thead><tr>
                  <th>Entidad</th><th className="num">Casos</th><th className="num">Días</th>
                  <th className="num">Solicitado</th><th className="num">Pagado</th><th className="num">Recuperado</th>
                </tr></thead>
                <tbody>
                  {datos.por_entidad.map((e) => (
                    <tr key={e.clave}>
                      <td><b>{e.clave}</b><span className="secundario-texto">{e.tipo}</span></td>
                      <td className="num">{n(e.casos)}</td>
                      <td className="num">{n(e.dias)}</td>
                      <td className="num">{dinero(e.solicitado)}</td>
                      <td className="num">{dinero(e.pagado)}</td>
                      <td className="num">{e.solicitado ? pct(e.pagado, e.solicitado) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="panel-cuerpo"><p className="texto-tenue">Sin casos {periodo}.</p></div>}
        </Panel>

        {/* ---------- Cobro, jurídica y monitoreo ---------- */}
        <div className="rejilla-2">
          <Panel titulo="Cobro y jurídica" sub={`Casos con fecha de inicio ${periodo}`}>
            <Lista filas={[
              ['En cobro persuasivo', datos.cobro.en_cobro_persuasivo],
              ['En cobro jurídico', datos.cobro.en_cobro_juridico],
              ['Dados de baja', datos.cobro.dados_de_baja],
              ['Derechos de petición', datos.cobro.derechos_peticion.total, resultados(datos.cobro.derechos_peticion)],
              ['Acciones de tutela', datos.cobro.tutelas.total, resultados(datos.cobro.tutelas)],
              ['Transcripciones', datos.cobro.transcripciones],
              ['Radicaciones', datos.cobro.radicaciones],
            ]} />
          </Panel>
          <Panel titulo="Días acumulados" sub={`${n(datos.monitoreo.casos_vigentes)} casos vigentes hoy, con prórrogas (no depende del año)`}>
            <Lista filas={[
              ['Desde el día 90', datos.monitoreo.desde_90, 'Reporte de casos prolongados'],
              ['Desde el día 120', datos.monitoreo.desde_120, 'Requieren concepto de rehabilitación'],
              ['Desde el día 150', datos.monitoreo.desde_150, 'Envío del concepto al fondo de pensiones'],
              ['Más de 180 días', datos.monitoreo.mas_de_180, 'Suspensión del pago por nómina', true],
            ]} />
          </Panel>
          <Panel titulo="Canal de recepción" sub="Por dónde llegó cada incapacidad">
            <Barras filas={datos.por_canal.map((f) => ({ ...f, valor: f.casos }))} etiqueta={(f) => CANALES[f.clave] || f.clave} unidad="casos" />
          </Panel>
          <Panel titulo="Usuarios de la plataforma" sub={`${n(datos.usuarios.activos)} activos${datos.usuarios.inactivos ? ` · ${n(datos.usuarios.inactivos)} inactivos` : ''}`}>
            <Barras filas={datos.usuarios.por_rol.map((f) => ({ clave: f.rol, valor: f.total }))} etiqueta={(f) => ROLES[f.clave] || f.clave} unidad="usuarios" />
          </Panel>
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

function Cifra({ etiqueta, valor, nota }) {
  return (
    <div className="kpi">
      <div className="kpi-etiqueta">{etiqueta}</div>
      <div className="kpi-valor">{valor}</div>
      {nota && <div className="kpi-nota">{nota}</div>}
    </div>
  );
}

/** Lista de cifras: nombre, explicación opcional y número a la derecha. */
function Lista({ filas }) {
  return (
    <dl className="lista-cifras">
      {filas.map(([t, v, nota, alerta]) => (
        <div key={t}>
          <dt>{t}{nota && <span className="secundario-texto">{nota}</span>}</dt>
          <dd className={!v ? 'cero' : alerta ? 'texto-alerta' : ''}>{n(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Barras horizontales de una sola serie, con el valor al final de cada barra. */
function Barras({ filas, etiqueta = (f) => f.clave, detalle, unidad = '', maximo, ordenFijo }) {
  if (!filas.length || filas.every((f) => !f.valor) && !ordenFijo && !maximo) return <p className="texto-tenue">Sin datos para el periodo.</p>;
  const tope = maximo || Math.max(1, ...filas.map((f) => f.valor));
  return (
    <ul className="barras">
      {filas.map((f) => {
        const texto = typeof etiqueta(f) === 'string' ? etiqueta(f) : f.clave;
        return (
          <li key={f.clave} title={`${texto}: ${n(f.valor)} ${unidad}${detalle ? ` (${detalle(f)})` : ''}`}>
            <div className="barra-nombre">{etiqueta(f)}{detalle && <span className="secundario-texto">{detalle(f)}</span>}</div>
            <div className="barra-pista">
              {f.valor > 0 && <div className="barra" style={{ width: `calc((100% - 52px) * ${f.valor / tope})` }} />}
              <span className={`barra-valor ${f.valor ? '' : 'cero'}`}>{n(f.valor)}</span>
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
          <li key={p.clave}><i className={`cartera-parte ${p.clave}`} aria-hidden="true" />{p.nombre}<b>{dinero(p.valor)}</b></li>
        ))}
      </ul>
    </div>
  );
}
