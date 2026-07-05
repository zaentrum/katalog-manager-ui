import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from 'react-oidc-context';
import { BrowserRouter } from 'react-router-dom';
import '@nalet/design-system/styles.css';
import { App } from './App';
import { initAuth } from './auth/oidc';
import { BASE_NOSLASH } from './lib/basepath';

// resolve the issuer from /api/config (self-host discovery) before mounting the
// AuthProvider, then base the router at the runtime mount path (/katalog).
void initAuth().then((oidcConfig) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AuthProvider {...oidcConfig}>
        <BrowserRouter basename={BASE_NOSLASH || undefined}>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </StrictMode>,
  );
});
