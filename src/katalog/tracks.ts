// Pure helpers for a title's tracks and the language an admin sets for one:
// no React, no DOM, so `npm test` runs them under node as they are.

/** A track of a title's source, as katalog-manager's Item.tracks gives it:
 *  its kind and its ordinal, its place among the source's streams of that
 *  kind (0 first), with the language its source tags it with, the one an
 *  admin set and the one it plays as. Codes are ISO 639-2, three lowercase
 *  letters; zxx is no dialogue, und unknown. */
export interface Track {
  kind: string; // audio | subtitle
  ordinal: number;
  sourceLanguage: string | null;
  languageOverride: string | null;
  effectiveLanguage: string;
  title: string | null;
  format: string | null;
  forced: boolean;
  reported: boolean; // a package reported it; false: only an admin's language names it
}

/** No linguistic content: a film, or a track, without dialogue. */
export const NO_DIALOGUE = 'zxx';
/** Undetermined: nothing says what the track's language is. */
export const UNKNOWN = 'und';

/** The select's choice that clears the language set, so the track plays as
 *  its source tags it; and the one that asks for a code of another
 *  language. Neither is a language code (three letters). */
export const AS_THE_SOURCE = '';
export const ANOTHER_CODE = 'another';

/** True for a language as a track's is set: three lowercase letters. */
export function isLanguageCode(s: string): boolean {
  return /^[a-z]{3}$/.test(s);
}

/** What people call the language a code names: "No dialogue" for zxx,
 *  "Unknown" for und and for none, otherwise its name in the locales
 *  ("German" for ger or deu), or the code itself when it names none known. */
export function languageName(code: string | null | undefined, locales: readonly string[] = ['en']): string {
  const c = (code ?? '').trim().toLowerCase();
  if (c === NO_DIALOGUE) return 'No dialogue';
  if (c === '' || c === UNKNOWN) return 'Unknown';
  try {
    const name = new Intl.DisplayNames([...locales], { type: 'language', fallback: 'none' }).of(c);
    if (name) return name;
  } catch {
    /* a code Intl refuses */
  }
  return c;
}

/** A language as the tracks table writes it, its name and its code:
 *  "No dialogue (zxx)", "German (ger)"; "Unknown" for none. */
export function languageText(code: string | null | undefined): string {
  const c = (code ?? '').trim().toLowerCase();
  return c ? `${languageName(c)} (${c})` : 'Unknown';
}

/** The languages the select offers by name, besides no dialogue and unknown:
 *  those a library mostly holds, as ISO 639-2/T codes. */
export const COMMON_LANGUAGES: readonly string[] = [
  'ara', 'ces', 'dan', 'deu', 'ell', 'eng', 'fin', 'fra', 'heb', 'hin', 'hun', 'ita', 'jpn', 'kor', 'nld',
  'nor', 'pol', 'por', 'rus', 'spa', 'swe', 'tur', 'ukr', 'zho',
];

export interface LanguageOption {
  label: string;
  value: string;
}

/** The choices of a track's language: as the source tags it (clearing the
 *  admin's), no dialogue, unknown, the common languages by name, and another
 *  code. A language set that is none of them (a B code such as ger) is
 *  offered too, so the select can show it. */
export function languageOptions(track: Pick<Track, 'sourceLanguage' | 'languageOverride'>): LanguageOption[] {
  const named = [...COMMON_LANGUAGES];
  const set = track.languageOverride;
  if (set && set !== NO_DIALOGUE && set !== UNKNOWN && !named.includes(set)) named.push(set);
  const byName = named
    .map((code) => ({ label: languageText(code), value: code }))
    .sort((a, b) => a.label.localeCompare(b.label, 'en'));
  return [
    { label: `As the source says: ${languageText(track.sourceLanguage)}`, value: AS_THE_SOURCE },
    { label: languageText(NO_DIALOGUE), value: NO_DIALOGUE },
    { label: languageText(UNKNOWN), value: UNKNOWN },
    ...byName,
    { label: 'Another code…', value: ANOTHER_CODE },
  ];
}

/** The choice the select starts on: the language set, else as the source
 *  says. */
export function choiceOf(track: Pick<Track, 'languageOverride'>): string {
  return track.languageOverride ?? AS_THE_SOURCE;
}

/** The language a choice sets: null for as the source says (the admin's
 *  cleared), the code typed for another code, trimmed and lowercased; an
 *  error for a code that is no three letters. */
export function languageToSet(choice: string, typed: string): { language: string | null } | { error: string } {
  if (choice === AS_THE_SOURCE) return { language: null };
  const code = (choice === ANOTHER_CODE ? typed : choice).trim().toLowerCase();
  if (!isLanguageCode(code)) {
    return { error: 'a language is an ISO 639-2 code of three letters, such as eng, ger or zxx' };
  }
  return { language: code };
}

/** A track as people name it: "audio 0", "subtitle 2". */
export function trackName(t: Pick<Track, 'kind' | 'ordinal'>): string {
  return `${t.kind} ${t.ordinal}`;
}

/** What else the table says of a track: its title tag, a subtitle's format
 *  and whether it is forced, and that no package reported it. */
export function trackDetails(t: Pick<Track, 'title' | 'format' | 'forced' | 'reported'>): string {
  const facts: string[] = [];
  if (t.title?.trim()) facts.push(t.title.trim());
  if (t.format) facts.push(t.format);
  if (t.forced) facts.push('forced');
  if (!t.reported) facts.push('no package reported it');
  return facts.join(' · ');
}

/** The page's line once a language is set or cleared: what the track plays
 *  as, and when that reaches the title's package. */
export function setNotice(t: Pick<Track, 'kind' | 'ordinal' | 'sourceLanguage'>, language: string | null): string {
  const playsAs = language ?? t.sourceLanguage ?? UNKNOWN;
  const what = language ? `${trackName(t)} is set to ${languageText(language)}` :
    `${trackName(t)} plays as its source says, ${languageText(playsAs)}`;
  return `${what}: the title’s package takes it when it is packaged again (Re-encode).`;
}

/** True for the titles whose source has tracks to set: a movie and an
 *  episode, the titles with a video file. */
export function hasTracks(type: string): boolean {
  return type === 'movie' || type === 'episode';
}
