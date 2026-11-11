import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, guardarSesion } from '../api.js';

const DEMOS = [
  ['colaborador@sigi.demo', 'Colaborador'], ['lider@sigi.demo', 'Líder'],
  ['recepcion@sigi.demo', 'Recepcionista'], ['auxiliar@sigi.demo', 'Auxiliar Adm. Personal'],
  ['juridica@sigi.demo', 'Área Jurídica'], ['contabilidad@sigi.demo', 'Contabilidad'],
  ['documental@sigi.demo', 'Gestión Documental'], ['admin@sigi.demo', 'Admin'],
];

export default function Login() {
  const nav = useNavigate();
  const [correo, setCorreo] = useState('auxiliar@sigi.demo');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  async function entrar(e) {
    e?.preventDefault();
    setError(null);
    try {
      const r = await api('/auth/login', { method: 'POST', body: { correo, password } });
      guardarSesion(r);
      nav('/');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="login">
      <form className="tarjeta" onSubmit={entrar}>
        <h2>SIGI</h2>
        <p>Sistema Integral de Gestión de Incapacidades</p>
        <label>Correo</label>
        <input value={correo} onChange={(e) => setCorreo(e.target.value)} />
        <label>Contraseña (vacía en modo demo)</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="alerta error">{error}</div>}
        <div style={{ marginTop: 14 }}><button type="submit">Ingresar</button></div>
        <label style={{ marginTop: 16 }}>Usuarios demo</label>
        <select value={correo} onChange={(e) => setCorreo(e.target.value)}>
          {DEMOS.map(([c, n]) => <option key={c} value={c}>{n} · {c}</option>)}
        </select>
      </form>
    </div>
  );
}
