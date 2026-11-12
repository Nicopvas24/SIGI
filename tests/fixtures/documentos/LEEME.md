# Documentos ficticios para probar SIGI

Todos los archivos tienen marca de agua y pie **"Documento ficticio… sin validez"**. Usan los
colaboradores sembrados en la base (mismo nombre y documento), así la IA puede reconocerlos.
Contraseña de todos los usuarios: `Sigi2026!`. Para regenerarlos: `python tests/fixtures/generar_documentos.py tests/fixtures/documentos`
(requiere `pip install reportlab pillow`).

| Carpeta | Colaborador (usuario) | Datos para el formulario |
|---|---|---|
| `01_enfermedad_general_carlos` | Carlos Colaborador · `colaborador@sigi.demo` | Enfermedad general · Salud Total · 2026-11-10 · 5 días |
| `02_accidente_transito_jorge` | Jorge Iván Castaño · `jorge.castano@sigi.demo` | Accidente de tránsito · Salud Total · 2026-11-03 · 15 días |
| `03_licencia_maternidad_paula` | Paula Andrea Gómez · `paula.gomez@sigi.demo` | Licencia de maternidad · Sanitas · 2026-11-08 · 126 días |
| `04_licencia_paternidad_santiago` | Santiago Herrera · `santiago.herrera@sigi.demo` | Licencia de paternidad · SOS · 2026-11-06 · 14 días |
| `05_accidente_laboral_maria` | María Fernanda Ríos · `maria.rios@sigi.demo` | Accidente laboral · ARL SURA · 2026-11-09 · 10 días |
| `06_prorroga_carlos` | Carlos Colaborador | Enfermedad general · Salud Total · 2026-11-15 · 10 días (prórroga del 01) |

## Recorrido sugerido

1. **Recepción → "Subir certificado"** con el certificado de la carpeta: la IA debe llenar tipo, fecha,
   días, entidad, CIE-10 y (si entra como auxiliar) el colaborador. Enviar el formulario adjunta el certificado.
2. **"Adjuntar soportes"** en la fila del caso: subir el resto de PDF de la carpeta en su campo
   (epicrisis, FURIPS, nacido vivo, registro civil, documento de identidad).
3. **Registrar recepción** (recepción o auxiliar) → **Verificación**: "Analizar soportes con IA" y luego verificar.
4. **Transcripción y radicación**, **Cobro** y **Archivo**: usar los PDF de `08_evidencias_gestion`.

`06_prorroga_carlos`: al registrarlo el sistema debe preguntar si es prórroga del caso 01
(empieza el día siguiente a su terminación); los días se suman en Monitoreo y Colaboradores.

## `08_evidencias_gestion` (caso de Carlos)

| Archivo | Dónde se sube |
|---|---|
| `constancia_transcripcion_portal.pdf` | Transcripción → Transcribir (constancia) |
| `radicado_sellado.pdf` | Transcripción → Radicar (evidencia obligatoria) |
| `constancia_solicitud_pago.pdf` | Cobro → Solicitar pago (constancia de envío) |
| `acuse_requerimiento_cobro.pdf` | Cobro → Requerimiento |
| `soporte_liquidacion_pago.pdf` | Cobro → Registrar pago (soporte de liquidación: sin él no se puede archivar). Valor: $ 166.667 |

## `07_casos_con_errores` — qué debería pasar

| Archivo | Prueba | Resultado esperado |
|---|---|---|
| `a_certificado_de_otra_persona.pdf` | Adjuntarlo como certificado en un caso de Carlos y analizar con IA | La IA señala que el nombre y el documento no coinciden con el caso |
| `b_certificado_fechas_incoherentes.pdf` | Leer con IA o analizar soportes | Dice 3 días pero del 2 al 9 de noviembre son 8: debe marcarse como dudoso o inconsistente |
| `c_certificado_escaneado_sin_texto.pdf` | "Subir certificado" en Recepción | PDF sin texto: la IA debe leerlo como imagen (María, Nueva EPS, 4 días, K29.7) |
| `d_foto_certificado_celular.jpg` | "Subir certificado" en Recepción | Foto inclinada: debe leer a Jorge, 3 días desde 2026-11-10, H10.9 |
| `e_no_es_certificado_factura.pdf` | "Subir certificado" en Recepción | La IA responde que no es un certificado y no llena el formulario |
| `f_pdf_danado.pdf` | Leer con IA o adjuntar | Mensaje de archivo dañado o ilegible, sin que el sistema falle |
