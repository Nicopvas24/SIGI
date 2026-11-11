import { Routes, Route, Navigate } from 'react-router-dom';
import { sesion } from './api.js';
import Layout from './layouts/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Recepcion from './pages/Recepcion.jsx';
import Verificacion from './pages/Verificacion.jsx';
import Transcripcion from './pages/Transcripcion.jsx';
import Cobro from './pages/Cobro.jsx';
import Juridico from './pages/Juridico.jsx';
import Conciliacion from './pages/Conciliacion.jsx';
import Archivo from './pages/Archivo.jsx';

function Protegida({ children }) {
  return sesion() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protegida><Layout /></Protegida>}>
        <Route index element={<Dashboard />} />
        <Route path="recepcion" element={<Recepcion />} />
        <Route path="verificacion" element={<Verificacion />} />
        <Route path="transcripcion" element={<Transcripcion />} />
        <Route path="cobro" element={<Cobro />} />
        <Route path="juridico" element={<Juridico />} />
        <Route path="conciliacion" element={<Conciliacion />} />
        <Route path="archivo" element={<Archivo />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
