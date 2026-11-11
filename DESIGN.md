---
version: alpha
name: SIGI · Sello y expediente
description: >-
  Sistema visual de SIGI, herramienta interna de Gestión Humana para incapacidades.
  Tinta violeta de sello para la estructura, resaltador amarillo solo para plazos,
  una sola familia tipográfica (Archivo) y la regla de 180 días como rasgo propio.
colors:
  tinta-900: "#1E1538"
  tinta-800: "#2A1F4D"
  tinta-700: "#3A2C69"
  tinta-300: "#B9AEE0"
  tinta-200: "#D3CBEE"
  sello: "#5537C0"
  sello-hover: "#4528A8"
  sello-presionado: "#3A2091"
  sello-claro: "#EEEAFB"
  sello-borde: "#CFC5F2"
  fondo: "#F4F3F7"
  superficie: "#FFFFFF"
  superficie-2: "#FAF9FC"
  borde: "#E4E1EC"
  borde-fuerte: "#CCC7D9"
  texto: "#1B1729"
  texto-2: "#565170"
  texto-3: "#6E6987"
  resaltador: "#FFE76A"
  resaltador-suave: "#FFF6C2"
  resaltador-texto: "#574500"
  rojo: "#B42318"
  rojo-claro: "#FDEDEB"
  verde: "#16704A"
  verde-claro: "#E5F4EC"
  naranja: "#9E460B"
  naranja-claro: "#FCEFE4"
typography:
  titulo-pagina:
    fontFamily: Archivo
    fontSize: 24px
    fontWeight: 680
    lineHeight: 1.2
    letterSpacing: -0.012em
  titulo-panel:
    fontFamily: Archivo
    fontSize: 15px
    fontWeight: 650
    lineHeight: 1.4
  cuerpo:
    fontFamily: Archivo
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: '"tnum" 1'
  tabla:
    fontFamily: Archivo
    fontSize: 13.5px
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: '"tnum" 1'
  etiqueta:
    fontFamily: Archivo
    fontSize: 11.5px
    fontWeight: 620
    lineHeight: 1.3
    letterSpacing: 0.05em
    fontVariation: '"wdth" 88'
  sello:
    fontFamily: Archivo
    fontSize: 11px
    fontWeight: 650
    lineHeight: 1
    letterSpacing: 0.055em
    fontVariation: '"wdth" 90'
  cifra:
    fontFamily: Archivo
    fontSize: 26px
    fontWeight: 720
    lineHeight: 1.15
    letterSpacing: -0.02em
rounded:
  sello: 4px
  control: 6px
  panel: 10px
  dialogo: 12px
spacing:
  xs: 6px
  sm: 10px
  md: 14px
  lg: 18px
  xl: 22px
  pagina-x: 36px
components:
  boton-primario:
    background: "{colors.sello}"
    hover: "{colors.sello-hover}"
    text: "{colors.superficie}"
    radius: "{rounded.control}"
    height: 32px
  boton-secundario:
    background: "{colors.superficie}"
    border: "{colors.borde-fuerte}"
    text: "{colors.texto}"
  boton-peligro:
    background: "{colors.superficie}"
    border: "#F5C4BE"
    text: "{colors.rojo}"
  barra-lateral:
    background: "{colors.tinta-900}"
    text: "{colors.tinta-200}"
    item-activo: "{colors.tinta-700}"
    icono-activo: "{colors.resaltador}"
  sello-estado:
    typography: "{typography.sello}"
    radius: "{rounded.sello}"
  panel:
    background: "{colors.superficie}"
    border: "{colors.borde}"
    radius: "{rounded.panel}"
---

# SIGI · Sello y expediente

## Intención

SIGI es una herramienta de trabajo (modo *Operate*): auxiliares de personal, jurídica y contabilidad
la usan durante toda la jornada, de día, en monitores de oficina. Por eso es clara, densa y predecible.
La navegación, las tablas y los controles son los estándar; la identidad vive en cuatro cosas:
tipografía, paleta, densidad y un rasgo distintivo.

El mundo del que sale es el de la oficina de personal colombiana: el **sello húmedo violeta** de
radicado, el **resaltador amarillo** sobre los plazos y el **conteo legal de días** de una incapacidad.

## Color

- **Tinta de sello** (`tinta-900`) colorea la barra lateral completa: la estructura se reconoce a distancia.
- **Sello** (`sello`) es el único color de acción: botones primarios, foco, selección, enlaces.
- **Resaltador** (`resaltador`) se reserva para plazos que requieren atención (transcripción prioritaria,
  icono del módulo activo, selección de texto). Nunca como decoración.
- Los estados tienen tonos fijos y siempre llevan texto, nunca solo color:
  pendiente → resaltador · en proceso → sello · cobro → naranja · alerta → rojo · cerrado → verde.
- No usar valores hex sueltos en componentes: todo sale de las variables de `app/views/src/styles.css`.

## Tipografía

Una sola familia: **Archivo** (Omnibus-Type), variable, alojada en el proyecto con
`@fontsource-variable/archivo`. Se usa su eje de ancho: etiquetas de tabla y sellos de estado van
condensados (`font-stretch` 88–90 %) y en mayúsculas espaciadas; el logotipo va expandido.
Todas las cifras usan números tabulares para que las columnas de días y valores alineen.

## Rasgo distintivo: la regla de 180 días

Los días acumulados de un caso (sumando prórrogas) se dibujan sobre una regla de 0 a 200 días con
los hitos legales marcados: 90 (reporte), 120 (concepto de rehabilitación), 150 (envío al AFP) y
180 (suspensión de pago por nómina). Aparece completa en Monitoreo (`ReglaDias`), compacta en cada
fila (`MiniRegla`) y como motivo en la pantalla de ingreso. No se reutiliza para otros datos.

## Componentes

Viven en `app/views/src/ui.jsx`:

- `Encabezado`: título, descripción de una línea y referencias a casos de uso (CU-xx) a la derecha. Sin etiquetas encima del título.
- `Panel`: contenedor con cabecera; nunca paneles anidados. Los casos de una bandeja van como filas (`.expedientes`), no como tarjetas sueltas.
- `Estado`: sello de estado del diagrama DE-01 con texto legible ("Docs. incompletos", no `DOCUMENTACION_INCOMPLETA`).
- `Aviso`: resultado de una acción, con icono y botón de cerrar.
- `Vacio`: estado vacío que explica cómo llega un caso a esa bandeja.
- `PanelIA`: funciones de IA; mientras falte `ANTHROPIC_API_KEY` se muestra con borde punteado y "Pendiente de configurar".
- `DialogoProvider` / `useDialogo()`: diálogos nativos (`<dialog>`) que reemplazan `prompt()` y `confirm()`.

## Reglas

- Hacer: tablas con encabezado fijo y scroll horizontal en móvil; acciones alineadas a la derecha, la principal al final.
- Hacer: fechas como "10 nov 2026" y dinero como "$ 2.500.000" (`fecha()`, `dinero()`).
- Hacer: transiciones de 120–220 ms solo para cambios de estado; respetar `prefers-reduced-motion`.
- Evitar: emojis como iconos (usar `lucide-react`), texto gris sobre color, bordes laterales de color, degradados en texto, tarjetas KPI genéricas.
- Evitar: tema oscuro por defecto; la escena de uso es una oficina iluminada.
