// EstadisticasController - Módulo "Estadísticas"
// Reúne en una sola respuesta las cifras del sistema: casos, colaboradores, días,
// dinero, cobro, jurídica y monitoreo. Se calcula en memoria sobre una sola consulta.
import { listarIncapacidades, listarColaboradores, repoUsuarios } from '../repositories/index.js';
import { calcularAcumulados, casosVigentes } from './MonitoreoController.js';
import { asyncHandler } from './_helpers.js';

// Orden del proceso, agrupado por etapa (diagrama de estados DE-01)
const ETAPAS = [
  { etapa: 'Recepción', estados: ['REPORTADA', 'DOCUMENTACION_REMITIDA', 'RECIBIDA', 'DOCUMENTACION_INCOMPLETA'] },
  { etapa: 'Trámite ante la entidad', estados: ['VERIFICADA', 'TRANSCRITA', 'RADICADA', 'RECHAZADA', 'ACEPTADA'] },
  { etapa: 'Cobro', estados: ['COBRADA', 'EN_COBRO_PERSUASIVO', 'EN_COBRO_JURIDICO', 'PAGO_NOTIFICADO'] },
  { etapa: 'Cerrados', estados: ['PAGADA', 'ARCHIVADA', 'DADA_DE_BAJA'] },
];
const CERRADOS = ['PAGADA', 'ARCHIVADA', 'DADA_DE_BAJA'];
const EN_COBRO = ['COBRADA', 'EN_COBRO_PERSUASIVO', 'EN_COBRO_JURIDICO', 'PAGO_NOTIFICADO'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const num = (v) => Number(v || 0);
const suma = (filas, f) => filas.reduce((s, x) => s + f(x), 0);
const redondear = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const diasEntre = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const saldo = (c) => Math.max(num(c.valor_solicitado) - num(c.valor_pagado), 0);

/** Agrupa filas por una clave y acumula casos, días y valores; ordena de mayor a menor. */
function agrupar(filas, clave, { orden = 'casos', limite } = {}) {
  const mapa = new Map();
  for (const c of filas) {
    const k = clave(c) || 'Sin dato';
    const g = mapa.get(k) || { clave: k, casos: 0, dias: 0, colaboradores: new Set(), solicitado: 0, pagado: 0 };
    g.casos += 1;
    g.dias += c.dias;
    g.colaboradores.add(c.colaborador_id);
    g.solicitado += num(c.valor_solicitado);
    g.pagado += num(c.valor_pagado);
    mapa.set(k, g);
  }
  const lista = [...mapa.values()]
    .map((g) => ({ ...g, colaboradores: g.colaboradores.size }))
    .sort((a, b) => b[orden] - a[orden] || a.clave.localeCompare(b.clave));
  return limite ? lista.slice(0, limite) : lista;
}

/** Casos y días por mes de inicio: el año elegido completo, o los últimos 12 meses. */
function porMes(casos, anio) {
  const meses = [];
  if (anio) {
    for (let m = 0; m < 12; m++) meses.push(`${anio}-${String(m + 1).padStart(2, '0')}`);
  } else {
    const d = new Date();
    for (let i = 11; i >= 0; i--) {
      const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
      meses.push(x.toISOString().slice(0, 7));
    }
  }
  return meses.map((mes) => {
    const delMes = casos.filter((c) => c.fecha_inicio.startsWith(mes));
    const [a, m] = mes.split('-');
    return { mes, etiqueta: `${MESES[Number(m) - 1]} ${a.slice(2)}`, casos: delMes.length, dias: suma(delMes, (c) => c.dias) };
  });
}

export const EstadisticasController = {
  /** GET /api/estadisticas?anio=YYYY  (sin año: todo el histórico) */
  resumen: asyncHandler(async (req, res) => {
    const [todos, colaboradores, usuarios] = await Promise.all([
      listarIncapacidades({}),
      listarColaboradores({ soloReportables: true }),
      repoUsuarios.listar({}, { select: 'id, rol, activo' }),
    ]);

    const anios = [...new Set(todos.map((c) => c.fecha_inicio.slice(0, 4)))].sort().reverse();
    const anio = /^\d{4}$/.test(req.query.anio || '') ? req.query.anio : null;
    const casos = anio ? todos.filter((c) => c.fecha_inicio.startsWith(anio)) : todos;
    const validos = casos.filter((c) => c.estado !== 'DADA_DE_BAJA'); // los dados de baja no cuentan como ausencia
    const hoy = new Date().toISOString().slice(0, 10);

    // ---------- Generales ----------
    const diasTotales = suma(validos, (c) => c.dias);
    const conIncapacidad = new Set(casos.map((c) => c.colaborador_id)).size;
    const incapacitadosHoy = new Set(todos
      .filter((c) => c.estado !== 'DADA_DE_BAJA' && c.fecha_inicio <= hoy && c.fecha_fin >= hoy)
      .map((c) => c.colaborador_id)).size;
    const generales = {
      incapacidades: casos.length,
      abiertas: casos.filter((c) => !CERRADOS.includes(c.estado)).length,
      cerradas: casos.filter((c) => CERRADOS.includes(c.estado)).length,
      dias_totales: diasTotales,
      promedio_dias: validos.length ? redondear(diasTotales / validos.length) : 0,
      prorrogas: casos.filter((c) => c.prorroga_de).length,
      extemporaneas: casos.filter((c) => c.extemporanea).length,
      colaboradores: colaboradores.length,
      colaboradores_con_incapacidad: conIncapacidad,
      porcentaje_colaboradores: colaboradores.length ? redondear((conIncapacidad / colaboradores.length) * 100) : 0,
      incapacitados_hoy: incapacitadosHoy,
    };

    // ---------- Proceso ----------
    const conteoEstado = (e) => casos.filter((c) => c.estado === e).length;
    const por_etapa = ETAPAS.map(({ etapa, estados }) => {
      const detalle = estados.map((estado) => ({ estado, casos: conteoEstado(estado) }));
      return { etapa, casos: suma(detalle, (d) => d.casos), estados: detalle };
    });

    // ---------- Distribuciones ----------
    const por_tipo = agrupar(validos, (c) => c.tipo, { orden: 'dias' });
    const por_area = agrupar(validos, (c) => c.colaborador?.area, { orden: 'dias' });
    const por_entidad = agrupar(casos, (c) => c.entidad?.nombre, { orden: 'casos' })
      .map((g) => ({ ...g, tipo: casos.find((c) => c.entidad?.nombre === g.clave)?.entidad?.tipo || '' }));
    const por_diagnostico = agrupar(validos, (c) => (c.diagnostico_cie10 || '').slice(0, 3).toUpperCase() || 'Sin diagnóstico',
      { orden: 'dias', limite: 8 });
    const por_canal = agrupar(casos.filter((c) => c.recepciones?.length),
      (c) => [...c.recepciones].sort((a, b) => a.fecha.localeCompare(b.fecha))[0].canal, { orden: 'casos' });
    const duracion = [
      ['1 a 2 días', 1, 2], ['3 a 7 días', 3, 7], ['8 a 15 días', 8, 15], ['16 a 30 días', 16, 30],
      ['31 a 90 días', 31, 90], ['Más de 90 días', 91, Infinity],
    ].map(([clave, a, b]) => ({ clave, casos: validos.filter((c) => c.dias >= a && c.dias <= b).length }));

    // ---------- Dinero ----------
    const ultimoFormato = (c) => [...(c.formatos || [])].sort((a, b) => b.version - a.version)[0];
    const solicitado = suma(casos, (c) => num(c.valor_solicitado));
    const pagado = suma(casos, (c) => num(c.valor_pagado));
    const dadoDeBaja = suma(casos.filter((c) => c.estado === 'DADA_DE_BAJA'), saldo);
    const dinero = {
      solicitado,
      pagado,
      por_cobrar: suma(casos.filter((c) => EN_COBRO.includes(c.estado)), saldo),
      sin_cobrar_aun: suma(casos.filter((c) => !EN_COBRO.includes(c.estado) && !CERRADOS.includes(c.estado)), saldo),
      dado_de_baja: dadoDeBaja,
      a_cargo_empresa: suma(casos, (c) => num(ultimoFormato(c)?.valor_empresa)),
      porcentaje_recuperado: solicitado ? redondear((pagado / solicitado) * 100) : 0,
    };

    // Días desde la radicación hasta el primer pago
    const tiemposPago = casos.map((c) => {
      const radicado = (c.gestiones || []).filter((g) => g.tipo === 'RADICACION').map((g) => g.fecha).sort()[0];
      const pago = (c.pagos || []).map((p) => p.fecha_pago).sort()[0];
      return radicado && pago ? diasEntre(radicado.slice(0, 10), pago) : null;
    }).filter((d) => d !== null && d >= 0);

    // ---------- Cobro y jurídica ----------
    const procesos = casos.flatMap((c) => c.procesos || []);
    const contarProcesos = (tipo) => {
      const p = procesos.filter((x) => x.tipo === tipo);
      return {
        total: p.length,
        favorables: p.filter((x) => x.resultado === 'FAVORABLE').length,
        desfavorables: p.filter((x) => x.resultado === 'DESFAVORABLE').length,
        sin_respuesta: p.filter((x) => x.resultado === 'SIN_RESPUESTA').length,
        en_curso: p.filter((x) => !x.resultado).length,
      };
    };
    const gestiones = casos.flatMap((c) => c.gestiones || []);
    const cobro = {
      rechazos: casos.filter((c) => c.estado === 'RECHAZADA').length,
      en_cobro_persuasivo: conteoEstado('EN_COBRO_PERSUASIVO'),
      en_cobro_juridico: conteoEstado('EN_COBRO_JURIDICO'),
      dados_de_baja: conteoEstado('DADA_DE_BAJA'),
      requerimientos: gestiones.filter((g) => g.tipo === 'REQUERIMIENTO').length,
      transcripciones: gestiones.filter((g) => g.tipo === 'TRANSCRIPCION').length,
      radicaciones: gestiones.filter((g) => g.tipo === 'RADICACION').length,
      dias_promedio_pago: tiemposPago.length ? Math.round(suma(tiemposPago, (d) => d) / tiemposPago.length) : null,
      derechos_peticion: contarProcesos('DERECHO_PETICION'),
      tutelas: contarProcesos('ACCION_TUTELA'),
    };

    // ---------- Monitoreo de días acumulados (siempre sobre los casos vigentes de hoy) ----------
    const acumulados = calcularAcumulados(todos);
    const vigentes = casosVigentes(todos).filter((c) => c.estado !== 'PAGADA').map((c) => acumulados.get(c.id));
    const monitoreo = {
      casos_vigentes: vigentes.length,
      desde_90: vigentes.filter((d) => d >= 90).length,
      desde_120: vigentes.filter((d) => d >= 120).length,
      desde_150: vigentes.filter((d) => d >= 150).length,
      mas_de_180: vigentes.filter((d) => d > 180).length,
    };

    // ---------- Usuarios de la plataforma ----------
    const activos = usuarios.filter((u) => u.activo);
    const por_rol = Object.entries(activos.reduce((acc, u) => ({ ...acc, [u.rol]: (acc[u.rol] || 0) + 1 }), {}))
      .map(([rol, total]) => ({ rol, total })).sort((a, b) => b.total - a.total);

    res.json({
      anio, anios,
      generales, por_etapa, por_tipo, por_area, por_entidad, por_diagnostico, por_canal, duracion,
      por_mes: porMes(validos, anio),
      dinero, cobro, monitoreo,
      usuarios: { activos: activos.length, inactivos: usuarios.length - activos.length, por_rol },
    });
  }),
};
