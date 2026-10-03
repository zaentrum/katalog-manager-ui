import { useState } from 'react';
import { Badge, Button, Divider, Heading, Spinner, Table, Tabs, Text } from '@nalet/design-system';
import type { TableColumn } from '@nalet/design-system';
import { ArrowLeft, Lock } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useArtwork } from '../lib/artwork';
import { useQuery } from '../lib/useQuery';
import {
  creditRow,
  externalIdsText,
  fromItem,
  hasEpisodeCounts,
  lockSummary,
  portraitUrl,
  type CreditRow,
  type PersonCredit,
} from './people';
import { fmtTime } from './status';

interface Person {
  id: string;
  name: string;
  sortName: string | null;
  alsoKnownAs: string[];
  birthDate: string | null;
  deathDate: string | null;
  birthPlace: string | null;
  biography: { language: string; text: string }[];
  tmdbPersonId: string | null;
  imdbId: string | null;
  knownForDepartment: string | null;
  metadataLocked: boolean;
  lockedFields: string[];
  tmdbFetchedAt: string | null;
  modifiedAt: string | null;
}

// A person's record as katalog-manager keeps it, read-only. Dates are
// YYYY-MM-DD and shown as stored.
const PERSON_Q = `query Person($id: ID!) {
  person(id: $id) {
    id name sortName alsoKnownAs birthDate deathDate birthPlace
    biography { language text }
    tmdbPersonId imdbId knownForDepartment metadataLocked lockedFields
    tmdbFetchedAt modifiedAt
  }
}`;

// Their credits: every title that credits them, newest first, as
// katalog-manager orders them. Asked apart from the record, so the record
// still reads from a katalog-manager older than Person.credits: the console
// is released apart from it.
const CREDITS_Q = `query PersonCredits($id: ID!) {
  person(id: $id) {
    credits {
      id role job character episodeCount
      item { id title year seasonNumber episodeNumber parent { id title } }
    }
  }
}`;

export function PersonDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  // The cast tab passes the title it was opened from; a deep link has none.
  const from = fromItem(useLocation().state);
  const { data, loading, error } = useQuery<{ person: Person | null }>(PERSON_Q, { id }, [id]);
  const credits = useQuery<{ person: { credits: PersonCredit[] } | null }>(CREDITS_Q, { id }, [id]);
  const portrait = useArtwork(id ? portraitUrl(id) : null);
  const [tab, setTab] = useState('overview');

  const person = data?.person;
  if (loading && !person) {
    return (
      <div className="kat__state">
        <Spinner /> <Text variant="muted">loading person…</Text>
      </div>
    );
  }
  if (error) return <div className="kat__err">error: {error}</div>;
  if (!person) return <Text variant="muted">person not found.</Text>;

  const none = <span className="kat__muted">—</span>;
  const ids = externalIdsText(person);
  const locked = person.metadataLocked || person.lockedFields.length > 0;

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        leading={<ArrowLeft size={14} />}
        onClick={() => nav(from ? `/item/${from.id}` : '/')}
      >
        {from ? from.title : 'catalog'}
      </Button>

      <div className="kat__obj-head">
        {portrait && (
          <img
            className="kat__obj-poster"
            src={portrait}
            alt={person.name}
            onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
          />
        )}
        <div className="kat__obj-meta">
          <Heading level={1} chevron>
            {person.name}
          </Heading>
          <div className="kat__obj-actions">
            <Badge tone="blue">person</Badge>
            {locked && (
              <Badge tone="amber">
                <Lock size={11} /> {person.metadataLocked ? 'locked' : 'partly locked'}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <Divider />
      <Tabs
        items={[
          { value: 'overview', label: 'overview' },
          { value: 'credits', label: credits.data?.person ? `credits (${credits.data.person.credits.length})` : 'credits' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="kat__facet">
        {tab === 'credits' && (
          <CreditsTab credits={credits.data?.person?.credits ?? null} loading={credits.loading} error={credits.error} />
        )}
        {tab === 'overview' && (
          <dl className="kat__kv">
            <dt>known for</dt>
            <dd>{person.knownForDepartment || none}</dd>
            <dt>born</dt>
            <dd>{person.birthDate || none}</dd>
            <dt>birthplace</dt>
            <dd>{person.birthPlace || none}</dd>
            {person.deathDate && (
              <>
                <dt>died</dt>
                <dd>{person.deathDate}</dd>
              </>
            )}
            <dt>also known as</dt>
            <dd>{person.alsoKnownAs.length ? person.alsoKnownAs.join(', ') : none}</dd>
            <dt>sort name</dt>
            <dd>{person.sortName || none}</dd>
            <dt>biography</dt>
            <dd>
              {person.biography.length ? (
                <div className="kat__bio">
                  {person.biography.map((b) => (
                    <div key={b.language} className="kat__bio-entry">
                      <Badge tone="neutral">{b.language}</Badge>
                      <p className="kat__bio-text">{b.text}</p>
                    </div>
                  ))}
                </div>
              ) : (
                none
              )}
            </dd>
            <dt>external ids</dt>
            <dd className="kat__mono">{ids || none}</dd>
            <dt>locked</dt>
            <dd className="kat__mono">{lockSummary(person.metadataLocked, person.lockedFields)}</dd>
            <dt>read from tmdb</dt>
            <dd>{fmtTime(person.tmdbFetchedAt)}</dd>
            <dt>modified</dt>
            <dd>{fmtTime(person.modifiedAt)}</dd>
          </dl>
        )}
      </div>
    </div>
  );
}

// Each title links to its item; an episode says which series (linked too) and
// where in it. episodes only when a credit counts any, as on a title's cast tab.
function CreditsTab({ credits, loading, error }: { credits: PersonCredit[] | null; loading: boolean; error: string | null }) {
  if (error) return <div className="kat__err">error: {error}</div>;
  if (!credits) {
    return loading ? (
      <div className="kat__state">
        <Spinner /> <Text variant="muted">loading credits…</Text>
      </div>
    ) : (
      <Text variant="muted">no credits.</Text>
    );
  }
  const none = <span className="kat__muted">—</span>;
  const rows = credits.map(creditRow);
  const cols: TableColumn<CreditRow>[] = [
    {
      key: 'title',
      header: 'title',
      render: (r) => (
        <>
          <Link className="kat__rowlink" to={`/item/${r.itemId}`}>
            {r.title}
          </Link>
          {r.series && (
            <span className="kat__muted">
              {' · '}
              <Link className="kat__rowlink" to={`/item/${r.series.id}`}>
                {r.series.title}
              </Link>
              {r.episode && ` ${r.episode}`}
            </span>
          )}
        </>
      ),
    },
    { key: 'year', header: 'year', align: 'right', render: (r) => r.year ?? none },
    { key: 'role', header: 'role', render: (r) => <span className="kat__mono">{r.role}</span> },
    { key: 'job', header: 'job', render: (r) => r.job || none },
    { key: 'character', header: 'character', render: (r) => r.character || none },
  ];
  if (hasEpisodeCounts(rows)) {
    cols.push({ key: 'episodeCount', header: 'episodes', align: 'right', render: (r) => r.episodeCount ?? none });
  }
  return <Table columns={cols} rows={rows} rowKey={(r) => r.id} dense empty={<Text variant="muted">no credits.</Text>} />;
}
