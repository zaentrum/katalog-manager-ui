import { useState } from 'react';
import { Table, Button, Text, Spinner, Modal, Field, Input, Select, Textarea, Badge } from '@nalet/design-system';
import type { TableColumn } from '@nalet/design-system';
import { Plus, Pencil, Trash2, KeyRound, Eraser } from 'lucide-react';
import { useQuery } from '../lib/useQuery';
import { useGql } from '../lib/gql';
import { fmtTime } from './status';
import { isSecretKey, secretStatus, settingFor, type Setting } from './settings';

const Q = `{ settings { id key valueText valueType description isSecret isSet updatedAt } }`;
const TYPES = ['string', 'list_csv', 'bool', 'int', 'float'];

// A secret setting is write-only: katalog-manager never returns its value, so
// the console shows only whether it is set, and sets or clears it.
const SET_SECRET = `mutation($k:String!,$v:String!){ setSecretSetting(key:$k, value:$v){ id } }`;
const CLEAR_SECRET = `mutation($k:String!){ clearSecretSetting(key:$k) }`;

// Enrichment API keys, editable as first-class settings. Stored in the settings
// table under these keys; the server resolves them per enrichment call, so a save
// takes effect on the next enrichment — no restart. A cleared key falls back
// to the env/build default baked into the image.
const API_KEYS: { key: string; label: string; hint: string }[] = [
  {
    key: 'tmdb.api_key',
    label: 'TMDB api key',
    hint: 'primary metadata + artwork (v4 read access token) — overrides the built-in key',
  },
  {
    key: 'omdb.api_key',
    label: 'OMDb api key',
    hint: 'metadata fallback: plot / rating / poster when TMDB misses (omdbapi.com, free tier 1,000 req/day)',
  },
  {
    key: 'fanart.api_key',
    label: 'fanart.tv project key',
    hint: 'artwork fallback: poster / backdrop TMDB is missing',
  },
  {
    key: 'fanart.client_key',
    label: 'fanart.tv personal key',
    hint: 'optional — returns fresher fanart images',
  },
];

function SecretBadge({ setting }: { setting: Setting | null }) {
  return <Badge tone={setting?.isSet ? 'green' : 'neutral'}>{secretStatus(setting)}</Badge>;
}

