// Pure helpers for encoding a title again: no React, no DOM, so `npm test`
// runs them under node as they are.

/** What katalog-manager's reencodeItem answers. */
export interface ReencodeResult {
  itemId: string;
  titles: number; // the movie or episode, or the series' episodes with a file
  reencoded: number; // of them, those encoded again
  busy: number; // those left alone: a transcode or package of them is running
  notSent: number; // those whose event could not be sent
  message: string;
}

/** True for the titles katalog-manager encodes again: a movie, an episode,
 *  and a series, whose episodes it encodes. */
export function canReencode(type: string): boolean {
  return type === 'movie' || type === 'episode' || type === 'series';
}

/** What the confirm says a re-encode of the title does, a paragraph each:
 *  what it encodes and with what, what plays meanwhile, and what it leaves
 *  alone. */
export function reencodeExplainer(type: string, title: string): string[] {
  if (type === 'series') {
    return [
      `encodes every episode of “${title}” that has a file again with this instance’s current pipeline settings ` +
        '(the transcoder’s ladder and encoder, then the packager’s), and packages each again.',
      'each episode’s current package plays while it is encoded. once its packaging starts it plays by on-demand ' +
        'transcoding until the new package is complete, and anyone watching it then has to start again.',
      'an episode whose transcode or package is running is left alone.',
    ];
  }
  return [
    `encodes “${title}” again with this instance’s current pipeline settings (the transcoder’s ladder and ` +
      'encoder, then the packager’s), and packages it again.',
    'its current package plays while it is encoded. once packaging starts it plays by on-demand transcoding until ' +
      'the new package is complete, and anyone watching it then has to start again.',
    'a transcode or package of it that is running is left alone.',
  ];
}

/** The item page's line after a re-encode: what katalog-manager did, and why
 *  it left a title alone. */
export function reencodeNotice(r: ReencodeResult): string {
  return `re-encode: ${r.message}`;
}

/** True when the re-encode started anything: a title encoded again. One that
 *  started nothing (each title left alone, no file, its event not sent)
 *  keeps its dialog open, saying why. */
export function reencodeStarted(r: ReencodeResult): boolean {
  return r.reencoded > 0;
}
