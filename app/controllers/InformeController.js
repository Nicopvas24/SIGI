// InformeController - Módulo "Informes": genera los informes en PDF.
// Cada informe usa la misma función que la pantalla correspondiente, así las cifras coinciden.
//   GET /api/informes/estadisticas?anio=YYYY
//   GET /api/informes/ausentismo?periodo=YYYY-MM
//   GET /api/informes/cartera?anio=YYYY
//   GET /api/informes/prolongados
import { listarIncapacidades, registrarBitacora } from '../repositories/index.js';
import { calcularEstadisticas } from './EstadisticasController.js';
import { calcularAusentismo } from './TranscripcionController.js';
import { casosProlongados } from './MonitoreoController.js';
import { asyncHandler, errorHttp } from './_helpers.js';
import {
  COLOR, InformePdf, ROLES, estado, fecha, num, pct, pesos, plural, tipo,
} from '../services/InformePdfService.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const CANALES = {
  PRESENCIAL: 'Presencial', CORREO_ELECTRONICO: 'Correo electrónico', OFICINA_PRINCIPAL: 'Oficina principal',
  LIDER_COMERCIAL: 'Líder comercial', GESTION_HUMANA: 'Gestión humana',
};
const EN_COBRO = ['COBRADA', 'EN_COBRO_PERSUASIVO', 'EN_COBRO_JURIDICO', 'PAGO_NOTIFICADO'];
const anioValido = (v) => (/^\d{4}$/.test(v || '') ? String(v) : null);
const periodoTexto = (anio) => (anio ? `Año ${anio}` : 'Todo el histórico');
const saldo = (c) => Math.max(Number(c.valor_solicitado || 0) - Number(c.valor_pagado || 0), 0);

/** Qué roles pueden pedir cada informe (Administración siempre puede). */
export const INFORMES = {
  estadisticas: { roles: ['AUXILIAR'], archivo: (q) => `estadisticas-${anioValido(q.anio) || 'historico'}` },
  ausentismo: { roles: ['AUXILIAR'], archivo: (q) => `ausentismo-${/^\d{4}-\d{2}$/.test(q.periodo || '') ? q.periodo : new Date().toISOString().slice(0, 7)}` },
  cartera: { roles: ['AUXILIAR', 'CONTABILIDAD'], archivo: (q) => `cartera-${anioValido(q.anio) || 'historico'}` },
  prolongados: { roles: ['AUXILIAR'], archivo: () => `casos-prolongados-${new Date().toISOString().slice(0, 10)}` },
};

// ---------- Informes ----------

