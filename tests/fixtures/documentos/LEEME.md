# Documentos ficticios para probar SIGI

Todos los archivos tienen marca de agua y pie **"Documento ficticio… sin validez"**. Usan los
colaboradores sembrados en la base (mismo nombre y documento), así la IA puede reconocerlos.
Contraseña de todos los usuarios: `Sigi2026!`. Para regenerarlos: `python tests/fixtures/generar_documentos.py tests/fixtures/documentos`
(requiere `pip install reportlab pillow`).

## Generar documentos para un colaborador específico

```bash
cd tests/fixtures
python generar_documentos.py documentos --documento 1009
python generar_documentos.py documentos --documento 1010 --tipo ACCIDENTE_TRANSITO --inicio 2026-11-20 --dias 12
python generar_documentos.py documentos --documento 1012 --tipo LICENCIA_PATERNIDAD
python generar_documentos.py documentos --documento 1001 --inicio 2026-11-16 --dias 10 --prorroga-de ST-2026-458812 --acumulados 5
python generar_documentos.py documentos --nombre "Ana Pérez" --documento 43123456 --entidad "Nueva EPS" --ibc 1800000
python generar_documentos.py --help
```

Crea la carpeta `<documento>_<tipo>_<fecha>` con los soportes que exige ese tipo de novedad y los PDF de
gestión (transcripción, radicado, solicitud de pago y soporte de liquidación con el valor calculado como en SIGI).
Al terminar imprime los datos que debe escribir en el formulario.
Con el documento de un colaborador de prueba (lista `SEMBRADOS` del generador: Carlos, María, Jorge, Paula,
Santiago, Juan y los seis de `colaboradores_nuevos`) toma el nombre, la EPS y el IBC solos; para otro
colaborador indique `--nombre`, `--entidad` e `--ibc`, y créelo antes en SIGI con el mismo documento y rol Colaborador.
El personal que opera SIGI (recepción, auxiliar, jurídica, contabilidad, gestión documental, líder y administración)
no aparece al reportar una incapacidad, así que no se le generan documentos.
Tipos: `ENFERMEDAD_GENERAL` (por defecto), `ACCIDENTE_LABORAL`, `ACCIDENTE_TRANSITO`, `LICENCIA_MATERNIDAD`, `LICENCIA_PATERNIDAD`.

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

## `presentacion_juan_agudelo` (caso para la presentación)

Colaborador **Juan Agudelo** · `juan.agudelo@sigi.demo` · contraseña `Sigi2026!` · CC 1058078253 · Salud Total · IBC $ 3.200.000.

| Dato del formulario | Valor |
|---|---|
| Tipo | Enfermedad general |
| Entidad | Salud Total |
| Inicio · días | 2026-11-23 · 10 días (fin 2026-12-02) |
| CIE-10 | J06.9 |
| Valor a cargo de Salud Total | $ 568.889 (días 3 a 10 al 66,67 % de $ 106.667 por día) |
| A cargo de la empresa | $ 213.333 (días 1 y 2 al 100 %) |

| Archivo | Dónde se sube |
|---|---|
| `certificado_incapacidad.pdf` | Recepción → "Subir certificado" (la IA llena el formulario) |
| `epicrisis.pdf` | "Adjuntar soportes" en la tarjeta del caso |
| `evidencia_transcripcion.pdf` | Transcripción → Transcribir |
| `evidencia_radicado.pdf` | Transcripción → Radicar |
| `evidencia_solicitud_pago.pdf` | Cobro → Solicitar pago |
| `soporte_liquidacion_pago.pdf` | Cobro → Registrar pago (valor $ 568.889) |

Para regenerarlos con la fecha del día de la presentación (así no salen como entrega extemporánea):

```
python tests/fixtures/generar_documentos.py tests/fixtures/documentos/presentacion_juan_agudelo --nombre "Juan Agudelo" --documento 1058078253 --entidad "Salud Total" --tipo ENFERMEDAD_GENERAL --dias 10 --ibc 3200000
```

## `colaboradores_nuevos` (colaboradores que no operan la plataforma)

Seis colaboradores ficticios del seeder `003_colaboradores_ficticios.sql`. Todos entran con `Sigi2026!` y su líder es Laura.
Cada carpeta trae los soportes que exige su tipo de novedad y los PDF de gestión (transcripción, radicado,
solicitud de pago y soporte de liquidación).

| Carpeta | Colaborador (usuario) | Datos para el formulario | A cargo de la entidad |
|---|---|---|---|
| `1088245671_enfermedad_general_2026-11-23` | Valentina Ospina Marín · `valentina.ospina@sigi.demo` | Enfermedad general · SURA EPS · 2026-11-23 · 4 días · J06.9 | $ 84.444 |
| `1093784512_accidente_laboral_2026-11-21` | Andrés Felipe Restrepo · `andres.restrepo@sigi.demo` | Accidente laboral · ARL SURA · 2026-11-21 · 8 días · S61.0 | $ 320.000 |
| `1087653298_licencia_maternidad_2026-11-20` | Daniela Cardona Loaiza · `daniela.cardona@sigi.demo` | Licencia de maternidad · Sanitas · 2026-11-20 · 126 días · O80 | $ 11.760.000 |
| `1112459870_enfermedad_general_2026-11-16` | Luis Eduardo Montoya · `luis.montoya@sigi.demo` | Enfermedad general · Salud Total · 2026-11-16 · 2 días · A09 (es el caso que queda en "Reportada") | $ 0 (lo asume la empresa) |
| `1094327765_enfermedad_general_2026-11-22` | Natalia Giraldo Toro · `natalia.giraldo@sigi.demo` | Enfermedad general · Famisanar · 2026-11-22 · 15 días · M54.5 | $ 577.778 |
| `1089912346_accidente_transito_2026-11-19` | Camilo Andrés Bedoya · `camilo.bedoya@sigi.demo` | Accidente de tránsito · SOS · 2026-11-19 · 12 días · S82.2 | $ 355.556 |

Para regenerarlas (ejemplo): `python tests/fixtures/generar_documentos.py tests/fixtures/documentos/colaboradores_nuevos --documento 1088245671 --inicio 2026-11-23 --dias 4`
