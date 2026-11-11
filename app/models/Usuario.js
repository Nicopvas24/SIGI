// Modelos de dominio: Usuario (superclase de roles) y Colaborador
export class Usuario {
  constructor(fila) { Object.assign(this, fila); }
  tieneRol(...roles) { return roles.includes(this.rol) || this.rol === 'ADMIN'; }
}

export class Colaborador {
  constructor(fila) { Object.assign(this, fila); }
}

export class Entidad {
  constructor(fila) { Object.assign(this, fila); }

  // Plazo de transcripción aplicable según el tipo de incapacidad (tabla 5.2.1)
  plazoParaTipo(tipo) {
    if (tipo === 'LICENCIA_PATERNIDAD') return 30; // 30 días calendario desde el nacimiento
    if (tipo === 'ACCIDENTE_TRANSITO' && this.plazo_transito_dias) return this.plazo_transito_dias;
    return this.plazo_transcripcion_dias;
  }
}