async function informeEstadisticas(q, usuario) {
  const d = await calcularEstadisticas(q.anio);
  const g = d.generales;
  const pdf = new InformePdf({
    titulo: 'Informe de estadísticas',
    subtitulo: `${periodoTexto(d.anio)}. Incapacidades contadas por su fecha de inicio; las dadas de baja no suman días.`,
    usuario,
  });

  pdf.seccion('Resumen', 'Las cifras principales del periodo.');
  pdf.cifras([
    ['Incapacidades', num(g.incapacidades), `${num(g.abiertas)} abiertas · ${num(g.cerradas)} cerradas`],
    ['Días de ausencia', num(g.dias_totales), `${num(g.promedio_dias)} días en promedio por caso`],
    ['Valor solicitado', pesos(d.dinero.solicitado), 'A las EPS y ARL'],
    ['Valor recuperado', pesos(d.dinero.pagado), `${num(d.dinero.porcentaje_recuperado)} % de lo solicitado`],
  ]);
  pdf.pastillas([
    { texto: `${plural(g.colaboradores_con_incapacidad, 'colaborador', 'colaboradores')} con incapacidad (${num(g.porcentaje_colaboradores)} % de ${num(g.colaboradores)})` },
    { texto: `${plural(g.incapacitados_hoy, 'incapacitado', 'incapacitados')} hoy` },
    { texto: plural(g.prorrogas, 'prórroga', 'prórrogas') },
    { texto: plural(g.extemporaneas, 'reporte extemporáneo', 'reportes extemporáneos'), resaltar: g.extemporaneas > 0 },
  ]);

  pdf.seccion('Proceso', 'En qué etapa está cada caso y cómo han llegado mes a mes.');
  pdf.etapas(d.por_etapa, g.incapacidades);
  pdf.subtitulo('Incapacidades por mes', d.anio ? `Casos de ${d.anio}` : 'Últimos 12 meses');
  pdf.columnasMes(d.por_mes, 'casos', 'casos');

  pdf.seccion('Ausentismo', 'Días de ausencia según el tipo de novedad, el área y el diagnóstico.');
  pdf.barrasEnPar(
    { titulo: 'Por tipo de novedad', explicacion: 'Días de ausencia', unidad: 'días', filas: d.por_tipo.map((f) => ({ nombre: tipo(f.clave), valor: f.dias, detalle: plural(f.casos, 'caso', 'casos') })) },
    { titulo: 'Por área', explicacion: 'Días de ausencia', unidad: 'días', filas: d.por_area.map((f) => ({ nombre: f.clave, valor: f.dias, detalle: plural(f.colaboradores, 'persona', 'personas') })) },
  );
  pdf.barrasEnPar(
    { titulo: 'Diagnósticos más frecuentes', explicacion: 'Días por grupo CIE-10 (los 8 primeros)', unidad: 'días', filas: d.por_diagnostico.map((f) => ({ nombre: f.clave, valor: f.dias, detalle: plural(f.casos, 'caso', 'casos') })) },
    { titulo: 'Duración de las incapacidades', explicacion: 'Casos según los días otorgados', unidad: 'casos', filas: d.duracion.map((f) => ({ nombre: f.clave, valor: f.casos })) },
  );

  pdf.seccion('Cartera y pagos', `De ${pesos(d.dinero.solicitado)} solicitados a las entidades, cuánto se ha pagado y cuánto falta.`);
  pdf.barraDividida(partesCartera(d.dinero));
  const tp = d.cobro.dias_promedio_pago;
  pdf.cifras([
    ['A cargo de la empresa', pesos(d.dinero.a_cargo_empresa), 'Días que paga el empleador'],
    ['Tiempo de pago', tp === null ? '—' : tp === 0 ? 'Mismo día' : plural(tp, 'día', 'días'), 'Desde la radicación hasta el pago'],
    ['Rechazos vigentes', num(d.cobro.rechazos), 'Casos negados por la entidad', d.cobro.rechazos > 0],
    ['Requerimientos', num(d.cobro.requerimientos), 'Cartas de cobro persuasivo'],
  ]);
  pdf.subtitulo('Por entidad');
  tablaEntidades(pdf, d.por_entidad);

  pdf.seccion('Control', 'Plazos de ley, cobro jurídico y uso de la plataforma.');
  pdf.subtitulo('Días acumulados', `${plural(d.monitoreo.casos_vigentes, 'caso vigente', 'casos vigentes')} hoy, sumando prórrogas (no depende del año).`);
  pdf.cifras([
    ['Desde el día 90', num(d.monitoreo.desde_90), 'Reporte de casos prolongados'],
    ['Desde el día 120', num(d.monitoreo.desde_120), 'Concepto de rehabilitación'],
    ['Desde el día 150', num(d.monitoreo.desde_150), 'Envío del concepto al AFP'],
    ['Más de 180', num(d.monitoreo.mas_de_180), 'Suspensión de pago por nómina', d.monitoreo.mas_de_180 > 0],
  ]);
  pdf.subtitulo('Cobro y jurídica');
  const res = (p) => [p.favorables && `${p.favorables} favorables`, p.desfavorables && `${p.desfavorables} desfavorables`,
    p.sin_respuesta && `${p.sin_respuesta} sin respuesta`, p.en_curso && `${p.en_curso} en curso`].filter(Boolean).join(' · ') || '—';
  pdf.tabla(
    [{ titulo: 'Gestión', ancho: 0.45 }, { titulo: 'Cantidad', ancho: 0.15, alinear: 'right' }, { titulo: 'Detalle', ancho: 0.4 }],
    [
      ['Transcripciones', num(d.cobro.transcripciones), '—'],
      ['Radicaciones', num(d.cobro.radicaciones), '—'],
      ['En cobro persuasivo', num(d.cobro.en_cobro_persuasivo), '—'],
      ['En cobro jurídico', num(d.cobro.en_cobro_juridico), '—'],
      ['Derechos de petición', num(d.cobro.derechos_peticion.total), res(d.cobro.derechos_peticion)],
      ['Acciones de tutela', num(d.cobro.tutelas.total), res(d.cobro.tutelas)],
      ['Dados de baja', num(d.cobro.dados_de_baja), '—'],
    ],
  );
  pdf.barrasEnPar(
    { titulo: 'Canal de recepción', explicacion: 'Por dónde llegaron los soportes', unidad: 'casos', filas: d.por_canal.map((f) => ({ nombre: CANALES[f.clave] || f.clave, valor: f.casos })) },
    { titulo: 'Usuarios de la plataforma', explicacion: `${plural(d.usuarios.activos, 'activo', 'activos')}`, unidad: 'usuarios', filas: d.usuarios.por_rol.map((f) => ({ nombre: ROLES[f.rol] || f.rol, valor: f.total })) },
  );
  return pdf.terminar();
}

