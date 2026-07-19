import { useEffect, useState } from 'react';
import { Table, Button, Text, Spinner, Modal, Field, Input, Select, Textarea, Badge } from '@nalet/design-system';
import type { TableColumn } from '@nalet/design-system';
import { Plus, Pencil, Trash2, Eye, EyeOff, KeyRound } from 'lucide-react';
import { useQuery } from '../lib/useQuery';
import { useGql } from '../lib/gql';

interface Setting {
  id: string;
  key: string;
  valueText: string;
  valueType: string;
  description: string | null;
}

const Q = `{ settings { id key valueText valueType description } }`;
const TYPES = ['string', 'list_csv', 'bool', 'int', 'float'];

// Enrichment API keys, editable as first-class settings. Stored in the settings
// table under these keys; the server resolves them per enrichment call, so a save
// takes effect on the next enrichment — no restart. An empty override falls back
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

// Credential-shaped settings are masked in the generic table below.
const SECRET_KEY_RE = /(api_key|client_key|password|secret|token)$/i;

export function SettingsView() {
  const gql = useGql();
  const { data, loading, error, refetch } = useQuery<{ settings: Setting[] }>(Q);
  const [editing, setEditing] = useState<Setting | 'new' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function remove(s: Setting) {
    if (!confirm(`delete setting "${s.key}"?`)) return;
    setMsg(null);
    try {
      await gql(`mutation($id:ID!){ deleteSetting(id:$id) }`, { id: s.id });
      setMsg(`deleted ${s.key}`);
      refetch();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  const cols: TableColumn<Setting>[] = [
    { key: 'key', header: 'key', render: (r) => <span className="kat__mono">{r.key}</span> },
    {
      key: 'valueText',
      header: 'value',
      render: (r) => (
        <span className="kat__mono">
          {r.valueText ? (SECRET_KEY_RE.test(r.key) ? '••••••••' : r.valueText) : '—'}
        </span>
      ),
    },
    { key: 'valueType', header: 'type', render: (r) => <Badge tone="neutral">{r.valueType}</Badge> },
    { key: 'description', header: 'description', render: (r) => r.description || <span className="kat__muted">—</span> },
    {
      key: 'id',
      header: '',
      align: 'right',
      render: (r) => (
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
            setEditing(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

// ApiKeysPanel edits the enrichment provider keys as masked inputs. Saving
// upserts the setting; saving an empty value deletes the override so the server
// falls back to its env/build default. Keys are read per enrichment call, so
// changes apply immediately (no restart).
function ApiKeysPanel({ settings, onSaved }: { settings: Setting[]; onSaved: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="kat__panel">
      <div className="kat__panelhead">
        <KeyRound size={15} />
        <Text variant="ui">api keys</Text>
        <Text variant="dim">
          enrichment providers · saved keys override the built-in/env defaults · applied on the next
          enrichment, no restart
        </Text>
        {msg && <span className="kat__ok kat__mono">{msg}</span>}
      </div>
      {API_KEYS.map((k) => (
        <ApiKeyRow
          key={k.key}
          def={k}
          existing={settings.find((s) => s.key === k.key) ?? null}
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
  const [value, setValue] = useState(existing?.valueText ?? '');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Re-seed the input when the refetched settings land (e.g. after save/clear).
  useEffect(() => {
    setValue(existing?.valueText ?? '');
  }, [existing?.id, existing?.valueText]);

  const dirty = value !== (existing?.valueText ?? '');

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const v = value.trim();
      if (v === '' && existing) {
        await gql(`mutation($id:ID!){ deleteSetting(id:$id) }`, { id: existing.id });
        onDone(`${def.key} cleared — using the built-in/env default`);
      } else if (v === '') {
        onDone(`${def.key} unchanged`);
      } else if (existing) {
        await gql(`mutation($id:ID!,$v:String){ updateSetting(id:$id, valueText:$v){ id } }`, {
          id: existing.id,
          v,
        });
        onDone(`${def.key} updated`);
      } else {
        await gql(
          `mutation($k:String!,$v:String!,$t:String,$d:String){ createSetting(key:$k, valueText:$v, valueType:$t, description:$d){ id } }`,
          { k: def.key, v, t: 'string', d: def.hint },
        );
        onDone(`${def.key} set`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
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
          type={show ? 'text' : 'password'}
          placeholder={existing ? undefined : 'not set — using built-in/env default'}
          value={value}
          autoComplete="off"
          onChange={(e) => setValue(e.target.value)}
        />
        <Button variant="ghost" size="sm" onClick={() => setShow((s) => !s)}>
          {show ? <EyeOff size={13} /> : <Eye size={13} />}
        </Button>
        <Button size="sm" loading={busy} disabled={!dirty} onClick={save}>
          save
        </Button>
        {existing ? <Badge tone="green">override</Badge> : <Badge tone="neutral">default</Badge>}
      </div>
      {err && <div className="kat__err">{err}</div>}
    </div>
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

  async function submit() {
    if (isNew && !key.trim()) {
      setErr('key is required');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      if (isNew) {
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
      onDone(isNew ? `created ${key}` : `updated ${setting.key}`);
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
          <Button size="sm" loading={busy} onClick={submit}>
            save
          </Button>
        </>
      }
    >
      <div className="kat__form">
        <Field label="key" hint={isNew ? undefined : 'read-only after create'} error={err && isNew ? err : undefined}>
          <Input value={key} disabled={!isNew} onChange={(e) => setKey(e.target.value)} />
        </Field>
        <Field label="value">
          <Input value={valueText} onChange={(e) => setValueText(e.target.value)} />
        </Field>
        <Field label="type">
          <Select value={valueType} onChange={(e) => setValueType(e.target.value)} options={TYPES.map((t) => ({ label: t, value: t }))} />
        </Field>
        <Field label="description">
          <Textarea value={description} rows={2} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
