import { useEffect } from 'react';
import { useAuth } from 'react-oidc-context';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Badge, Button, Heading, Text } from '@nalet/design-system';
import { LogOut } from 'lucide-react';
import { ADMIN_ROLE, isAdmin } from './auth/admin';
import { ZaentrumLockup } from './glyphs';
import { KatalogLayout } from './katalog/KatalogLayout';
import { CatalogList } from './katalog/CatalogList';
import { ItemDetail } from './katalog/ItemDetail';
import { PersonDetail } from './katalog/PersonDetail';
import { ScanView } from './katalog/ScanView';
import { ActivityView } from './katalog/ActivityView';
import { SettingsView } from './katalog/SettingsView';
import { BASE_NOSLASH } from './lib/basepath';
import { Splash } from './Splash';
import './shell.css';

// This one image is deployed twice — mounted at /katalog (Catalog: browse) and
// /katalog-manage (Catalog Management: scan + settings). The mount path selects
// which app renders: two genuine apps from one build.
const MODE: 'catalog' | 'manage' = BASE_NOSLASH.toLowerCase().includes('manage')
  ? 'manage'
  : 'catalog';

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
  // The console is for administrators; anyone else gets a page that says so
  // instead of the app. katalog-manager refuses them every operation anyway.
  const admin = isAdmin(auth.user?.access_token);

  return (
    <div className="sh">
      <header className="sh__bar">
        <a className="sh__brand" href="/portal/" aria-label="zaentrum launchpad">
          <ZaentrumLockup height={24} />
          <span className="sh__crumb">/ {MODE === 'manage' ? 'catalog management' : 'katalog'}</span>
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
        {admin ? <Console /> : <ForAdministrators name={name} />}
      </main>
    </div>
  );
}

// ForAdministrators stands in for the console when the signed-in user's token
// does not carry the admin role.
function ForAdministrators({ name }: { name: string }) {
  return (
    <div className="sh__denied">
      <Heading level={1} chevron>
        This console is for administrators
      </Heading>
      <Text variant="muted">
        {name === 'you' ? 'You are signed in' : `Signed in as ${name},`} without the {ADMIN_ROLE} role.
      </Text>
      <a className="sh__denied-link" href="/portal/">
        back to the launchpad
      </a>
    </div>
  );
}

// Console is the app: the catalog (browse) or catalog management, by MODE.
function Console() {
  return (
    <Routes>
      <Route element={<KatalogLayout mode={MODE} />}>
        {MODE === 'manage' ? (
          <>
            <Route index element={<ScanView />} />
            <Route path="scan" element={<ScanView />} />
            <Route path="activity" element={<ActivityView />} />
            <Route path="settings" element={<SettingsView />} />
          </>
        ) : (
          <>
            <Route index element={<CatalogList />} />
            <Route path="item/:id" element={<ItemDetail />} />
            <Route path="person/:id" element={<PersonDetail />} />
          </>
        )}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
