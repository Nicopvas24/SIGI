// Modelo de dominio: Incapacidad (clase central, sección 7)
import { EstadoIncapacidad, TransicionesEstado } from './enums.js';

export class Incapacidad {
  constructor(fila) {
    Object.assign(this, fila);
  }

  puedeTransicionarA(nuevoEstado) {
    return (TransicionesEstado[this.estado] || []).includes(nuevoEstado);
  }

  estaEnCobro() {
    return ['COBRADA', 'EN_COBRO_PERSUASIVO', 'EN_COBRO_JURIDICO'].includes(this.estado);
  }

  estaCerrada() {
    return [EstadoIncapacidad.ARCHIVADA, EstadoIncapacidad.DADA_DE_BAJA].includes(this.estado);
  }
}

export class DocumentoSoporte {
  constructor(fila) { Object.assign(this, fila); }
}

export class FormatoSeguimiento {
  constructor(fila) { Object.assign(this, fila); }
}
