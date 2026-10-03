// Pure helpers for a title's credits and a person's record: no React, no DOM,
// so `npm test` runs them under node as they are.

/** True when any credit says how many episodes it covers: a series' credits
 *  do, a film's never (katalog-manager leaves episodeCount null). */
export function hasEpisodeCounts(credits: readonly { episodeCount?: number | null }[]): boolean {
  return credits.some((c) => c.episodeCount != null);
}

/** A person's primary portrait. katalog-manager serves it next to a title's
 *  artwork, under /api/manage like the GraphQL endpoint, with the same auth
 *  (a bearer token); 404 when the person has none. */
export function portraitUrl(personId: string): string {
  return `/api/manage/artwork/person/${encodeURIComponent(personId)}/profile`;
}

/** What automation must leave alone on a person's record: metadataLocked
 *  locks every field, lockedFields only the fields it names. */
export function lockSummary(metadataLocked: boolean, lockedFields: readonly string[]): string {
  if (metadataLocked) return 'every field';
  return lockedFields.length ? lockedFields.join(', ') : 'no';
}

/** A person's external ids written like a title's in the overview tab:
 *  "tmdb:1234  imdb:nm0001234"; empty when there are none. */
export function externalIdsText(p: { tmdbPersonId?: string | null; imdbId?: string | null }): string {
  const ids: string[] = [];
  if (p.tmdbPersonId) ids.push(`tmdb:${p.tmdbPersonId}`);
  if (p.imdbId) ids.push(`imdb:${p.imdbId}`);
  return ids.join('  ');
}

/** An episode's place in its series, "S01E02": as much of it as is known,
 *  empty for a title that is no episode. */
export function episodeLabel(season?: number | null, episode?: number | null): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return (season != null ? `S${two(season)}` : '') + (episode != null ? `E${two(episode)}` : '');
}

/** A person's credit as katalog-manager's Person.credits gives it. */
export interface PersonCredit {
  id: string;
  role: string;
  job: string | null;
  character: string | null;
  episodeCount: number | null;
  item: {
    id: string;
    title: string;
    year: number | null;
    seasonNumber: number | null;
    episodeNumber: number | null;
    parent: { id: string; title: string } | null;
  };
}

/** A row of a person's credits table: the title (an episode with its series
 *  and its place in it), then what the credit says. */
export interface CreditRow {
  id: string;
  itemId: string;
  title: string;
  year: number | null;
  series: { id: string; title: string } | null;
  episode: string;
  role: string;
  job: string | null;
  character: string | null;
  episodeCount: number | null;
}

export function creditRow(c: PersonCredit): CreditRow {
  return {
    id: c.id,
    itemId: c.item.id,
    title: c.item.title,
    year: c.item.year,
    series: c.item.parent,
    episode: episodeLabel(c.item.seasonNumber, c.item.episodeNumber),
    role: c.role,
    job: c.job,
    character: c.character,
    episodeCount: c.episodeCount,
  };
}

/** The title a person page was opened from, as the cast tab passes it in the
 *  router state; null for anything else (a deep link, another page's state). */
export function fromItem(state: unknown): { id: string; title: string } | null {
  if (!state || typeof state !== 'object') return null;
  const from = (state as { from?: unknown }).from;
  if (!from || typeof from !== 'object') return null;
  const { id, title } = from as { id?: unknown; title?: unknown };
  if (typeof id !== 'string' || !id || typeof title !== 'string' || !title) return null;
  return { id, title };
}
