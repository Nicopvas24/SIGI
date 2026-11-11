// ReglasIncapacidadService - reglas de negocio del procedimiento de incapacidades
// RN-06 (porcentajes 5.5.2), documentos exigidos por tipo (5.1.2),
// plazos de transcripción (5.2.1), umbrales de monitoreo (5.5.3)
// y transiciones de estado (DE-01).
import { TransicionesEstado } from '../models/enums.js';
import { config } from '../../config/config.js';

// Documentos obligatorios según el tipo de novedad (5.1.2)
const DOCUMENTOS_POR_TIPO = {
  ENFERMEDAD_GENERAL: ['CERTIFICADO', 'EPICRISIS'],
  ACCIDENTE_TRANSITO: ['CERTIFICADO', 'EPICRISIS', 'FURIPS'],
  ACCIDENTE_LABORAL: ['CERTIFICADO', 'EPICRISIS'],
  LICENCIA_MATERNIDAD: ['CERTIFICADO', 'EPICRISIS', 'NACIDO_VIVO', 'REGISTRO_CIVIL', 'DOC_IDENTIDAD'],
  LICENCIA_PATERNIDAD: ['EPICRISIS', 'NACIDO_VIVO', 'REGISTRO_CIVIL', 'DOC_IDENTIDAD'],
};

export const ReglasIncapacidadService = {
  documentosRequeridos(tipo, { dias = 0, transcritaPorEPS = false } = {}) {
    let req = [...(DOCUMENTOS_POR_TIPO[tipo] || ['CERTIFICADO'])];
    // Epicrisis obligatoria solo para >2 días, accidentes y licencias (definición 3),
    // y no se exige si la EPS ya transcribió (Act. 3 / CU-02 4b).
    const epicrisisOpcional =
      (tipo === 'ENFERMEDAD_GENERAL' && dias <= 2) || transcritaPorEPS;
    if (epicrisisOpcional) req = req.filter((d) => d !== 'EPICRISIS');
    return req;
  },

  documentosFaltantes(tipo, documentosCargados, opts) {
    const cargados = new Set(documentosCargados.map((d) => d.tipo_documento));
    return this.documentosRequeridos(tipo, opts).filter((d) => !cargados.has(d));
  },

  /**
   * RN-06 / 5.5.2 - Liquidación de la incapacidad:
   *  - Días 1-2: 100% del IBC, a cargo de la empresa.
   *  - Días 3-90: 66.67% del IBC, a cargo de la EPS.
   *  - Días 91-180: 50% del IBC, a cargo de la EPS.
   *  - Desde el día 181: trámite del colaborador ante el fondo de pensiones.
   * Las licencias de maternidad/paternidad las paga la EPS al 100%.
   * `diasAcumulados` son los días previos (prórrogas) para aplicar el tramo correcto.
   */
  liquidar({ tipo, dias, ibc, diasAcumulados = 0 }) {
    const ibcDiario = Number(ibc) / 30;
    const r = { diasEmpresa: 0, valorEmpresa: 0, diasEntidad: 0, valorEntidad: 0, diasFondoPension: 0, advertencias: [] };

    if (tipo === 'LICENCIA_MATERNIDAD' || tipo === 'LICENCIA_PATERNIDAD') {
      r.diasEntidad = dias;
      r.valorEntidad = redondear(dias * ibcDiario);
      return r;
    }

    for (let i = 1; i <= dias; i++) {
      const diaGlobal = diasAcumulados + i;
      if (diaGlobal <= 2) {
        r.diasEmpresa++; r.valorEmpresa += ibcDiario; // 100% empresa
      } else if (diaGlobal <= 90) {
        r.diasEntidad++; r.valorEntidad += ibcDiario * (2 / 3); // 66.67% EPS
      } else if (diaGlobal <= 180) {
        r.diasEntidad++; r.valorEntidad += ibcDiario * 0.5; // 50% EPS
      } else {
        r.diasFondoPension++;
      }
    }
    if (r.diasFondoPension > 0) {
      r.advertencias.push(
        `Desde el día 181 (${r.diasFondoPension} día(s)) el trámite corresponde al colaborador ante el fondo de pensiones (5.5.2).`
      );
    }
    r.valorEmpresa = redondear(r.valorEmpresa);
    r.valorEntidad = redondear(r.valorEntidad);
    return r;
  },

  // Plazo de transcripción vigente para una entidad y tipo (5.2.1)
  plazoTranscripcionDias(entidad, tipo) {
    if (tipo === 'LICENCIA_PATERNIDAD') return config.plazos.licenciaPaternidadDias;
    if (tipo === 'ACCIDENTE_TRANSITO' && entidad.plazo_transito_dias) return entidad.plazo_transito_dias;
    return entidad.plazo_transcripcion_dias;
  },

  diasRestantesTranscripcion(entidad, incapacidad) {
    const plazo = this.plazoTranscripcionDias(entidad, incapacidad.tipo);
    const inicio = new Date(incapacidad.fecha_inicio);
    const limite = new Date(inicio);
    limite.setDate(limite.getDate() + plazo);
    return Math.ceil((limite - Date.now()) / 86400000);
  },

  // Días acumulados (incluye cadena de prórrogas) y umbral de monitoreo 5.5.3
  umbralMonitoreo(diasAcumulados) {
    const umbrales = [...config.plazos.umbralesMonitoreo].reverse();
    return umbrales.find((u) => diasAcumulados >= u) || null;
  },

  validarTransicion(estadoActual, nuevoEstado) {
    const permitidos = TransicionesEstado[estadoActual] || [];
    if (!permitidos.includes(nuevoEstado)) {
      const e = new Error(
        `Transición inválida (DE-01): ${estadoActual} → ${nuevoEstado}. Permitidas: ${permitidos.join(', ') || 'ninguna'}`
      );
      e.status = 422;
      throw e;
    }
  },

  // Remisión extemporánea: después de 2 días de expedida (Act. 3)
  esRemisionExtemporanea(fechaInicio, fechaRemision = new Date()) {
    const limite = new Date(fechaInicio);
    limite.setDate(limite.getDate() + config.plazos.remisionDocumentosDias);
    return fechaRemision > limite;
  },

  // Suma días hábiles (lunes-viernes) para el plazo de faltantes (3 días hábiles)
  sumarDiasHabiles(desde, diasHabiles) {
    const fecha = new Date(desde);
    let sumados = 0;
    while (sumados < diasHabiles) {
      fecha.setDate(fecha.getDate() + 1);
      const dia = fecha.getDay();
      if (dia !== 0 && dia !== 6) sumados++;
    }
    return fecha;
  },
};

function redondear(v) { return Math.round(v * 100) / 100; }