export function SettingsView() {
  const gql = useGql();
  const { data, loading, error, refetch } = useQuery<{ settings: Setting[] }>(Q);
  const [editing, setEditing] = useState<Setting | 'new' | null>(null);
  const [settingSecret, setSettingSecret] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function act(done: string, query: string, vars: Record<string, unknown>) {
    setMsg(null);
    setErr(null);
    try {
      await gql(query, vars);
      setMsg(done);
      refetch();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  function remove(s: Setting) {
    if (!confirm(`delete setting "${s.key}"?`)) return;
    void act(`deleted ${s.key}`, `mutation($id:ID!){ deleteSetting(id:$id) }`, { id: s.id });
  }

  function clear(s: Setting) {
    if (!confirm(`clear "${s.key}"? the service falls back to its built-in/env default`)) return;
    void act(`${s.key} cleared`, CLEAR_SECRET, { k: s.key });
  }

  const cols: TableColumn<Setting>[] = [
    { key: 'key', header: 'key', render: (r) => <span className="kat__mono">{r.key}</span> },
    {
      key: 'valueText',
      header: 'value',
      render: (r) =>
        r.isSecret ? <SecretBadge setting={r} /> : <span className="kat__mono">{r.valueText || '—'}</span>,
    },
    { key: 'valueType', header: 'type', render: (r) => <Badge tone="neutral">{r.valueType}</Badge> },
    { key: 'description', header: 'description', render: (r) => r.description || <span className="kat__muted">—</span> },
    {
      key: 'id',
      header: '',
      align: 'right',
      render: (r) =>
        r.isSecret ? (
          <span style={{ display: 'inline-flex', gap: 4 }}>
            <Button variant="ghost" size="sm" leading={<KeyRound size={13} />} onClick={() => setSettingSecret(r.key)}>
              set
            </Button>
            {r.isSet && (
              <Button variant="ghost" size="sm" leading={<Eraser size={13} />} onClick={() => clear(r)}>
                clear
              </Button>
            )}
          </span>
        ) : (
          <span style={{ display: 'inline-flex', gap: 4 }}>
            <Button variant="ghost" size="sm" leading={<Pencil size={13} />} onClick={() => setEditing(r)}>
              edit
            </Button>
            <Button variant="ghost" size="sm" leading={<Trash2 size={13} />} onClick={() => remove(r)}>
              del
            </Button>
          </span>
        ),
    },
  ];

  return (
    <div>
      <ApiKeysPanel settings={data?.settings ?? []} onSaved={refetch} />

      <div className="kat__toolbar">
        <Button leading={<Plus size={15} />} onClick={() => setEditing('new')}>
          new setting
        </Button>
        <Button variant="ghost" size="sm" onClick={refetch}>
          refresh
        </Button>
        {msg && <span className="kat__ok kat__mono">{msg}</span>}
      </div>
      {err && <div className="kat__err">{err}</div>}
      {error && <div className="kat__err">error: {error}</div>}
      {loading && !data ? (
        <div className="kat__state">
          <Spinner /> <Text variant="muted">loading settings…</Text>
        </div>
      ) : (
        <Table
          columns={cols}
          rows={data?.settings ?? []}
          rowKey={(r) => r.id}
          dense
          empty={<Text variant="muted">no settings.</Text>}
        />
      )}

      {editing && (
        <EditSetting
          setting={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={(m) => {
            setMsg(m);
            setErr(null);
            setEditing(null);
            refetch();
          }}
        />
      )}
      {settingSecret && (
        <SetSecret
          settingKey={settingSecret}
          onClose={() => setSettingSecret(null)}
          onDone={(m) => {
            setMsg(m);
            setErr(null);
            setSettingSecret(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

// ApiKeysPanel sets and clears the enrichment provider keys. A key is never
// shown, only whether it is set: setting replaces it, clearing deletes the
// override so the server falls back to its env/build default. Keys are read
// per enrichment call, so changes apply immediately (no restart).
function ApiKeysPanel({ settings, onSaved }: { settings: Setting[]; onSaved: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="kat__panel">
      <div className="kat__panelhead">
        <KeyRound size={15} />
        <Text variant="ui">api keys</Text>
        <Text variant="dim">
          enrichment providers · a saved key overrides the built-in/env default · write-only: never shown again ·
          applied on the next enrichment, no restart
        </Text>
        {msg && <span className="kat__ok kat__mono">{msg}</span>}
      </div>
      {API_KEYS.map((k) => (
        <ApiKeyRow
          key={k.key}
          def={k}
          existing={settingFor(settings, k.key)}
          onDone={(m) => {
            setMsg(m);
            onSaved();
          }}
        />
      ))}
    </div>
  );
}

function ApiKeyRow({
  def,
  existing,
  onDone,
}: {
  def: { key: string; label: string; hint: string };
  existing: Setting | null;
  onDone: (msg: string) => void;
}) {
  const gql = useGql();
  // what the operator types; the stored key is never read back into it
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState<'set' | 'clear' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(what: 'set' | 'clear') {
    setBusy(what);
    setErr(null);
    try {
      if (what === 'set') {
        await gql(SET_SECRET, { k: def.key, v: value.trim() });
        setValue('');
        onDone(`${def.key} set`);
      } else {
        await gql(CLEAR_SECRET, { k: def.key });
        onDone(`${def.key} cleared — using the built-in/env default`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="kat__keyrow">
      <div className="kat__keymeta">
        <span className="kat__mono">{def.label}</span>
        <Text variant="dim">{def.hint}</Text>
      </div>
      <div className="kat__keyedit">
        <Input
          type="password"
          aria-label={`new ${def.label}`}
          placeholder={existing?.isSet ? 'a new key replaces the one set' : 'not set — using the built-in/env default'}
          value={value}
          autoComplete="new-password"
          onChange={(e) => setValue(e.target.value)}
        />
        <Button size="sm" loading={busy === 'set'} disabled={!value.trim()} onClick={() => void run('set')}>
          set
        </Button>
        {existing?.isSet && (
          <Button variant="ghost" size="sm" loading={busy === 'clear'} onClick={() => void run('clear')}>
            clear
          </Button>
        )}
        <SecretBadge setting={existing} />
      </div>
      {existing?.isSet && existing.updatedAt && <Text variant="dim">set {fmtTime(existing.updatedAt)}</Text>}
      {err && <div className="kat__err">{err}</div>}
    </div>
  );
}

// SetSecret sets a secret setting from the table: a value typed in, never one
// read back.
function SetSecret({ settingKey, onClose, onDone }: { settingKey: string; onClose: () => void; onDone: (msg: string) => void }) {
  const gql = useGql();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await gql(SET_SECRET, { k: settingKey, v: value.trim() });
      onDone(`${settingKey} set`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`set ${settingKey}`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            cancel
          </Button>
          <Button size="sm" loading={busy} disabled={!value.trim()} onClick={submit}>
            set
          </Button>
        </>
      }
    >
      <div className="kat__form">
        <Field label="value" hint="write-only: it is never shown again" error={err ?? undefined}>
          <Input type="password" value={value} autoComplete="new-password" onChange={(e) => setValue(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function EditSetting({
  setting,
  onClose,
  onDone,
}: {
  setting: Setting | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const gql = useGql();
  const isNew = setting === null;
  const [key, setKey] = useState(setting?.key ?? '');
  const [valueText, setValueText] = useState(setting?.valueText ?? '');
  const [valueType, setValueType] = useState(setting?.valueType ?? 'string');
  const [description, setDescription] = useState(setting?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // a new key that names a credential goes in write-only, as a secret
  const secret = isNew && isSecretKey(key);

  async function submit() {
    if (isNew && !key.trim()) {
      setErr('key is required');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      if (secret) {
        await gql(SET_SECRET, { k: key.trim(), v: valueText.trim() });
      } else if (isNew) {
        await gql(
          `mutation($k:String!,$v:String!,$t:String,$d:String){ createSetting(key:$k, valueText:$v, valueType:$t, description:$d){ id } }`,
          { k: key, v: valueText, t: valueType, d: description || null },
        );
      } else {
        await gql(
          `mutation($id:ID!,$v:String,$t:String,$d:String){ updateSetting(id:$id, valueText:$v, valueType:$t, description:$d){ id } }`,
          { id: setting.id, v: valueText, t: valueType, d: description || null },
        );
      }
      onDone(secret ? `${key.trim()} set` : isNew ? `created ${key}` : `updated ${setting.key}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'new setting' : `edit ${setting.key}`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            cancel
          </Button>
          <Button size="sm" loading={busy} disabled={secret && !valueText.trim()} onClick={submit}>
            save
          </Button>
        </>
      }
    >
      <div className="kat__form">
        <Field label="key" hint={isNew ? undefined : 'read-only after create'} error={err && isNew ? err : undefined}>
          <Input value={key} disabled={!isNew} onChange={(e) => setKey(e.target.value)} />
        </Field>
        {secret ? (
          <Field label="value" hint="a secret: write-only, it is never shown again">
            <Input
              type="password"
              value={valueText}
              autoComplete="new-password"
              onChange={(e) => setValueText(e.target.value)}
            />
          </Field>
        ) : (
          <>
            <Field label="value">
              <Input value={valueText} onChange={(e) => setValueText(e.target.value)} />
            </Field>
            <Field label="type">
              <Select value={valueType} onChange={(e) => setValueType(e.target.value)} options={TYPES.map((t) => ({ label: t, value: t }))} />
            </Field>
            <Field label="description">
              <Textarea value={description} rows={2} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </>
        )}
        {err && !isNew && <div className="kat__err">{err}</div>}
      </div>
    </Modal>
  );
}
