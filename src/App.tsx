import { useEffect } from 'react';
import { useAuth } from 'react-oidc-context';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Badge, Button } from '@nalet/design-system';
import { LogOut } from 'lucide-react';
import { ZaentrumLockup } from './glyphs';
import { KatalogLayout } from './katalog/KatalogLayout';
import { CatalogList } from './katalog/CatalogList';
import { ItemDetail } from './katalog/ItemDetail';
import { ScanView } from './katalog/ScanView';
import { DownloadsView } from './katalog/DownloadsView';
import { SettingsView } from './katalog/SettingsView';
import { Splash } from './Splash';
import './shell.css';

// The katalog console: a standalone app launched from the zaentrum portal. It
// rides the portal's SSO session (same OIDC client), so it usually loads already
// signed-in; an unauthenticated hit bounces to Keycloak and returns here. Its own
// header brand links back to the launchpad (a full-page nav — separate app).
export function App() {
  const auth = useAuth();

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated && !auth.activeNavigator && !auth.error) {
      void auth.signinRedirect();
    }
  }, [auth.isLoading, auth.isAuthenticated, auth.activeNavigator, auth.error]);

  if (auth.error) return <Splash message={`sign-in failed: ${auth.error.message}`} />;
  if (!auth.isAuthenticated) return <Splash message="signing you in…" />;

  const p = auth.user?.profile;
  const name = (p?.preferred_username as string) || (p?.name as string) || 'you';

  return (
    <div className="sh">
      <header className="sh__bar">
        <a className="sh__brand" href="/portal/" aria-label="zaentrum launchpad">
          <ZaentrumLockup height={24} />
          <span className="sh__crumb">/ katalog</span>
        </a>
        <div className="sh__bar-right">
          <Badge tone="blue" dot>
            {name}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            leading={<LogOut size={15} strokeWidth={1.75} />}
            onClick={() => void auth.signoutRedirect()}
          >
            sign out
          </Button>
        </div>
      </header>
      <main className="sh__main">
        <Routes>
          <Route element={<KatalogLayout />}>
            <Route index element={<CatalogList />} />
            <Route path="item/:id" element={<ItemDetail />} />
            <Route path="scan" element={<ScanView />} />
            <Route path="downloads" element={<DownloadsView />} />
            <Route path="settings" element={<SettingsView />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
