// InformePdfService - arma los informes en PDF con la misma línea visual de la interfaz:
// logo, colores de SIGI, cifras en columnas, barras, tablas y pie con paginación.
// Usa las fuentes estándar del PDF (Helvetica), que traen tildes y eñes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const LOGO = path.join(aqui, '../views/public/assets/brand/sigi-isotipo-512.png');

export const COLOR = {
  sello: '#5537C0', selloClaro: '#EEEAFB', texto: '#1B1729', texto2: '#565170', texto3: '#6E6987',
  borde: '#E4E1EC', bordeFuerte: '#CCC7D9', fondo: '#FAF9FC', verde: '#16704A', naranja: '#9E460B',
  rojo: '#B42318', lila: '#B9AEE0', amarillo: '#FFF6C2', amarilloTexto: '#574500',
};

// ---------- Formato (igual que en la interfaz) ----------
const fmtNum = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const fmtPesos = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
export const num = (v) => fmtNum.format(Number(v || 0));
export const pesos = (v) => `$\u00A0${fmtPesos.format(Math.round(Number(v || 0)))}`; // espacio que no se corta
export const pct = (parte, total) => (total ? `${fmtNum.format(Math.round((parte / total) * 1000) / 10)} %` : '0 %');
export const plural = (v, uno, varios) => `${num(v)} ${Number(v) === 1 ? uno : varios}`;
const fmtFecha = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const fecha = (v) => (v ? fmtFecha.format(new Date(`${String(v).slice(0, 10)}T00:00:00Z`)).replace('.', '') : '—');
const fmtGenerado = new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota' });

export const TIPOS = {
  ENFERMEDAD_GENERAL: 'Enfermedad general', ACCIDENTE_LABORAL: 'Accidente laboral', ACCIDENTE_TRANSITO: 'Accidente de tránsito',
  LICENCIA_MATERNIDAD: 'Licencia de maternidad', LICENCIA_PATERNIDAD: 'Licencia de paternidad',
};
export const ESTADOS = {
  REPORTADA: 'Reportada', DOCUMENTACION_REMITIDA: 'Docs. remitidos', RECIBIDA: 'Recibida', DOCUMENTACION_INCOMPLETA: 'Docs. incompletos',
  VERIFICADA: 'Verificada', TRANSCRITA: 'Transcrita', RADICADA: 'Radicada', ACEPTADA: 'Aceptada', RECHAZADA: 'Rechazada',
  COBRADA: 'Cobrada', EN_COBRO_PERSUASIVO: 'Cobro persuasivo', EN_COBRO_JURIDICO: 'Cobro jurídico', PAGO_NOTIFICADO: 'Pago notificado',
  PAGADA: 'Pagada', DADA_DE_BAJA: 'Dada de baja', ARCHIVADA: 'Archivada',
};
export const ROLES = {
  COLABORADOR: 'Colaborador', RECEPCIONISTA: 'Recepción', AUXILIAR: 'Auxiliar de personal', JURIDICA: 'Área jurídica',
  CONTABILIDAD: 'Contabilidad', GESTION_DOCUMENTAL: 'Gestión documental', ADMIN: 'Administración',
};
export const tipo = (t) => TIPOS[t] || String(t || '').replaceAll('_', ' ');
export const estado = (e) => ESTADOS[e] || String(e || '').replaceAll('_', ' ');

const NORMAL = 'Helvetica', NEGRITA = 'Helvetica-Bold';
const SINGULAR = { días: 'día', casos: 'caso', usuarios: 'usuario' };

export class InformePdf {
  /** @param {{ titulo: string, subtitulo?: string, usuario?: { nombre: string, rol: string } }} opciones */
  constructor({ titulo, subtitulo, usuario }) {
    this.titulo = titulo;
    this.doc = new PDFDocument({
      size: 'A4', margins: { top: 48, bottom: 64, left: 48, right: 48 }, bufferPages: true,
      info: { Title: `SIGI · ${titulo}`, Author: 'SIGI · Gestión de incapacidades', Subject: subtitulo || titulo },
    });
    this.x = 48;
    this.ancho = this.doc.page.width - 96;
    this.fondoPagina = this.doc.page.height - 64;
    this.y = 48;
    this.encabezado(subtitulo, usuario);
  }

