import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, guardarSesion } from '../api.js';
import { Aviso, HITOS } from '../ui.jsx';
import { Marca } from '../layouts/Layout.jsx';

const DEMOS = [
  ['auxiliar@sigi.demo', 'Auxiliar de personal'], ['colaborador@sigi.demo', 'Colaborador'],
  ['lider@sigi.demo', 'Líder de área'], ['recepcion@sigi.demo', 'Recepción'],
  ['juridica@sigi.demo', 'Área jurídica'], ['contabilidad@sigi.demo', 'Contabilidad'],
  ['documental@sigi.demo', 'Gestión documental'], ['admin@sigi.demo', 'Administración'],
];

export default function Login() {
  const nav = useNavigate();
  const [correo, setCorreo] = useState('auxiliar@sigi.demo');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(
    new URLSearchParams(location.search).has('vencida') ? 'Su sesión venció. Ingrese de nuevo.' : null
  );
  const [enviando, setEnviando] = useState(false);

  async function entrar(e) {
    e?.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const r = await api('/auth/login', { method: 'POST', body: { correo, password } });
      guardarSesion(r);
      nav('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="ingreso">
      <section className="ingreso-marca">
        <Marca />
        <div className="ingreso-tesis">
          <h1>Cada incapacidad, del reporte al pago conciliado.</h1>
          <p>Plazos de transcripción por entidad, cobro a EPS y ARL, y el conteo legal de días acumulados en un solo expediente.</p>
        </div>
        <div className="ingreso-regla" aria-hidden="true">
          <div className="pista">
            {HITOS.map((h) => <span key={h.dia} className={`h ${h.critico ? 'critico' : ''}`} style={{ left: `${h.dia / 2}%` }} />)}
          </div>
          <div className="etiquetas">
            {HITOS.map((h) => (
              <span key={h.dia} style={{ left: `${h.dia / 2}%` }}>Día {h.dia}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="ingreso-form">
        <form onSubmit={entrar}>
          <div>
            <h2>Ingresar</h2>
          </div>
          <p className="sub">Use su correo corporativo.</p>
          <div className="campo">
            <label htmlFor="correo">Correo</label>
            <input id="correo" type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
          </div>
          <div className="campo">
            <label htmlFor="clave">Contraseña</label>
            <input id="clave" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <span className="ayuda">Usuarios de demostración: contraseña Sigi2026!</span>
          </div>
          {error && <Aviso msj={{ t: 'error', m: error }} />}
          <button type="submit" className="grande" disabled={enviando}>{enviando ? 'Ingresando…' : 'Ingresar'}</button>

          <div className="separador">Usuarios de demostración</div>
          <div className="demo-roles">
            {DEMOS.map(([c, n]) => (
              <button key={c} type="button" aria-pressed={correo === c} onClick={() => setCorreo(c)} title={c}>{n}</button>
            ))}
          </div>
        </form>
      </section>
    </div>
  );
}
