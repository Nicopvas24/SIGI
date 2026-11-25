// Pruebas unitarias del generador de informes en PDF (InformePdfService)
import test from 'node:test';
import assert from 'node:assert/strict';
import { getDocumentProxy, extractText } from 'unpdf';
import { InformePdf, pesos, pct, plural } from '../../app/services/InformePdfService.js';

test('formato de dinero y porcentajes igual que en la interfaz', () => {
  assert.equal(pesos(12600000), '$ 12.600.000');
  assert.equal(pesos(568888.9), '$ 568.889'); // pesos enteros
  assert.equal(pct(1, 8), '12,5 %');
  assert.equal(pct(5, 0), '0 %');
  assert.equal(plural(1, 'caso', 'casos'), '1 caso');
  assert.equal(plural(3, 'caso', 'casos'), '3 casos');
});

test('arma un PDF con encabezado, tabla que pasa de página y pie numerado', async () => {
  const pdf = new InformePdf({ titulo: 'Informe de prueba', subtitulo: 'Año 2026', usuario: { nombre: 'Andrea Auxiliar', rol: 'AUXILIAR' } });
  pdf.seccion('Resumen', 'Cifras principales.');
  pdf.cifras([['Incapacidades', '8', '5 abiertas'], ['Días de ausencia', '192'], ['Valor solicitado', pesos(14982222)], ['Recuperado', '11,8 %']]);
  pdf.barras([{ nombre: 'Enfermedad general', valor: 27, detalle: '4 casos' }, { nombre: 'Accidente laboral', valor: 0 }], { unidad: 'días' });
  // 80 filas obligan a pasar de página y repetir el encabezado de la tabla
  pdf.tabla([{ titulo: 'Caso', ancho: 0.5 }, { titulo: 'Días', ancho: 0.5, alinear: 'right' }],
    Array.from({ length: 80 }, (_, i) => [`INC-2026-${String(i + 1).padStart(5, '0')}`, String(i + 1)]));
  const buffer = await pdf.terminar();

  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
  const doc = await getDocumentProxy(new Uint8Array(buffer));
  assert.ok(doc.numPages >= 2, `esperaba varias páginas y salieron ${doc.numPages}`);
  const { text } = await extractText(doc, { mergePages: true });
  assert.match(text, /Informe de prueba/);
  assert.match(text, /Andrea Auxiliar · Auxiliar de personal/);
  assert.match(text, /INC-2026-00080/);
  assert.match(text, new RegExp(`Página ${doc.numPages} de ${doc.numPages}`));
  assert.match(text, /Ley 1581 de 2012/);
});