  // ---------- Página ----------

  /** Si lo que viene no cabe, pasa a una página nueva. */
  asegurar(alto) {
    if (this.y + alto > this.fondoPagina) {
      this.doc.addPage();
      this.y = 48;
      return true;
    }
    return false;
  }

  espacio(alto = 12) { this.y += alto; }

  texto(str, x, y, { tam = 9, negrita = false, color = COLOR.texto, ancho, alinear = 'left', espaciado = 0, unaLinea = false } = {}) {
    this.doc.font(negrita ? NEGRITA : NORMAL).fontSize(tam).fillColor(color)
      .text(String(str ?? ''), x, y, unaLinea
        ? { width: ancho, align: alinear, characterSpacing: espaciado, height: tam * 1.3, ellipsis: true }
        : { width: ancho, align: alinear, characterSpacing: espaciado });
  }

  altoTexto(str, ancho, { tam = 9, negrita = false, espaciado = 0 } = {}) {
    return this.doc.font(negrita ? NEGRITA : NORMAL).fontSize(tam).heightOfString(String(str ?? ''), { width: ancho, characterSpacing: espaciado });
  }

  /** Alto de la etiqueta en mayúsculas más larga de una fila de columnas (puede ocupar dos líneas). */
  altoEtiquetas(etiquetas, ancho) {
    return Math.max(...etiquetas.map((e) => this.altoTexto(String(e).toUpperCase(), ancho, { tam: 7, negrita: true, espaciado: 0.4 })));
  }

  linea(x1, y1, x2, y2, color = COLOR.borde, grosor = 0.75) {
    this.doc.moveTo(x1, y1).lineTo(x2, y2).lineWidth(grosor).strokeColor(color).stroke();
  }

  encabezado(subtitulo, usuario) {
    const { doc } = this;
    if (fs.existsSync(LOGO)) doc.image(LOGO, this.x, this.y, { width: 30 });
    this.texto('SIGI', this.x + 40, this.y + 3, { tam: 15, negrita: true });
    this.texto('GESTIÓN DE INCAPACIDADES', this.x + 40, this.y + 20, { tam: 6.5, color: COLOR.texto2, espaciado: 0.8 });
    const derecha = [`Generado el ${fmtGenerado.format(new Date())}`, usuario ? `Por ${usuario.nombre} · ${ROLES[usuario.rol] || usuario.rol}` : ''];
    this.texto(derecha.filter(Boolean).join('\n'), this.x, this.y + 6, { tam: 8, color: COLOR.texto2, ancho: this.ancho, alinear: 'right' });
    this.y += 50;
    this.texto(this.titulo, this.x, this.y, { tam: 20, negrita: true });
    this.y += 26;
    if (subtitulo) {
      this.texto(subtitulo, this.x, this.y, { tam: 10, color: COLOR.texto2, ancho: this.ancho });
      this.y += this.altoTexto(subtitulo, this.ancho, { tam: 10 }) + 4;
    }
    this.y += 8;
    this.linea(this.x, this.y, this.x + this.ancho, this.y, COLOR.sello, 1.5);
    this.y += 6;
  }

  // ---------- Bloques ----------

  /** Título de sección, con una línea que explica qué muestra. */
  seccion(titulo, explicacion) {
    this.asegurar(150); // el título nunca queda solo al final de la página
    this.y += 16;
    this.doc.rect(this.x, this.y + 1, 3, 13).fill(COLOR.sello);
    this.texto(titulo, this.x + 10, this.y, { tam: 13, negrita: true });
    this.y += 18;
    if (explicacion) {
      this.texto(explicacion, this.x + 10, this.y, { tam: 9, color: COLOR.texto2, ancho: this.ancho - 10 });
      this.y += this.altoTexto(explicacion, this.ancho - 10, { tam: 9 }) + 2;
    }
    this.y += 8;
  }