async function informeAusentismo(q, usuario) {
  const { periodo, desde, hasta, resumen: r, registros } = await calcularAusentismo(q.periodo);
  const [a, m] = periodo.split('-').map(Number);
  const pdf = new InformePdf({
    titulo: 'Informe de ausentismo',
    subtitulo: `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)} de ${a} (del ${fecha(desde)} al ${fecha(hasta)}). Para el Sistema de Gestión de Seguridad y Salud en el Trabajo. Cuenta solo los días que caen dentro del mes.`,
    usuario,
  });
  pdf.seccion('Resumen del mes');
  pdf.cifras([
    ['Incapacidades', num(r.total_incapacidades), 'Vigentes en algún día del mes'],
    ['Colaboradores afectados', num(r.colaboradores_afectados), 'Personas distintas'],
    ['Días perdidos', num(r.dias_perdidos), 'Dentro del mes'],
    ['Promedio', `${num(r.promedio_dias)} días`, 'Por incapacidad'],
  ]);
  const filas = (obj, nombre = (k) => k) => Object.entries(obj).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ nombre: nombre(k), valor: v }));
  pdf.seccion('Distribución de los días');
  pdf.barrasEnPar(
    { titulo: 'Por tipo de novedad', unidad: 'días', filas: filas(r.por_tipo, tipo) },
    { titulo: 'Por origen', unidad: 'días', filas: filas(r.por_origen, (k) => (k === 'LABORAL' ? 'Laboral' : 'Común')) },
  );
  pdf.subtitulo('Por área');
  pdf.barras(filas(r.por_area), { unidad: 'días' });
  pdf.espacio(8);
  pdf.seccion('Detalle de incapacidades', 'El diagnóstico va agrupado por las tres primeras letras del código CIE-10.');
  pdf.tabla(
    [{ titulo: 'Caso', ancho: 0.17 }, { titulo: 'Colaborador', ancho: 0.24 }, { titulo: 'Área', ancho: 0.15 }, { titulo: 'Tipo', ancho: 0.2 },
      { titulo: 'Origen', ancho: 0.09 }, { titulo: 'Días', ancho: 0.07, alinear: 'right' }, { titulo: 'CIE-10', ancho: 0.08 }],
    [...registros].sort((x, y) => y.dias - x.dias).map((x) => [
      { t: x.numero_caso, negrita: true }, x.colaborador || '—', x.area, tipo(x.tipo), x.origen === 'LABORAL' ? 'Laboral' : 'Común', num(x.dias), x.diagnostico_agrupado,
    ]),
    { total: registros.length ? [`${plural(registros.length, 'incapacidad', 'incapacidades')}`, '', '', '', '', num(r.dias_perdidos), ''] : null, vacio: 'No hubo incapacidades en el mes.' },
  );
  return pdf.terminar();
}

