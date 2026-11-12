// Buscador de colaborador (patrón combobox de ARIA 1.2).
// Teclado: escribir filtra, flechas arriba/abajo recorren, Inicio/Fin van al primero o al último,
// Enter selecciona, Esc cierra la lista o limpia la selección y Tab sale del campo.
import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Building2, CircleAlert, Search, ShieldCheck, X } from 'lucide-react';
import { Estado } from '../ui.jsx';

const MAX_RESULTADOS = 50;
const sinTildes = (t = '') => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const digitos = (t = '') => String(t).replace(/\D/g, '');

/** Resalta las palabras buscadas dentro del nombre sin perder tildes ni mayúsculas. */
function Resaltado({ texto = '', palabras }) {
  if (!palabras.length) return texto;
  // Versión normalizada con la misma longitud que el original, carácter por carácter
  const plano = [...texto].map((ch) => sinTildes(ch)[0] ?? ch).join('');
  const marcas = new Array(texto.length).fill(false);
  for (const p of palabras) {
    let i = plano.indexOf(p);
    while (p && i !== -1) { marcas.fill(true, i, i + p.length); i = plano.indexOf(p, i + p.length); }
  }
  const trozos = [];
  let inicio = 0;
  for (let i = 1; i <= texto.length; i++) {
    if (i === texto.length || marcas[i] !== marcas[inicio]) {
      const t = texto.slice(inicio, i);
      trozos.push(marcas[inicio] ? <mark key={inicio}>{t}</mark> : t);
      inicio = i;
    }
  }
  return trozos;
}