  /** Subtítulo pequeño dentro de una sección. */
  subtitulo(titulo, explicacion, x = this.x, ancho = this.ancho) {
    this.texto(titulo, x, this.y, { tam: 10, negrita: true, ancho });
    this.y += 14;
    if (explicacion) {
      this.texto(explicacion, x, this.y, { tam: 8, color: COLOR.texto2, ancho });
      this.y += this.altoTexto(explicacion, ancho, { tam: 8 }) + 2;
    }
    this.y += 6;
  }

  nota(str) {
    const alto = this.altoTexto(str, this.ancho, { tam: 8 });
    this.asegurar(alto + 8);
    this.texto(str, this.x, this.y, { tam: 8, color: COLOR.texto3, ancho: this.ancho });
    this.y += alto + 8;
  }

  /**
   * Cifras en columnas, como los hitos de Monitoreo: etiqueta en mayúsculas, número grande y una nota.
   * @param {Array<[string, string, string?, boolean?]>} items [etiqueta, valor, nota, alerta]
   */
  cifras(items) {
    const cols = items.length, w = this.ancho / cols, pad = 12;
    const altoNota = Math.max(0, ...items.map(([, , nota]) => (nota ? this.altoTexto(nota, w - pad * 2, { tam: 8 }) : 0)));
    const altoEtiqueta = this.altoEtiquetas(items.map(([e]) => e), w - pad * 2);
    const yValor = 14 + altoEtiqueta + 4, yNota = yValor + 22;
    const alto = yNota + altoNota + 12;
    this.asegurar(alto + 8);
    const y0 = this.y;
    this.doc.roundedRect(this.x, y0, this.ancho, alto, 6).fillAndStroke(COLOR.fondo, COLOR.borde);
    items.forEach(([etiqueta, valor, nota, alerta], i) => {
      const x = this.x + i * w;
      if (i) this.linea(x, y0 + 12, x, y0 + alto - 12);
      this.texto(String(etiqueta).toUpperCase(), x + pad, y0 + 14, { tam: 7, negrita: true, color: COLOR.texto2, ancho: w - pad * 2, espaciado: 0.4 });
      this.texto(valor, x + pad, y0 + yValor, { tam: 16, negrita: true, color: alerta ? COLOR.rojo : COLOR.texto, ancho: w - pad * 2, unaLinea: true });
      if (nota) this.texto(nota, x + pad, y0 + yNota, { tam: 8, color: COLOR.texto2, ancho: w - pad * 2 });
    });
    this.y = y0 + alto + 10;
  }

  /** Pastillas de resumen en una fila (las mismas de la pantalla). */
  pastillas(items) {
    const alto = 18, gap = 6;
    let x = this.x;
    this.asegurar(alto + 10);
    for (const { texto, resaltar } of items) {
      const w = this.doc.font(NORMAL).fontSize(8.5).widthOfString(texto) + 18;
      if (x + w > this.x + this.ancho) { x = this.x; this.y += alto + gap; this.asegurar(alto + 10); }
      this.doc.roundedRect(x, this.y, w, alto, 9).fillAndStroke(resaltar ? COLOR.amarillo : '#FFFFFF', resaltar ? '#EAD57A' : COLOR.borde);
      this.texto(texto, x + 9, this.y + 5, { tam: 8.5, color: resaltar ? COLOR.amarilloTexto : COLOR.texto2, unaLinea: true });
      x += w + gap;
    }
    this.y += alto + 12;
  }

  /** Alto que ocupará una lista de barras (sirve para ponerlas lado a lado). */
  altoBarras(filas) { return Math.max(1, filas.length) * 26; }