async function informeCartera(q, usuario) {
  const anio = anioValido(q.anio);
  const [d, todos] = await Promise.all([calcularEstadisticas(anio), listarIncapacidades({})]);
  const casos = (anio ? todos.filter((c) => c.fecha_inicio.startsWith(anio)) : todos);
  const pdf = new InformePdf({
    titulo: 'Informe de cartera con EPS y ARL',
    subtitulo: `${periodoTexto(anio)}. Lo que las entidades deben reconocer, lo pagado y lo que falta por cobrar.`,
    usuario,
  });
  pdf.seccion('Resumen');
  pdf.cifras([
    ['Valor solicitado', pesos(d.dinero.solicitado), 'A las EPS y ARL'],
    ['Valor pagado', pesos(d.dinero.pagado), `${num(d.dinero.porcentaje_recuperado)} % de lo solicitado`],
    ['En cobro', pesos(d.dinero.por_cobrar), 'Saldo de casos en cobro'],
    ['A cargo de la empresa', pesos(d.dinero.a_cargo_empresa), 'Días que paga el empleador'],
  ]);
  pdf.barraDividida(partesCartera(d.dinero));
  pdf.seccion('Por entidad');
  tablaEntidades(pdf, d.por_entidad);
  const pendientes = casos.filter((c) => saldo(c) > 0 && c.estado !== 'DADA_DE_BAJA').sort((x, y) => saldo(y) - saldo(x));
  pdf.seccion('Casos con saldo pendiente', 'Ordenados de mayor a menor saldo.');
  pdf.tabla(
    [{ titulo: 'Caso', ancho: 0.16 }, { titulo: 'Colaborador', ancho: 0.19 }, { titulo: 'Entidad', ancho: 0.12 }, { titulo: 'Estado', ancho: 0.13 },
      { titulo: 'Solicitado', ancho: 0.14, alinear: 'right' }, { titulo: 'Pagado', ancho: 0.12, alinear: 'right' }, { titulo: 'Saldo', ancho: 0.14, alinear: 'right' }],
    pendientes.map((c) => [
      { t: c.numero_caso, negrita: true, sub: fecha(c.fecha_inicio) }, c.colaborador?.usuario?.nombre || '—', c.entidad?.nombre || '—',
      { t: estado(c.estado), color: EN_COBRO.includes(c.estado) ? COLOR.naranja : COLOR.texto }, pesos(c.valor_solicitado), pesos(c.valor_pagado), { t: pesos(saldo(c)), negrita: true },
    ]),
    {
      total: pendientes.length ? [plural(pendientes.length, 'caso', 'casos'), '', '', '', pesos(pendientes.reduce((s, c) => s + Number(c.valor_solicitado || 0), 0)),
        pesos(pendientes.reduce((s, c) => s + Number(c.valor_pagado || 0), 0)), pesos(pendientes.reduce((s, c) => s + saldo(c), 0))] : null,
      vacio: 'No hay casos con saldo pendiente.',
    },
  );
  pdf.nota('El saldo es lo solicitado menos lo pagado. Los casos que aún no se han liquidado no tienen valor solicitado y no aparecen en esta lista.');
  return pdf.terminar();
}

