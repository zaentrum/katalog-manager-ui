import { Badge, Button, Divider, Heading, Spinner, Text } from '@nalet/design-system';
import { ArrowLeft, Lock } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useArtwork } from '../lib/artwork';
import { useQuery } from '../lib/useQuery';
import { externalIdsText, fromItem, lockSummary, portraitUrl } from './people';
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
// YYYY-MM-DD and shown as stored. The schema gives a Person no credits (no
// field names the titles that credit them), so this page cannot list them:
// each title's cast tab links here instead.
const PERSON_Q = `query Person($id: ID!) {
  person(id: $id) {
    id name sortName alsoKnownAs birthDate deathDate birthPlace
    biography { language text }
    tmdbPersonId imdbId knownForDepartment metadataLocked lockedFields
    tmdbFetchedAt modifiedAt
  }
}`;

export function PersonDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  // The cast tab passes the title it was opened from; a deep link has none.
  const from = fromItem(useLocation().state);
  const { data, loading, error } = useQuery<{ person: Person | null }>(PERSON_Q, { id }, [id]);
  const portrait = useArtwork(id ? portraitUrl(id) : null);

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
      <div className="kat__facet">
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
      </div>
    </div>
  );
}