  /**
   * Barras horizontales: nombre y cifra arriba, barra redondeada debajo (igual que la pantalla).
   * @param {Array<{ nombre: string, valor: number, detalle?: string }>} filas
   */
  barras(filas, { unidad = '', x = this.x, ancho = this.ancho, mover = true } = {}) {
    const y0 = this.y;
    if (!filas.length || filas.every((f) => !f.valor)) {
      this.texto('Sin datos para el periodo.', x, y0, { tam: 9, color: COLOR.texto3 });
      if (mover) this.y = y0 + 26;
      return 26;
    }
    const tope = Math.max(1, ...filas.map((f) => f.valor));
    filas.forEach((f, i) => {
      const y = y0 + i * 26;
      const medida = Number(f.valor) === 1 ? SINGULAR[unidad] || unidad : unidad;
      const cifra = `${num(f.valor)} ${medida}${f.detalle ? ` · ${f.detalle}` : ''}`.trim();
      const anchoCifra = this.doc.font(NORMAL).fontSize(8.5).widthOfString(cifra) + 4;
      this.texto(f.nombre, x, y, { tam: 9, color: f.valor ? COLOR.texto : COLOR.texto2, ancho: ancho - anchoCifra - 8, unaLinea: true });
      this.texto(cifra, x, y + 0.5, { tam: 8.5, color: f.valor ? COLOR.texto2 : COLOR.texto3, ancho, alinear: 'right', unaLinea: true });
      this.doc.roundedRect(x, y + 13, ancho, 6, 3).fill(f.valor ? COLOR.selloClaro : COLOR.fondo);
      if (f.valor > 0) this.doc.roundedRect(x, y + 13, Math.max(6, (f.valor / tope) * ancho), 6, 3).fill(COLOR.sello);
    });
    const alto = filas.length * 26;
    if (mover) this.y = y0 + alto;
    return alto;
  }

  /** Dos bloques de barras lado a lado, cada uno con su título. */
  barrasEnPar(izquierda, derecha) {
    const gap = 24, w = (this.ancho - gap) / 2;
    const altoTitulo = (b) => 14 + (b.explicacion ? this.altoTexto(b.explicacion, w, { tam: 8 }) + 2 : 0) + 6;
    const alto = Math.max(altoTitulo(izquierda) + this.altoBarras(izquierda.filas), altoTitulo(derecha) + this.altoBarras(derecha.filas));
    this.asegurar(alto + 10);
    const y0 = this.y;
    [[izquierda, this.x], [derecha, this.x + w + gap]].forEach(([b, x]) => {
      this.y = y0;
      this.subtitulo(b.titulo, b.explicacion, x, w);
      this.barras(b.filas, { unidad: b.unidad, x, ancho: w, mover: false });
    });
    this.y = y0 + alto + 14;
  }

  /** Barra dividida en partes (cartera) con su leyenda debajo. */
  barraDividida(partes) {
    const total = partes.reduce((s, p) => s + p.valor, 0);
    this.asegurar(80);
    if (!total) { this.nota('Todavía no hay valores liquidados para cobrar.'); return; }
    const visibles = partes.filter((p) => p.valor > 0), gap = 2;
    const util = this.ancho - gap * (visibles.length - 1);
    let x = this.x;
    for (const p of visibles) {
      const w = Math.max(3, (p.valor / total) * util);
      this.doc.roundedRect(x, this.y, w, 20, 3).fill(p.color);
      if (p.valor / total >= 0.1) this.texto(pct(p.valor, total), x + 6, this.y + 6, { tam: 8, negrita: true, color: p.textoClaro ? COLOR.texto : '#FFFFFF', unaLinea: true });
      x += w + gap;
    }
    this.y += 30;
    const w = this.ancho / partes.length;
    partes.forEach((p, i) => {
      const lx = this.x + i * w;
      this.doc.roundedRect(lx, this.y + 1, 8, 8, 2).fill(p.color);
      this.texto(p.nombre, lx + 13, this.y, { tam: 8, color: COLOR.texto2 });
      this.texto(pesos(p.valor), lx + 13, this.y + 11, { tam: 10.5, negrita: true, color: p.valor ? COLOR.texto : COLOR.texto3 });
      this.texto(pct(p.valor, total), lx + 13, this.y + 25, { tam: 7.5, color: COLOR.texto3 });
    });
    this.y += 44;
  }

