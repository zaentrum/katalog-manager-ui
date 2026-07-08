import { Tabs, Heading } from '@nalet/design-system';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import './katalog.css';

// Two separate apps share this shell, selected by the mount path (BASE):
//   • Catalog (browse): the item list + item detail — no section tabs.
//   • Catalog Management: operations — scan + settings tabs.
const MANAGE_SECTIONS = [
  { value: 'scan', label: 'scan', path: '/scan' },
  { value: 'settings', label: 'settings', path: '/settings' },
];

function manageSectionFor(pathname: string): string {
  if (pathname.startsWith('/settings')) return 'settings';
  return 'scan';
}

export function KatalogLayout({ mode }: { mode: 'catalog' | 'manage' }) {
  const nav = useNavigate();
  const loc = useLocation();
  const manage = mode === 'manage';
  const active = manageSectionFor(loc.pathname);

  return (
    <div className="kat">
      <div className="kat__head">
        <Heading level={1} chevron>
          {manage ? 'catalog management' : 'katalog'}
        </Heading>
        <span className="kat__sub">
          {manage ? 'scan & settings' : 'browse the catalog'}
        </span>
      </div>
      {manage && (
        <Tabs
          items={MANAGE_SECTIONS.map((s) => ({ value: s.value, label: s.label }))}
          value={active}
          onChange={(v) => {
            const s = MANAGE_SECTIONS.find((x) => x.value === v);
            if (s) nav(s.path);
          }}
        />
      )}
      <div className="kat__body">
        <Outlet />
      </div>
    </div>
  );
}