async function informeProlongados(_q, usuario) {
  const filas = await casosProlongados();
  const pdf = new InformePdf({
    titulo: 'Informe de casos prolongados',
    subtitulo: `Casos vigentes con 90 días o más acumulados, sumando prórrogas, al ${fecha(new Date().toISOString())}.`,
    usuario,
  });
  const desde = (d) => filas.filter((f) => f.dias_acumulados >= d).length;
  pdf.seccion('Resumen');
  pdf.cifras([
    ['Desde el día 90', num(desde(90)), 'Reporte de casos prolongados'],
    ['Desde el día 120', num(desde(120)), 'Concepto de rehabilitación'],
    ['Desde el día 150', num(desde(150)), 'Envío del concepto al AFP'],
    ['Más de 180', num(filas.filter((f) => f.dias_acumulados > 180).length), 'Suspensión de pago por nómina', filas.some((f) => f.dias_acumulados > 180)],
  ]);
  const concepto = (c) => (!c ? 'Sin solicitar' : !c.resultado ? 'Solicitado' : `${c.resultado === 'FAVORABLE' ? 'Favorable' : 'Desfavorable'}${c.enviado_afp ? ' · enviado al AFP' : ''}`);
  const accion = (f) => (f.requiere_suspension_nomina ? 'Suspender el pago por nómina'
    : f.pendiente_envio_afp ? 'Enviar el concepto al AFP'
      : f.vencido_concepto_120 ? 'Concepto vencido: pasó el día 120'
        : f.requiere_concepto ? 'Solicitar el concepto de rehabilitación' : 'Seguimiento');
  pdf.seccion('Detalle', 'Los días 90, 120, 150 y 180 son los plazos de la ley; la acción indica lo que falta hacer.');
  pdf.tabla(
    [{ titulo: 'Caso', ancho: 0.18 }, { titulo: 'Colaborador', ancho: 0.2 }, { titulo: 'Entidad', ancho: 0.13 }, { titulo: 'Días', ancho: 0.08, alinear: 'right' },
      { titulo: 'Concepto', ancho: 0.17 }, { titulo: 'Acción pendiente', ancho: 0.24 }],
    filas.map((f) => [
      { t: f.numero_caso, negrita: true, sub: tipo(f.tipo) }, f.colaborador || '—', f.entidad || '—',
      { t: num(f.dias_acumulados), negrita: true, color: f.dias_acumulados > 180 ? COLOR.rojo : COLOR.texto },
      concepto(f.concepto_rehabilitacion),
      { t: accion(f), color: f.requiere_suspension_nomina || f.vencido_concepto_120 ? COLOR.rojo : COLOR.texto },
    ]),
    { vacio: 'No hay casos con 90 días o más acumulados.' },
  );
  return pdf.terminar();
}

// ---------- Partes compartidas ----------

function partesCartera(dinero) {
  return [
    { nombre: 'Pagado', valor: dinero.pagado, color: COLOR.verde },
    { nombre: 'En cobro', valor: dinero.por_cobrar, color: COLOR.naranja },
    { nombre: 'Aún en trámite', valor: dinero.sin_cobrar_aun, color: COLOR.lila, textoClaro: true },
    { nombre: 'Dado de baja', valor: dinero.dado_de_baja, color: COLOR.rojo },
  ];
}

function tablaEntidades(pdf, entidades) {
  const t = (k) => entidades.reduce((s, e) => s + Number(e[k] || 0), 0);
  pdf.tabla(
    [{ titulo: 'Entidad', ancho: 0.27 }, { titulo: 'Casos', ancho: 0.1, alinear: 'right' }, { titulo: 'Días', ancho: 0.1, alinear: 'right' },
      { titulo: 'Solicitado', ancho: 0.18, alinear: 'right' }, { titulo: 'Pagado', ancho: 0.18, alinear: 'right' }, { titulo: 'Recuperado', ancho: 0.17, alinear: 'right' }],
    entidades.map((e) => [
      { t: e.clave, negrita: true, sub: e.tipo }, num(e.casos), num(e.dias), pesos(e.solicitado), pesos(e.pagado),
      { t: e.solicitado ? pct(e.pagado, e.solicitado) : '—', color: e.solicitado && e.pagado >= e.solicitado ? COLOR.verde : COLOR.texto },
    ]),
    { total: entidades.length ? ['Total', num(t('casos')), num(t('dias')), pesos(t('solicitado')), pesos(t('pagado')), t('solicitado') ? pct(t('pagado'), t('solicitado')) : '—'] : null, vacio: 'Sin casos en el periodo.' },
  );
}

const GENERADORES = { estadisticas: informeEstadisticas, ausentismo: informeAusentismo, cartera: informeCartera, prolongados: informeProlongados };

export const InformeController = {
  /** GET /api/informes/:tipo -> PDF para descargar */
  generar: asyncHandler(async (req, res) => {
    const def = INFORMES[req.params.tipo];
    if (!def) throw errorHttp('Ese informe no existe.', 404);
    if (req.usuario.rol !== 'ADMIN' && !def.roles.includes(req.usuario.rol)) throw errorHttp('Su rol no puede generar este informe.', 403);
    const pdf = await GENERADORES[req.params.tipo](req.query, req.usuario);
    await registrarBitacora(req.usuario.id, 'GENERAR_INFORME', { informe: req.params.tipo, filtros: req.query });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="sigi-${def.archivo(req.query)}.pdf"`,
      'Content-Length': pdf.length,
      'Cache-Control': 'no-store',
    });
    res.send(pdf);
  }),
};