  /** Etapas del proceso en columnas: total, parte del total y los estados que tienen casos. */
  etapas(etapas, total) {
    const cols = etapas.length, w = this.ancho / cols, pad = 12;
    const filasMax = Math.max(1, ...etapas.map((e) => e.estados.filter((s) => s.casos > 0).length));
    const altoEtiqueta = this.altoEtiquetas(etapas.map((e, i) => `${i + 1}. ${e.etapa}`), w - pad * 2);
    const yValor = 14 + altoEtiqueta + 4, yPct = yValor + 21, yLista = yPct + 16;
    const alto = yLista + 8 + filasMax * 14 + 10;
    this.asegurar(alto + 8);
    const y0 = this.y;
    this.doc.roundedRect(this.x, y0, this.ancho, alto, 6).fillAndStroke(COLOR.fondo, COLOR.borde);
    etapas.forEach((e, i) => {
      const x = this.x + i * w;
      if (i) this.linea(x, y0 + 12, x, y0 + alto - 12);
      this.texto(`${i + 1}. ${e.etapa}`.toUpperCase(), x + pad, y0 + 14, { tam: 7, negrita: true, color: COLOR.texto2, ancho: w - pad * 2, espaciado: 0.4 });
      this.texto(num(e.casos), x + pad, y0 + yValor, { tam: 16, negrita: true, color: e.casos ? COLOR.texto : COLOR.texto3 });
      this.texto(e.casos ? `${pct(e.casos, total)} de los casos` : 'Sin casos', x + pad, y0 + yPct, { tam: 8, color: COLOR.texto2 });
      const yl = y0 + yLista;
      this.linea(x + pad, yl, x + w - pad, yl);
      e.estados.filter((s) => s.casos > 0).forEach((s, k) => {
        this.texto(estado(s.estado), x + pad, yl + 8 + k * 14, { tam: 8.5, ancho: w - pad * 2 - 24, unaLinea: true });
        this.texto(num(s.casos), x + pad, yl + 8 + k * 14, { tam: 8.5, negrita: true, ancho: w - pad * 2, alinear: 'right' });
      });
    });
    this.y = y0 + alto + 10;
  }

  /** Columnas por mes (una sola serie), con el valor encima de cada columna con datos. */
  columnasMes(filas, campo, unidad) {
    const alto = 120, base = 18;
    this.asegurar(alto + base + 10);
    const y0 = this.y, maxV = Math.max(1, ...filas.map((f) => f[campo]));
    const w = this.ancho / filas.length, barra = Math.min(22, w * 0.55);
    this.linea(this.x, y0 + alto, this.x + this.ancho, y0 + alto, COLOR.bordeFuerte, 1);
    filas.forEach((f, i) => {
      const cx = this.x + i * w + w / 2, v = f[campo];
      if (v > 0) {
        const h = Math.max(3, (v / maxV) * (alto - 16));
        this.doc.roundedRect(cx - barra / 2, y0 + alto - h, barra, h, 3).fill(COLOR.sello);
        this.texto(num(v), cx - 20, y0 + alto - h - 11, { tam: 7.5, negrita: true, ancho: 40, alinear: 'center' });
      }
      this.texto(f.etiqueta, cx - w / 2, y0 + alto + 5, { tam: 7, color: COLOR.texto2, ancho: w, alinear: 'center', unaLinea: true });
    });
    this.y = y0 + alto + base;
    this.texto(`Valores en ${unidad}, según el mes de inicio de cada incapacidad.`, this.x, this.y, { tam: 7.5, color: COLOR.texto3 });
    this.y += 16;
  }

