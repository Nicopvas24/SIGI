// Vista Administración de usuarios (solo ADMIN): crear, editar, activar/desactivar y eliminar
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Plus, Search, Trash2, UserCog, X } from 'lucide-react';
import { api, sesion } from '../api.js';
import { Aviso, Encabezado, InputDinero, Panel, ROLES, Vacio, useDialogo } from '../ui.jsx';

const PUEDE_SER_COLABORADOR = ['COLABORADOR', 'LIDER'];
const VACIO = {
  nombre: '', documento: '', correo: '', rol: 'COLABORADOR', password: '', activo: true,
  esColaborador: true, cargo: '', area: '', ibc: '', entidad_eps_id: '', entidad_arl_id: '', lider_id: '',
};
const sinTildes = (t = '') => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function aFormulario(u) {
  const c = u.colaborador;
  return {
    nombre: u.nombre, documento: u.documento, correo: u.correo, rol: u.rol, password: '', activo: u.activo !== false,
    esColaborador: Boolean(c), cargo: c?.cargo || '', area: c?.area || '', ibc: c?.ibc ?? '',
    entidad_eps_id: c?.entidad_eps_id ?? '', entidad_arl_id: c?.entidad_arl_id ?? '', lider_id: c?.lider_id ?? '',
  };
}

