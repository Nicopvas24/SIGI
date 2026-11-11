import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/archivo/wdth.css';
import App from './App.jsx';
import { DialogoProvider } from './ui.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <DialogoProvider>
        <App />
      </DialogoProvider>
    </BrowserRouter>
  </React.StrictMode>
);
