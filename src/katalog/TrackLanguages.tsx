import { useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select, Spinner, Table, Text } from '@nalet/design-system';
import type { TableColumn } from '@nalet/design-system';
import { Languages } from 'lucide-react';
import { useQuery } from '../lib/useQuery';
import { useGql } from '../lib/gql';
import {
  ANOTHER_CODE,
  choiceOf,
  languageOptions,
  languageText,
  languageToSet,
  setNotice,
  trackDetails,
  trackName,
  type Track,
} from './tracks';

// The title's tracks, asked apart from the item, so the rest of the item
// page still reads from a katalog-manager older than the tracks: the console
// is released apart from it.
const TRACKS_Q = `query ItemTracks($id: ID!) {
  item(id: $id) {
    tracks { kind ordinal sourceLanguage languageOverride effectiveLanguage title format forced reported }
  }
}`;
const SET_LANGUAGE = `mutation($i:ID!,$k:String!,$o:Int!,$l:String){ setTrackLanguage(itemId:$i, kind:$k, ordinal:$o, language:$l){ id } }`;

// TrackLanguages lists the audio and subtitle tracks of a title's source,
// each with the language its source tags it with, the one an admin set and
// the one it plays as, and sets or clears the one set.
export function TrackLanguages({ itemId }: { itemId: string }) {
  const { data, loading, error, refetch } = useQuery<{ item: { tracks: Track[] } | null }>(TRACKS_Q, { id: itemId }, [itemId]);
  const [editing, setEditing] = useState<Track | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (loading && !data) {
    return (
      <div className="kat__state">
        <Spinner /> <Text variant="muted">loading tracks…</Text>
      </div>
    );
  }
  if (error) return <div className="kat__err">tracks unavailable: {error}</div>;
  const tracks = data?.item?.tracks ?? [];
  const none = <span className="kat__muted">—</span>;
  const cols: TableColumn<Track>[] = [
    { key: 'kind', header: 'track', render: (t) => <span className="kat__mono">{trackName(t)}</span> },
    { key: 'title', header: 'details', render: (t) => trackDetails(t) || none },
    { key: 'sourceLanguage', header: 'source', render: (t) => (t.sourceLanguage ? languageText(t.sourceLanguage) : none) },
    {
      key: 'languageOverride',
      header: 'set',
      render: (t) => (t.languageOverride ? <Badge tone="blue">{languageText(t.languageOverride)}</Badge> : none),
    },
    { key: 'effectiveLanguage', header: 'plays as', render: (t) => languageText(t.effectiveLanguage) },
    {
      key: 'reported',
      header: '',
      align: 'right',
      render: (t) => (
        <Button
          variant="ghost"
          size="sm"
          leading={<Languages size={13} />}
          onClick={() => {
            setMsg(null);
            setEditing(t);
          }}
        >
          Set Language
        </Button>
      ),
    },
  ];

  return (
    <div>
      {msg && <div className="kat__ok kat__mono">{msg}</div>}
      <Table
        columns={cols}
        rows={tracks}
        rowKey={(t) => `${t.kind}/${t.ordinal}`}
        dense
        empty={
          <Text variant="muted">
            no tracks known yet: the title’s next packaging reports them, and backfillSourceTracks reads them from its
            package.
          </Text>
        }
      />
      {editing && (
        <TrackLanguageDialog
          itemId={itemId}
          track={editing}
          onClose={() => setEditing(null)}
          onDone={(text) => {
            setEditing(null);
            setMsg(text);
            refetch();
          }}
        />
      )}
    </div>
  );
}

// TrackLanguageDialog sets a track's language: one of the choices, another
// ISO 639-2 code, or as the source says, which clears the one set. One that
// failed keeps the dialog open, saying why.
function TrackLanguageDialog({
  itemId,
  track,
  onClose,
  onDone,
}: {
  itemId: string;
  track: Track;
  onClose: () => void;
  onDone: (notice: string) => void;
}) {
  const gql = useGql();
  const [choice, setChoice] = useState(() => choiceOf(track));
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const r = languageToSet(choice, typed);
    if ('error' in r) {
      setErr(r.error);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await gql<Record<string, unknown>>(SET_LANGUAGE, { i: itemId, k: track.kind, o: track.ordinal, l: r.language });
      onDone(setNotice(track, r.language));
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
      title={`Language of ${trackName(track)}`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={busy} onClick={() => void submit()}>
            Save
          </Button>
        </>
      }
    >
      <div className="kat__form">
        <Text variant="muted">
          its source tags it {languageText(track.sourceLanguage)}. the language set wins over the tag, and the title’s
          package takes it when the title is packaged again (Re-encode).
        </Text>
        <Field label="language">
          <Select
            value={choice}
            onChange={(e) => {
              setChoice(e.target.value);
              setErr(null);
            }}
            options={languageOptions(track)}
          />
        </Field>
        {choice === ANOTHER_CODE && (
          <Field label="ISO 639-2 code" hint="three letters, such as ger or tlh">
            <Input value={typed} maxLength={3} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
          </Field>
        )}
        {err && <div className="kat__err">{err}</div>}
      </div>
    </Modal>
  );
}