export default function Usuarios() {
  const yo = sesion()?.usuario;
  const dlg = useDialogo();
  const [usuarios, setUsuarios] = useState(null);
  const [entidades, setEntidades] = useState([]);
  const [msj, setMsj] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroRol, setFiltroRol] = useState('');
  const [editando, setEditando] = useState(null); // null = cerrado · 'nuevo' · id del usuario
  const [form, setForm] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);
  const primerCampo = useRef(null);

  const cargar = () => api('/admin/usuarios').then(setUsuarios).catch((e) => { setUsuarios([]); setMsj({ t: 'error', m: e.message }); });
  useEffect(() => { cargar(); api('/entidades').then(setEntidades).catch(() => {}); }, []);
  useEffect(() => { if (editando) primerCampo.current?.focus(); }, [editando]);

  const lideres = useMemo(() => (usuarios || []).filter((u) => u.rol === 'LIDER' && u.activo !== false), [usuarios]);
  const eps = entidades.filter((e) => e.tipo === 'EPS');
  const arl = entidades.filter((e) => e.tipo === 'ARL');
  // "EPS Sanitas" pero "SURA EPS" (sin repetir la sigla cuando el nombre ya la trae)
  const entidadCon = (sigla, id) => {
    const n = entidades.find((e) => e.id === id)?.nombre;
    if (!n) return `${sigla} —`;
    return n.toUpperCase().includes(sigla) ? n : `${sigla} ${n}`;
  };

  const visibles = useMemo(() => {
    const q = sinTildes(busqueda).trim();
    return (usuarios || []).filter((u) =>
      (!filtroRol || u.rol === filtroRol) &&
      (!q || sinTildes(`${u.nombre} ${u.correo} ${u.documento}`).includes(q)));
  }, [usuarios, busqueda, filtroRol]);

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => {
      const n = { ...f, [k]: v };
      // Al crear, el rol propone si lleva datos laborales (se puede cambiar)
      if (k === 'rol' && editando === 'nuevo') n.esColaborador = PUEDE_SER_COLABORADOR.includes(v);
      return n;
    });
  };

  function abrir(u) {
    setMsj(null);
    setEditando(u ? u.id : 'nuevo');
    setForm(u ? aFormulario(u) : VACIO);
  }

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    setMsj(null);
    const cuerpo = {
      nombre: form.nombre, documento: form.documento, correo: form.correo, rol: form.rol, activo: form.activo,
      colaborador: form.esColaborador
        ? { cargo: form.cargo, area: form.area, ibc: form.ibc, entidad_eps_id: form.entidad_eps_id, entidad_arl_id: form.entidad_arl_id, lider_id: form.lider_id }
        : null,
    };
    if (form.password) cuerpo.password = form.password;
    try {
      const r = editando === 'nuevo'
        ? await api('/admin/usuarios', { method: 'POST', body: cuerpo })
        : await api(`/admin/usuarios/${editando}`, { method: 'PUT', body: cuerpo });
      setMsj({ t: 'ok', m: r.mensaje });
      setEditando(null);
      cargar();
    } catch (err) {
      setMsj({ t: 'error', m: err.message });
    } finally {
      setGuardando(false);
    }
  }

  async function alternarActivo(u) {
    const activar = u.activo === false;
    if (!activar && !(await dlg.confirmar(`Desactivar a ${u.nombre}`,
      'No podrá ingresar a SIGI. Su historial y sus casos se conservan, y puede reactivarse en cualquier momento.',
      { textoAceptar: 'Desactivar', peligro: true }))) return;
    try {
      await api(`/admin/usuarios/${u.id}`, { method: 'PUT', body: { activo: activar } });
      setMsj({ t: 'ok', m: `${u.nombre} quedó ${activar ? 'activo' : 'inactivo'}.` });
      cargar();
    } catch (err) { setMsj({ t: 'error', m: err.message }); }
  }

  async function eliminar(u) {
    if (!(await dlg.confirmar(`Eliminar a ${u.nombre}`,
      'Se borra su cuenta de acceso y sus datos. Solo es posible si no tiene casos ni registros asociados; si los tiene, desactívelo.',
      { textoAceptar: 'Eliminar', peligro: true }))) return;
    try {
      const r = await api(`/admin/usuarios/${u.id}`, { method: 'DELETE' });
      setMsj({ t: 'ok', m: r.mensaje });
      if (editando === u.id) setEditando(null);
      cargar();
    } catch (err) { setMsj({ t: 'error', m: err.message }); }
  }

  const esNuevo = editando === 'nuevo';
  const esYo = editando === yo?.id;

  return (
    <div>
      <Encabezado titulo="Usuarios" descripcion="Cuentas de acceso a SIGI y rol de cada persona.">
        {!editando && <button onClick={() => abrir(null)}><Plus size={16} aria-hidden="true" />Nuevo usuario</button>}
      </Encabezado>
      <Aviso msj={msj} onCerrar={() => setMsj(null)} />

      {editando && (
        <Panel
          titulo={esNuevo ? 'Nuevo usuario' : `Editar a ${form.nombre}`}
          sub={esNuevo ? 'Podrá ingresar con su correo y la contraseña inicial.' : 'Deje la contraseña vacía para no cambiarla.'}
          extra={<button className="fantasma" onClick={() => setEditando(null)} aria-label="Cerrar formulario"><X size={16} /></button>}
        >
          <form onSubmit={guardar} className="form-grid">
            <div className="campo">
              <label htmlFor="u-nombre">Nombre completo</label>
              <input id="u-nombre" ref={primerCampo} value={form.nombre} onChange={set('nombre')} required autoComplete="off" />
            </div>
            <div className="campo">
              <label htmlFor="u-doc">Documento (C.C.)</label>
              <input id="u-doc" value={form.documento} onChange={set('documento')} required inputMode="numeric" pattern="\d{4,15}"
                title="Solo números, de 4 a 15 dígitos" autoComplete="off" />
            </div>
            <div className="campo">
              <label htmlFor="u-correo">Correo</label>
              <input id="u-correo" type="email" value={form.correo} onChange={set('correo')} required autoComplete="off" />
            </div>
            <div className="campo">
              <label htmlFor="u-rol">Rol</label>
              <select id="u-rol" value={form.rol} onChange={set('rol')} disabled={esYo}>
                {Object.entries(ROLES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
              {esYo && <span className="ayuda">No puede cambiar su propio rol.</span>}
            </div>
            <div className="campo">
              <label htmlFor="u-clave">{esNuevo ? 'Contraseña inicial' : 'Nueva contraseña'}</label>
              <input id="u-clave" type="text" value={form.password} onChange={set('password')} required={esNuevo} minLength={8}
                autoComplete="new-password" placeholder={esNuevo ? 'Mínimo 8 caracteres' : 'Sin cambios'} />
            </div>
            <div className="campo" style={{ justifyContent: 'flex-end' }}>
              <label className="opcion-check">
                <input type="checkbox" checked={form.activo} onChange={set('activo')} disabled={esYo} />Puede ingresar (activo)
              </label>
            </div>

            <div className="campo ancho">
              <label className="opcion-check" style={{ width: 'fit-content' }}>
                <input type="checkbox" checked={form.esColaborador} onChange={set('esColaborador')} />
                Es colaborador de la empresa (puede tener incapacidades)
              </label>
            </div>
            {form.esColaborador && <>
              <div className="campo">
                <label htmlFor="u-cargo">Cargo</label>
                <input id="u-cargo" value={form.cargo} onChange={set('cargo')} />
              </div>
              <div className="campo">
                <label htmlFor="u-area">Área</label>
                <input id="u-area" value={form.area} onChange={set('area')} />
              </div>
              <div className="campo">
                <label htmlFor="u-ibc">IBC (ingreso base de cotización) mensual</label>
                <InputDinero id="u-ibc" min={0} value={form.ibc} onChange={(v) => setForm((f) => ({ ...f, ibc: v }))} />
                <span className="ayuda">Salario mensual sobre el que cotiza a salud y pensión. Se usa para liquidar sus incapacidades (IBC ÷ 30 = valor de un día).</span>
              </div>
              <div className="campo">
                <label htmlFor="u-eps">EPS</label>
                <select id="u-eps" value={form.entidad_eps_id} onChange={set('entidad_eps_id')}>
                  <option value="">Sin asignar</option>
                  {eps.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="u-arl">ARL</label>
                <select id="u-arl" value={form.entidad_arl_id} onChange={set('entidad_arl_id')}>
                  <option value="">Sin asignar</option>
                  {arl.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="u-lider">Líder</label>
                <select id="u-lider" value={form.lider_id} onChange={set('lider_id')}>
                  <option value="">Sin líder</option>
                  {lideres.filter((l) => l.id !== editando).map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
              </div>
            </>}

            <div className="form-acciones ancho">
              <button type="button" className="secundario" onClick={() => setEditando(null)}>Cancelar</button>
              <button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : esNuevo ? 'Crear usuario' : 'Guardar cambios'}</button>
            </div>
          </form>
        </Panel>
      )}

      <Panel
        titulo="Usuarios de la plataforma"
        sub={usuarios ? `${visibles.length} de ${usuarios.length} usuario(s)` : 'Cargando…'}
        extra={
          <div className="en-linea">
            <div className="buscador-campo" style={{ width: 260 }}>
              <Search size={16} aria-hidden="true" className="buscador-lupa" />
              <input aria-label="Buscar usuario" placeholder="Nombre, correo o documento" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </div>
            <select aria-label="Filtrar por rol" style={{ width: 190 }} value={filtroRol} onChange={(e) => setFiltroRol(e.target.value)}>
              <option value="">Todos los roles</option>
              {Object.entries(ROLES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </div>
        }
        cuerpo={false}
      >
        {visibles.length ? (
          <div className="tabla-wrap">
            <table>
              <thead><tr><th>Usuario</th><th>Rol</th><th>Datos laborales</th><th>Estado</th><th className="th-acciones">Acciones</th></tr></thead>
              <tbody>
                {visibles.map((u) => (
                  <tr key={u.id} className={editando === u.id ? 'fila-editando' : ''}>
                    <td>
                      <b>{u.nombre}</b>{u.id === yo?.id && <span className="texto-tenue"> (usted)</span>}
                      <span className="secundario-texto">{u.correo}, C.C. {u.documento}</span>
                    </td>
                    <td>{ROLES[u.rol] || u.rol}</td>
                    <td>
                      {u.colaborador
                        ? <>{[u.colaborador.cargo, u.colaborador.area].filter(Boolean).join(' · ') || 'Sin cargo'}
                            <span className="secundario-texto">{entidadCon('EPS', u.colaborador.entidad_eps_id)} · {entidadCon('ARL', u.colaborador.entidad_arl_id)}</span></>
                        : <span className="texto-tenue">No es colaborador</span>}
                    </td>
                    <td>
                      <span className={`sello ${u.activo === false ? 'neutro' : 'cerrado'}`}>{u.activo === false ? 'Inactivo' : 'Activo'}</span>
                      {!u.auth_id && <span className="secundario-texto texto-alerta">Sin cuenta de acceso</span>}
                    </td>
                    <td>
                      <div className="acciones">
                        <button className="fantasma" onClick={() => abrir(u)}><Pencil size={14} aria-hidden="true" />Editar</button>
                        {u.id !== yo?.id && <>
                          <button className="secundario" onClick={() => alternarActivo(u)}>{u.activo === false ? 'Activar' : 'Desactivar'}</button>
                          <button className="peligro" onClick={() => eliminar(u)} aria-label={`Eliminar a ${u.nombre}`}><Trash2 size={14} aria-hidden="true" /></button>
                        </>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : usuarios && (
          <Vacio icono={UserCog} titulo={usuarios.length ? 'Ningún usuario coincide' : 'Aún no hay usuarios'}>
            {usuarios.length ? 'Revise lo escrito o quite el filtro de rol.' : 'Cree el primero con el botón "Nuevo usuario".'}
          </Vacio>
        )}
      </Panel>
    </div>
  );
}
