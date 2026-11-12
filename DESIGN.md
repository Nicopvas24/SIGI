# Guía de estilo de la interfaz

Pautas para que las pantallas nuevas de SIGI se vean igual que las existentes. Los valores están
definidos como variables CSS en `app/views/src/styles.css`; en los componentes se usan esas
variables, no colores escritos a mano.

## Colores

| Uso | Variable | Valor |
|---|---|---|
| Barra lateral | `--tinta-900` | `#1E1538` |
| Botones principales, enlaces y foco | `--sello` | `#5537C0` |
| Fondo de la página | `--fondo` | `#F4F3F7` |
| Paneles y tablas | `--superficie` | `#FFFFFF` |
| Bordes | `--borde` | `#E4E1EC` |
| Texto principal | `--texto` | `#1B1729` |
| Texto secundario | `--texto-2` | `#565170` |
| Plazos por vencer | `--resaltador` | `#FFE76A` |
| Errores y vencidos | `--rojo` | `#B42318` |
| Pagado, archivado, correcto | `--verde` | `#16704A` |
| Casos en cobro | `--naranja` | `#9E460B` |

El amarillo se usa solo para marcar plazos que requieren atención. Los estados de un caso siempre
llevan texto, no solo color.

## Tipografía

Una sola fuente, Archivo, instalada con `@fontsource-variable/archivo`. Los encabezados de tabla y
las etiquetas de estado van en mayúsculas y un poco más angostas (`font-stretch: 88%`). Las cifras
usan números tabulares para que las columnas de días y valores queden alineadas.

Tamaños: título de página 24 px, título de panel 15 px, texto 14 px, tablas 13,5 px.

## Componentes

Están en `app/views/src/ui.jsx`:

- `Encabezado`: título de la pantalla y, si hace falta, una línea de instrucción.
- `Panel`: contenedor con cabecera. No se ponen paneles dentro de paneles.
- `Estado`: etiqueta del estado del caso con texto legible ("Docs. incompletos").
- `Aviso`: mensaje de resultado de una acción.
- `Vacio`: mensaje cuando una bandeja no tiene casos.
- `PanelIA`: funciones de IA. Si la IA no está configurada en el `.env`, se muestra como "sin configurar".
- `useDialogo()`: formularios cortos y confirmaciones; reemplazan `prompt()` y `confirm()` del navegador.
- `ReglaDias` y `MiniRegla`: días acumulados de un caso frente a los días 90, 120, 150 y 180.

## Reglas

- Las tablas llevan el encabezado fijo y se desplazan de lado en el celular.
- Las acciones van a la derecha de la fila y la principal queda de última.
- Fechas como "10 nov 2026" y dinero como "$ 2.500.000" (funciones `fecha()` y `dinero()`).
- Iconos de `lucide-react`; no se usan emojis.
- Los códigos de casos de uso (CU-xx) son de la documentación y no se muestran en pantalla.
