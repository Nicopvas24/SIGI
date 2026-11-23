// Explica, tramo por tramo, cuánto paga la entidad y cuánto la empresa en una incapacidad.
// El cálculo lo hace el servidor (GET /incapacidades/:id/liquidacion) para que coincida con lo que se guarda.
import { useEffect, useState } from 'react';
import { Calculator, Info } from 'lucide-react';
import { api } from '../api.js';
import { dinero } from '../ui.jsx';

const NOMBRE_PAGADOR = { EMPRESA: 'La empresa', FONDO_PENSIONES: 'Fondo de pensiones' };
const rangoDias = (t) => (t.desde === t.hasta ? `Día ${t.desde}` : t.hasta === t.desde + 1 ? `Días ${t.desde} y ${t.hasta}` : `Días ${t.desde} a ${t.hasta}`);
const porcentaje = (p) => `${String(p).replace('.', ',')} %`;

/** Qué es el IBC y cómo se usa. Se reutiliza donde se escribe el IBC. */
export function QueEsIBC({ abierto = false }) {
  return (
    <details className="que-es-ibc" open={abierto}>
      <summary><Info size={14} aria-hidden="true" />¿Qué es el IBC y cómo se usa?</summary>
      <p>
        El <b>Ingreso Base de Cotización (IBC)</b> es el valor mensual sobre el que el colaborador cotiza a salud y pensión:
        su salario más los pagos que son salario (horas extra, comisiones, recargos). Nunca es menor a un salario mínimo.
        Se toma del mes anterior al inicio de la incapacidad y se consulta en la planilla PILA o en la nómina.
      </p>
      <p>
        Para liquidar, el IBC se divide en 30 y da el <b>valor de un día</b>. Ese valor se multiplica por los días de cada tramo
        y por el porcentaje que fija la ley: los días 1 y 2 los paga la empresa al 100 %; del día 3 al 90 la EPS paga dos tercios
        (66,67 %); del 91 al 180, el 50 %; desde el día 181 el trámite pasa al fondo de pensiones. Las licencias de maternidad y
        paternidad las paga la EPS al 100 % desde el primer día.
      </p>
    </details>
  );
}

/**
 * @param casoId  caso a liquidar
 * @param ibc     IBC a usar (número). Si se omite, el servidor usa el del formato de seguimiento o el registrado.
 */
export default function ExplicacionLiquidacion({ casoId, ibc }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const sinIbc = ibc !== undefined && (ibc === '' || Number(ibc) <= 0);

  useEffect(() => {
    if (sinIbc) { setDatos(null); return undefined; }
    let vivo = true;
    // Espera a que se deje de escribir para no consultar en cada tecla
    const t = setTimeout(() => {
      api(`/incapacidades/${casoId}/liquidacion${ibc !== undefined ? `?ibc=${Number(ibc)}` : ''}`)
        .then((d) => { if (vivo) { setDatos(d); setError(null); } })
        .catch((e) => { if (vivo) setError(e.message); });
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [casoId, ibc, sinIbc]);

  if (sinIbc) {
    return (
      <div className="liquidacion aviso-ibc">
        <p><b>Escriba el IBC para ver el cálculo.</b> Sin IBC los valores quedan en cero.</p>
        <QueEsIBC abierto />
      </div>
    );
  }
  if (error) return <div className="liquidacion"><p className="texto-alerta">No se pudo calcular: {error}</p></div>;
  if (!datos) return <div className="liquidacion"><p className="texto-tenue">Calculando…</p></div>;

  const entidad = datos.entidad || 'la entidad';
  const licencia = datos.tipo === 'LICENCIA_MATERNIDAD' || datos.tipo === 'LICENCIA_PATERNIDAD';
  return (
    <div className="liquidacion" aria-live="polite">
      <p className="liquidacion-titulo"><Calculator size={16} aria-hidden="true" />Cómo se calcula</p>
      <p className="liquidacion-formula">
        IBC <b>{dinero(datos.ibc)}</b> ÷ 30 días = <b>{dinero(datos.ibcDiario)}</b> por día
        {datos.desde_formato && <span className="texto-tenue"> (IBC del formato de seguimiento)</span>}
      </p>
      {datos.dias_previos > 0 && (
        <p className="liquidacion-nota">
          Es prórroga: el colaborador ya acumulaba {datos.dias_previos} días, así que este caso cuenta del día {datos.dias_previos + 1} al {datos.dias_previos + datos.dias}.
        </p>
      )}
      {licencia && <p className="liquidacion-nota">Las licencias las paga la EPS al 100 % desde el primer día.</p>}

      <table className="liquidacion-tabla">
        <thead><tr><th>Días</th><th className="num">% del día</th><th>Paga</th><th className="num">Valor</th></tr></thead>
        <tbody>
          {datos.tramos.map((t) => (
            <tr key={t.desde} className={t.paga === 'ENTIDAD' ? 'cobra' : ''}>
              <td>{rangoDias(t)} <span className="texto-tenue">({t.dias})</span></td>
              <td className="num">{t.paga === 'FONDO_PENSIONES' ? '—' : porcentaje(t.porcentaje)}</td>
              <td>{NOMBRE_PAGADOR[t.paga] || entidad}</td>
              <td className="num">{t.paga === 'FONDO_PENSIONES' ? 'Trámite aparte' : dinero(t.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="liquidacion-totales">
        <div className="total-entidad"><span>Se le cobra a {entidad}</span><b>{dinero(datos.valorEntidad)}</b></div>
        <div><span>Asume la empresa</span><b>{dinero(datos.valorEmpresa)}</b></div>
      </div>
      {datos.advertencias?.map((a) => <p key={a} className="liquidacion-nota texto-alerta">{a}</p>)}
      <QueEsIBC />
    </div>
  );
}