const BuscadorColaborador = forwardRef(function BuscadorColaborador(
  { id, colaboradores, valor, onCambiar, casosAbiertos = {}, invalido = false, requerido = false, onInvalido }, ref
) {
  const base = useId();
  const inputRef = useRef(null);
  useImperativeHandle(ref, () => inputRef.current);

  // Participa en la validación nativa del formulario: sin selección, el envío se detiene aquí primero
  useEffect(() => {
    inputRef.current?.setCustomValidity(requerido && !valor ? 'Busque y seleccione el colaborador de la lista.' : '');
  }, [requerido, valor]);
  const listaId = `${base}-lista`;
  const opcionId = (i) => `${base}-op-${i}`;

  const elegido = colaboradores.find((c) => c.id === valor) || null;
  const [texto, setTexto] = useState(elegido?.usuario?.nombre || '');
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);

  // Si la selección cambia desde fuera (p. ej. la IA leyó el certificado), se refleja en el campo
  useEffect(() => { setTexto(elegido?.usuario?.nombre || ''); }, [elegido?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const consulta = elegido && texto === elegido.usuario?.nombre ? '' : texto;
  const palabras = useMemo(() => sinTildes(consulta).trim().split(/\s+/).filter(Boolean), [consulta]);
  const numero = digitos(consulta);

  const resultados = useMemo(() => {
    if (!palabras.length) return colaboradores.slice(0, MAX_RESULTADOS);
    return colaboradores.filter((c) => {
      if (numero.length >= 3 && digitos(c.usuario?.documento).includes(numero)) return true;
      const pajar = sinTildes(`${c.usuario?.nombre} ${c.cargo || ''} ${c.area || ''}`);
      return palabras.every((p) => pajar.includes(p));
    }).slice(0, MAX_RESULTADOS);
  }, [colaboradores, palabras, numero]);

  useEffect(() => { setActivo(0); }, [consulta]);
  useEffect(() => {
    if (abierto) document.getElementById(opcionId(activo))?.scrollIntoView({ block: 'nearest' });
  }, [activo, abierto]); // eslint-disable-line react-hooks/exhaustive-deps

  function elegir(c) {
    onCambiar(c.id);
    setTexto(c.usuario?.nombre || '');
    setAbierto(false);
  }

  function limpiar() {
    onCambiar('');
    setTexto('');
    setAbierto(true);
  }

  function alEscribir(e) {
    setTexto(e.target.value);
    setAbierto(true);
    if (elegido) onCambiar(''); // editar el texto deshace la selección
  }

  function alTeclear(e) {
    const ultimo = resultados.length - 1;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!abierto) { setAbierto(true); return; }
        setActivo((a) => Math.min(a + 1, ultimo));
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!abierto) { setAbierto(true); setActivo(ultimo); return; }
        setActivo((a) => Math.max(a - 1, 0));
        break;
      case 'Home':
      case 'End':
        if (!abierto) return; // sin lista, mueven el cursor del texto como siempre
        e.preventDefault();
        setActivo(e.key === 'Home' ? 0 : ultimo);
        break;
      case 'Enter':
        if (abierto && resultados[activo]) { e.preventDefault(); elegir(resultados[activo]); }
        break;
      case 'Escape':
        if (abierto) { e.preventDefault(); setAbierto(false); }
        else if (texto) { e.preventDefault(); limpiar(); setAbierto(false); }
        break;
      case 'Tab':
        setAbierto(false);
        break;
      default:
    }
  }

  const abiertos = elegido ? casosAbiertos[elegido.id] || [] : [];
  const mostrarLista = abierto && colaboradores.length > 0;

  return (
    <div className="buscador">
      <div className={`buscador-campo ${invalido ? 'invalido' : ''}`}>
        <Search size={16} aria-hidden="true" className="buscador-lupa" />
        <input
          ref={inputRef}
          id={id}
          required={requerido}
          onInvalid={onInvalido}
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-expanded={mostrarLista}
          aria-controls={listaId}
          aria-activedescendant={mostrarLista && resultados[activo] ? opcionId(activo) : undefined}
          aria-invalid={invalido || undefined}
          aria-describedby={`${base}-ayuda`}
          placeholder="Escriba el nombre, la cédula, el cargo o el área…"
          value={texto}
          onChange={alEscribir}
          onKeyDown={alTeclear}
          onFocus={() => { if (!elegido) setAbierto(true); }}
          onClick={() => setAbierto(true)}
          onBlur={() => setAbierto(false)}
        />
        {texto && (
          <button type="button" className="buscador-limpiar" onClick={limpiar} aria-label="Limpiar colaborador" tabIndex={-1}>
            <X size={15} />
          </button>
        )}
      </div>
      <span id={`${base}-ayuda`} className="sr-only">
        Use las flechas arriba y abajo para recorrer los resultados, Enter para seleccionar y Escape para cerrar.
      </span>
      <span className="sr-only" role="status" aria-live="polite">
        {mostrarLista ? (resultados.length ? `${resultados.length} colaborador(es) encontrados` : 'Ningún colaborador coincide') : ''}
      </span>

      {mostrarLista && (
        <ul id={listaId} role="listbox" aria-label="Colaboradores" className="buscador-lista">
          {resultados.map((c, i) => {
            const nAbiertos = (casosAbiertos[c.id] || []).length;
            return (
              <li
                key={c.id}
                id={opcionId(i)}
                role="option"
                aria-selected={i === activo}
                className={`buscador-opcion ${i === activo ? 'activa' : ''} ${c.id === valor ? 'elegida' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); elegir(c); }}
                onMouseMove={() => setActivo(i)}
              >
                <span className="buscador-nombre"><Resaltado texto={c.usuario?.nombre} palabras={palabras} /></span>
                <span className="buscador-detalle">
                  C.C. {c.usuario?.documento}{c.cargo && ` · ${c.cargo}`}{c.area && ` · ${c.area}`}{c.eps?.nombre && ` · ${c.eps.nombre}`}
                </span>
                {nAbiertos > 0 && <span className="sello pendiente buscador-aviso">{nAbiertos === 1 ? 'Caso abierto' : `${nAbiertos} casos abiertos`}</span>}
              </li>
            );
          })}
          {!resultados.length && (
            <li className="buscador-vacio" aria-hidden="true">Ningún colaborador coincide con "{consulta}".</li>
          )}
          {resultados.length === MAX_RESULTADOS && (
            <li className="buscador-vacio" aria-hidden="true">Se muestran los primeros {MAX_RESULTADOS}. Escriba más para afinar.</li>
          )}
        </ul>
      )}

      {elegido && (
        <div className="buscador-ficha">
          <span>{[elegido.cargo, elegido.area].filter(Boolean).join(' · ') || 'Sin cargo registrado'}</span>
          <span><Building2 size={14} aria-hidden="true" />EPS <b>{elegido.eps?.nombre || 'sin registrar'}</b></span>
          <span><ShieldCheck size={14} aria-hidden="true" />ARL <b>{elegido.arl?.nombre || 'sin registrar'}</b></span>
          {abiertos.length > 0 && (
            <div className="buscador-abiertos">
              <CircleAlert size={15} aria-hidden="true" />
              <span>
                Ya tiene {abiertos.length === 1 ? 'una incapacidad abierta' : `${abiertos.length} incapacidades abiertas`}:{' '}
                {abiertos.map((a, i) => (
                  <span key={a.id}>{i > 0 && ', '}<b>{a.numero_caso}</b> <Estado valor={a.estado} /></span>
                ))}
                . Si la nueva continúa a esa, el sistema le preguntará si es una prórroga.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default BuscadorColaborador;