  /**
   * Tabla con encabezado que se repite al cambiar de página.
   * @param {Array<{ titulo: string, ancho: number, alinear?: 'left'|'right'|'center' }>} columnas  ancho = fracción del total
   * @param {Array<Array<string|{ t: string, sub?: string, negrita?: boolean, color?: string }>>} filas
   */
  tabla(columnas, filas, { total, vacio = 'Sin registros para el periodo.' } = {}) {
    const pad = 6;
    const anchos = columnas.map((c) => c.ancho * this.ancho);
    const celda = (v) => (v && typeof v === 'object' ? v : { t: v ?? '—' });
    const altoFila = (fila, negrita) => Math.max(...fila.map((v, i) => {
      const c = celda(v);
      return this.altoTexto(c.t, anchos[i] - pad * 2, { tam: 8.5, negrita: negrita || c.negrita }) + (c.sub ? this.altoTexto(c.sub, anchos[i] - pad * 2, { tam: 7.5 }) + 1 : 0);
    })) + 12;
    const encabezado = () => {
      this.doc.rect(this.x, this.y, this.ancho, 20).fill(COLOR.fondo);
      this.linea(this.x, this.y + 20, this.x + this.ancho, this.y + 20, COLOR.bordeFuerte);
      let x = this.x;
      columnas.forEach((c, i) => {
        this.texto(c.titulo.toUpperCase(), x + pad, this.y + 7, { tam: 6.8, negrita: true, color: COLOR.texto2, ancho: anchos[i] - pad * 2, alinear: c.alinear || 'left', espaciado: 0.3, unaLinea: true });
        x += anchos[i];
      });
      this.y += 20;
    };
    const dibujarFila = (fila, { negrita = false, fondo } = {}) => {
      const alto = altoFila(fila, negrita);
      if (this.asegurar(alto)) encabezado();
      if (fondo) this.doc.rect(this.x, this.y, this.ancho, alto).fill(fondo);
      let x = this.x;
      fila.forEach((v, i) => {
        const c = celda(v), al = columnas[i].alinear || 'left';
        this.texto(c.t, x + pad, this.y + 6, { tam: 8.5, negrita: negrita || c.negrita, color: c.color || COLOR.texto, ancho: anchos[i] - pad * 2, alinear: al });
        if (c.sub) this.texto(c.sub, x + pad, this.y + 6 + this.altoTexto(c.t, anchos[i] - pad * 2, { tam: 8.5, negrita: negrita || c.negrita }) + 1, { tam: 7.5, color: COLOR.texto3, ancho: anchos[i] - pad * 2, alinear: al });
        x += anchos[i];
      });
      this.y += alto;
      this.linea(this.x, this.y, this.x + this.ancho, this.y);
    };
    this.asegurar(20 + 40);
    encabezado();
    if (!filas.length) {
      this.texto(vacio, this.x + pad, this.y + 8, { tam: 8.5, color: COLOR.texto3 });
      this.y += 28;
    }
    filas.forEach((f) => dibujarFila(f));
    if (total) dibujarFila(total, { negrita: true, fondo: COLOR.fondo });
    this.y += 12;
  }

  // ---------- Cierre ----------

  /** Escribe el pie en todas las páginas y devuelve el PDF como Buffer. */
  async terminar() {
    const { doc } = this;
    const { start, count } = doc.bufferedPageRange();
    for (let i = start; i < start + count; i++) {
      doc.switchToPage(i);
      const margen = doc.page.margins.bottom;
      doc.page.margins.bottom = 0; // escribir en el margen sin que pdfkit cree otra página
      const y = doc.page.height - 44;
      this.linea(this.x, y, this.x + this.ancho, y);
      this.texto(`SIGI · ${this.titulo}`, this.x, y + 7, { tam: 7.5, color: COLOR.texto2, unaLinea: true });
      this.texto(`Página ${i - start + 1} de ${count}`, this.x, y + 7, { tam: 7.5, color: COLOR.texto2, ancho: this.ancho, alinear: 'right' });
      this.texto('Contiene datos personales y de salud: compártalo solo con quien lo necesite (Ley 1581 de 2012).', this.x, y + 19, { tam: 6.8, color: COLOR.texto3, unaLinea: true });
      doc.page.margins.bottom = margen;
    }
    return new Promise((resolve, reject) => {
      const partes = [];
      doc.on('data', (p) => partes.push(p));
      doc.on('end', () => resolve(Buffer.concat(partes)));
      doc.on('error', reject);
      doc.end();
    });
  }
}
