// Pure helpers for a title's credits and a person's record: no React, no DOM,
// so `npm test` runs them under node as they are.

/** True when any credit says how many episodes it covers: a series' credits
 *  do, a film's never (katalog-manager leaves episodeCount null). */
export function hasEpisodeCounts(credits: readonly { episodeCount?: number | null }[]): boolean {
  return credits.some((c) => c.episodeCount != null);
}
