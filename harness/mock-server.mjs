// Stands in for katalog-manager's GraphQL, as much of it as the rules tab
// reads: the report of the titles that break the pipeline's rules, the
// re-encode queue they are reworked through, and the settings and sweep the
// queue's pace is read from. Every title is made up: this repo is public.
//
// The page's ?mock= picks the state it answers from (a cookie the dev proxy
// passes on):
//   (none)      movies and episodes over the caps, a few in the queue
//   empty       every title follows the rules
//   never       the titles were never checked
//   checking    a check is running
//   unreported  the transcoder never reported its rules: its caps are not checked
//   old         a katalog-manager without the report: graph-gophers' validation errors
//   down        katalog-manager answers 502
// It keeps the queue in memory; restart it for the seeded state.
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_PORT) || 8793;
const GiB = 1024 ** 3;
const GB = 1e9;

// a seeded generator: the same library at every start
let seed = 20261026;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const between = (a, b) => a + rand() * (b - a);
const round1 = (n) => Math.round(n * 10) / 10;
const fmt = (n) => n.toLocaleString('en-US');
// sizes and bit rates as the server writes them in its sentences: decimal,
// one decimal and no trailing zero, a no-break space before the unit
const NB = '\u00a0';
const gb = (bytes) => `${round1(bytes / GB)}${NB}GB`;
const mbps = (n) => `${round1(n)}${NB}Mbit/s`;
// "a and b", "a, b and c"
const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

// the rules the workers report, in words, the raw config under details; the
// findings read their limits from here
const CAPS = { movie: { 1080: 8, 2160: 14 }, episode: { 1080: 6, 2160: 8 } };
const SIZE_CAP = 15 * GiB;
const reported = (key, label, value, detail = null) => ({ key, label, value, detail });
const TRANSCODER = {
  worker: 'transcoder',
  version: '0.9.0',
  rules: [
    reported('caps.movie1080Mbps', 'Video bit rate, 1080p movies', `at most ${mbps(CAPS.movie[1080])}`),
    reported('caps.movie2160Mbps', 'Video bit rate, 2160p movies', `at most ${mbps(CAPS.movie[2160])}`),
    reported('caps.movieMaxGiB', 'File size, movies', `at most ${gb(SIZE_CAP)} (15${NB}GiB)`),
    reported('caps.episode1080Mbps', 'Video bit rate, 1080p episodes', `at most ${mbps(CAPS.episode[1080])}`),
    reported('caps.episode2160Mbps', 'Video bit rate, 2160p episodes', `at most ${mbps(CAPS.episode[2160])}`),
    reported('bucket2160.minHeight', '2160p from a height of', '2,000 pixels'),
    reported('bucket2160.minWidth', '2160p from a width of', '3,200 pixels'),
    reported('encoder.codec', 'Encoder', 'hevc_nvenc'),
    reported('encoder.preset', 'Encoder preset', 'p5'),
    reported('encoder.cq', 'Constant quality', '23'),
    reported('encoder.maxrate1080Mbps', 'Encode bit rate, 1080p', 'up to the caps above'),
    reported('encoder.maxrate2160Mbps', 'Encode bit rate, 2160p', 'up to the caps above'),
    reported('ladder', 'Renditions', 'one, at the original’s size, in HEVC', 'source:hevc'),
    reported('extraLadder', 'Renditions of extras', 'one, at the original’s size, in HEVC', 'source:hevc'),
  ],
};
const PACKAGER = {
  worker: 'packager',
  version: '0.7.2',
  rules: [
    reported('surroundAudio', 'Surround track', `5.1 E-AC-3, 448${NB}kbit/s`),
    reported('stereoBitrate', 'Stereo track', `192${NB}kbit/s`),
    reported('imageSubtitles', 'Image subtitles kept', 'PGS, VobSub'),
  ],
};
const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString();
const reportedAt = { transcoder: hoursAgo(3.2), packager: hoursAgo(3.1) };
let evaluatedAt = hoursAgo(1.4);
let checkUntil = 0;

// the findings in the server's words: the reason, with the limit read from
// the rules above; a tool's output or a codec's id is the detail, never in
// the sentence
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const LANGUAGES = ['German', 'French', 'Italian', 'Japanese', 'Spanish', 'Portuguese (Brazil)', 'Chinese (Simplified)'];
const finding = {
  // measured from the package's bit rate, or, where it gives none, from its
  // size: "about"
  bitrate: (mbit, cap, h, kind) => {
    const about = rand() < 0.3 ? 'about ' : '';
    return {
      rule: 'OVER_BITRATE_CAP',
      text: `The video runs at ${about}${mbps(mbit)}, above the ${mbps(cap)} the transcoder allows for a ${h}p ${kind}.`,
      measured: `${about}${mbps(mbit)}`,
      limit: mbps(cap),
      detail: null,
    };
  },
  size: () => ({
    rule: 'OVER_SIZE_CAP',
    text: `The original is larger than the ${gb(SIZE_CAP)} the transcoder allows for a movie, and the package copied its video.`,
    measured: null,
    limit: gb(SIZE_CAP),
    detail: null,
  }),
  hevc: () => ({
    rule: 'VIDEO_NOT_HEVC',
    text: 'The video is H.264, and the transcoder makes every video HEVC.',
    measured: 'H.264',
    limit: 'HEVC',
    detail: 'avc1.640028',
  }),
  surround: () => {
    const channels = pick([6, 8]);
    return {
      rule: 'NO_SURROUND',
      text: `The package has 2 audio channels, and the original has ${channels}. The 5.1 E-AC-3 track the packager makes is missing.`,
      measured: '2 channels',
      limit: '5.1 E-AC-3',
      detail: null,
    };
  },
  images: (n) => {
    const langs = [...LANGUAGES].sort(() => rand() - 0.5).slice(0, n);
    return {
      rule: 'IMAGE_SUBTITLES_MISSING',
      text: `The original’s PGS subtitles in ${list(langs)} are missing from the package. The packager keeps PGS subtitles.`,
      measured: langs.join(', '),
      limit: 'PGS, VobSub',
      detail: null,
    };
  },
  unpackaged: () => ({
    rule: 'NOT_PACKAGED',
    text: pick([
      'It has no package, and none is being made.',
      'It was taken in without a package and plays from its original.',
      'Its transcode and packaging finished, and no package is recorded.',
    ]),
    measured: null,
    limit: null,
    detail: null,
  }),
  // what failed, and, where processing it again can't help, why (BLOCKED)
  failed: () => {
    const [text, detail, blocked] = pick([
      ['The transcoder failed.', 'ffmpeg exited 1', null],
      ['The packager failed, and tries again by itself.', 'shaka-packager exited 1', null],
      ['The transcoder left it as it is: Dolby Vision profile 7 needs a tone-mapping encode.', null, 'dv7'],
      ['The transcoder left it as it is: it can’t tone-map Dolby Vision profile 5.', null, 'dv5'],
      ['The packager skipped it: the original has no video.', null, 'noVideo'],
    ]);
    return { finding: { rule: 'PACKAGING_FAILED', text, measured: null, limit: null, detail }, blocked };
  },
};

// what a title takes at most under a cap: its video at the cap and a 5.1
// track, a movie within the size cap too
const atMost = (minutes, capMbit, sizeCap = Infinity) => Math.min(sizeCap, (minutes * 60 * (capMbit + 0.64) * 1e6) / 8);
// a package's video bit rate, from its size and the title's length
const mbitOf = (bytes, minutes) => round1((bytes * 8) / (minutes * 60) / 1e6);

const FIRST = ['Vell', 'Quill', 'Okker', 'Bran', 'Mirr', 'Tars', 'Kest', 'Arv', 'Salt', 'Wen', 'Ferr', 'Ils', 'Dun', 'Calv',
  'Orr', 'Thorn', 'Lund', 'Bram', 'Cair', 'Gald', 'Hesk', 'Jorr', 'Nesb', 'Oss', 'Rudd', 'Skel', 'Tyv'];
const LAST = ['mar Station', 'mere', 'holm', 'nock Line', 'in Falls', 'by Road', 'rel Yard', 'o North', 'march', 'low Hill',
  'owind', 'by Crossing', 'morrow', 'adine'];

function movies() {
  const names = new Set();
  while (names.size < 230) names.add(FIRST[Math.floor(rand() * FIRST.length)] + LAST[Math.floor(rand() * LAST.length)]);
  return [...names].map((title, i) => {
    const minutes = between(88, 165);
    const p = rand();
    const row = { itemId: `m${String(i + 1).padStart(3, '0')}`, title, year: 1968 + Math.floor(rand() * 58), kind: 'MOVIE',
      seriesId: null, seriesTitle: null, season: null, episode: null, findings: [], originalBytes: 0, packageBytes: null,
      estimatedBytes: null, queue: null };
    if (p < 0.45) {
      // a near-copy of a 4K remux
      row.originalBytes = between(42, 78) * GiB;
      row.packageBytes = row.originalBytes * between(0.9, 0.98);
      row.findings = [finding.bitrate(mbitOf(row.packageBytes, minutes), CAPS.movie[2160], 2160, 'movie'), finding.size()];
      row.estimatedBytes = atMost(minutes, CAPS.movie[2160], SIZE_CAP);
    } else if (p < 0.65) {
      // a near-copy of a 1080p remux, some of them H.264
      row.originalBytes = between(11, 36) * GiB;
      row.packageBytes = row.originalBytes * between(0.9, 0.98);
      row.findings = [finding.bitrate(mbitOf(row.packageBytes, minutes), CAPS.movie[1080], 1080, 'movie')];
      if (row.packageBytes > SIZE_CAP) row.findings.push(finding.size());
      if (rand() < 0.5) row.findings.push(finding.hevc());
      row.estimatedBytes = atMost(minutes, CAPS.movie[1080], SIZE_CAP);
    } else if (p < 0.77) {
      row.originalBytes = between(9, 30) * GiB;
      row.packageBytes = row.originalBytes * between(0.4, 0.8);
      row.findings = [finding.surround()];
    } else if (p < 0.85) {
      row.originalBytes = between(9, 30) * GiB;
      row.packageBytes = row.originalBytes * between(0.4, 0.8);
      row.findings = [finding.images(1 + Math.floor(rand() * 3))];
      if (rand() < 0.4) row.findings.unshift(finding.surround());
    } else if (p < 0.92) {
      row.originalBytes = between(6, 16) * GiB;
      row.packageBytes = row.originalBytes * between(0.85, 0.97);
      row.findings = [finding.hevc()];
      row.estimatedBytes = row.packageBytes * between(0.5, 0.7);
    } else if (p < 0.97) {
      row.originalBytes = between(8, 60) * GiB;
      row.findings = [finding.unpackaged()];
      row.estimatedBytes = atMost(minutes, row.originalBytes > 30 * GiB ? CAPS.movie[2160] : CAPS.movie[1080], SIZE_CAP);
    } else {
      row.originalBytes = between(8, 40) * GiB;
      const failed = finding.failed();
      row.findings = [failed.finding];
      row.blocked = failed.blocked;
      row.estimatedBytes = atMost(minutes, CAPS.movie[2160], SIZE_CAP);
    }
    return row;
  });
}

const SERIES = [
  { id: 's1', title: 'Pellam Bay', seasons: 2, episodes: 8, uhd: true },
  { id: 's2', title: 'Halvord', seasons: 3, episodes: 6, uhd: false },
  { id: 's3', title: 'The Ressel Line', seasons: 1, episodes: 10, uhd: true },
  { id: 's4', title: 'Galdmere', seasons: 2, episodes: 9, uhd: false },
];

function episodes() {
  const rows = [];
  for (const s of SERIES) {
    for (let season = 1; season <= s.seasons; season++) {
      for (let episode = 1; episode <= s.episodes; episode++) {
        if (rand() < 0.2) continue; // within the rules
        const minutes = between(42, 58);
        const original = (s.uhd ? between(6, 13) : between(2.2, 6)) * GiB;
        const pkg = original * between(0.9, 0.98);
        const cap = s.uhd ? CAPS.episode[2160] : CAPS.episode[1080];
        const row = { itemId: `${s.id}e${season}${String(episode).padStart(2, '0')}`, title: `Chapter ${episode}`, year: null,
          kind: 'EPISODE', seriesId: s.id, seriesTitle: s.title, season, episode,
          findings: [finding.bitrate(mbitOf(pkg, minutes), cap, s.uhd ? 2160 : 1080, 'episode')],
          originalBytes: original, packageBytes: pkg, estimatedBytes: atMost(minutes, cap), queue: null };
        if (!s.uhd && rand() < 0.3) row.findings.push(finding.surround());
        rows.push(row);
      }
    }
  }
  return rows;
}

const library = [...movies(), ...episodes()].map((r) => ({ ...r, queueReason: null, queueDetail: null, blocked: r.blocked ?? null, evaluatedAt }));
const byPackage = library.filter((r) => r.kind === 'MOVIE' && r.packageBytes).sort((a, b) => b.packageBytes - a.packageBytes);

// why processing a title again can't help, so the queue doesn't take it,
// as the server says it: of one title (its reworkBlocked, a clause), of all
// of them, and of some among others
const BLOCKED = {
  deleted: {
    one: 'its original was deleted after packaging',
    all: 'their originals were deleted after packaging',
    some: (n) => (n === 1 ? 'the original of 1 was deleted after packaging' : `the originals of ${fmt(n)} were deleted after packaging`),
  },
  noFile: { one: 'it has no file', all: 'they have no file', some: (n) => `${fmt(n)} ${n === 1 ? 'has' : 'have'} no file` },
  disc: { one: 'its file is a disc image', all: 'their files are disc images', some: (n) => (n === 1 ? '1 is a disc image' : `${fmt(n)} are disc images`) },
  noVideo: { one: 'its original has no video', all: 'their originals have no video', some: (n) => `${fmt(n)} ${n === 1 ? 'has' : 'have'} no video` },
  dv7: {
    one: 'its video is Dolby Vision profile 7, which needs a tone-mapping encode',
    all: 'their video is Dolby Vision profile 7, which needs a tone-mapping encode',
    some: (n) => `${fmt(n)} ${n === 1 ? 'is' : 'are'} Dolby Vision profile 7`,
  },
  dv5: {
    one: 'its video is Dolby Vision profile 5, which the transcoder can’t tone-map',
    all: 'their video is Dolby Vision profile 5, which the transcoder can’t tone-map',
    some: (n) => `${fmt(n)} ${n === 1 ? 'is' : 'are'} Dolby Vision profile 5`,
  },
  unknown: { one: 'it is not in the catalog', all: 'they are not in the catalog', some: (n) => `${fmt(n)} ${n === 1 ? 'is' : 'are'} not in the catalog` },
};
// a few movies the queue doesn't take besides those whose packaging was
// refused (the second biggest package among them, so the list shows one at
// the top), one of them a disc image whose packaging failed
byPackage[1].blocked = 'deleted';
byPackage[6].blocked = 'deleted';
byPackage[15].blocked = 'noFile';
const disc = library.find((r) => r.kind === 'MOVIE' && !r.blocked && r.findings.some((f) => f.rule === 'PACKAGING_FAILED'));
if (disc) {
  disc.blocked = 'disc';
  disc.findings = [{ rule: 'PACKAGING_FAILED', text: 'Its file is a disc image, which the transcoder doesn’t encode.', measured: null, limit: null, detail: null }];
}

// a few titles in the queue already, each with what it waits for
const WAITING = 'It is waiting for the transcoder.';
for (const [i, q, why] of [
  [3, 'sent', 'The transcoder is working on it.'],
  [5, 'queued', WAITING],
  [8, 'queued', WAITING],
  [12, 'queued', WAITING],
  [31, 'done', null],
  [240, 'sent', 'It is waiting for the packager.'],
]) {
  if (library[i] && !library[i].blocked) Object.assign(library[i], { queue: q, queueReason: why });
}
// and one whose processing failed: the reason, and the tool's output for
// under details
const h264 = byPackage.find((r) => !r.queue && !r.blocked && r.findings.some((f) => f.rule === 'VIDEO_NOT_HEVC'));
Object.assign(h264, { queue: 'failed', queueReason: 'The transcoder failed.', queueDetail: 'ffmpeg exited 1' });
// a title processing again can't help says why, and has no estimate
for (const r of library) {
  r.reworkBlocked = r.blocked ? BLOCKED[r.blocked].one : null;
  if (r.blocked) r.estimatedBytes = null;
}

// a title as the server names it in its answers
const nameOf = (r) =>
  r.kind === 'EPISODE'
    ? `${r.seriesTitle} · S${String(r.season).padStart(2, '0')}E${String(r.episode).padStart(2, '0')} · ${r.title}`
    : `${r.title} (${r.year})`;

const transcoderRules = new Set(['OVER_BITRATE_CAP', 'OVER_SIZE_CAP', 'VIDEO_NOT_HEVC']);

function titlesOf(scenario) {
  if (scenario === 'empty' || scenario === 'never') return [];
  if (scenario !== 'unreported') return library;
  // as a catalog whose transcoder never reported finds them: no caps checked
  return library
    .map((r) => ({ ...r, estimatedBytes: null, findings: r.findings.filter((f) => !transcoderRules.has(f.rule)) }))
    .filter((r) => r.findings.length);
}

// the titles of a kind and a search, the summary's; and of them those that
// break a rule asked for, biggest package (then original) first
function asked(vars, scenario) {
  const search = (vars.search ?? '').trim().toLowerCase();
  return titlesOf(scenario)
    .filter((r) => !vars.kind || r.kind === vars.kind)
    .filter((r) => !search || `${r.seriesTitle ?? ''} ${r.title}`.toLowerCase().includes(search));
}
function matchingOf(titles, vars) {
  return titles
    .filter((r) => !vars.rules?.length || r.findings.some((f) => vars.rules.includes(f.rule)))
    .sort((a, b) => (b.packageBytes ?? 0) - (a.packageBytes ?? 0) || b.originalBytes - a.originalBytes);
}

function compliance(vars, scenario) {
  const evaluating = scenario === 'checking' || Date.now() < checkUntil;
  const rules = {
    transcoder: scenario === 'unreported' ? null : { ...TRANSCODER, reportedAt: reportedAt.transcoder },
    packager: { ...PACKAGER, reportedAt: reportedAt.packager },
  };
  const notEvaluated =
    scenario === 'unreported' ? ['The transcoder hasn’t reported its rules, so bit rates, file sizes and the video format can’t be checked.'] : [];
  const titles = asked(vars, scenario);
  const summary = [];
  for (const rule of ['NOT_PACKAGED', 'PACKAGING_FAILED', 'OVER_BITRATE_CAP', 'OVER_SIZE_CAP', 'NO_SURROUND', 'IMAGE_SUBTITLES_MISSING', 'VIDEO_NOT_HEVC']) {
    const of = titles.filter((r) => r.findings.some((f) => f.rule === rule));
    if (!of.length) continue;
    const estimated = of.filter((r) => r.estimatedBytes != null);
    summary.push({
      rule,
      titles: of.length,
      packageBytes: of.reduce((s, r) => s + (r.packageBytes ?? 0), 0),
      estimatedBytes: estimated.length ? estimated.reduce((s, r) => s + r.estimatedBytes, 0) : null,
    });
  }
  const matching = matchingOf(titles, vars);
  const offset = vars.after ? Number(String(vars.after).replace(/^o:/, '')) || 0 : 0;
  const first = Math.min(Math.max(vars.first ?? 100, 1), 500);
  const totals = (rows) => {
    const estimated = rows.filter((r) => r.estimatedBytes != null);
    return {
      titles: rows.length,
      originalBytes: rows.reduce((s, r) => s + r.originalBytes, 0),
      packageBytes: rows.reduce((s, r) => s + (r.packageBytes ?? 0), 0),
      estimatedBytes: estimated.length ? estimated.reduce((s, r) => s + r.estimatedBytes, 0) : null,
    };
  };
  return {
    rules,
    notEvaluated,
    evaluatedAt: scenario === 'never' ? null : evaluatedAt,
    evaluating,
    total: matching.length,
    // the totals over every title that matches, not only the page, and over
    // those of them the queue would take: not in it, and none processing
    // again can't help
    matching: totals(matching),
    queueable: totals(matching.filter(queueable)),
    queue: queueCounts(),
    summary,
    rows: matching.slice(offset, offset + first),
    nextCursor: offset + first < matching.length ? `o:${offset + first}` : null,
  };
}

// the re-encode queue, all of it: titles processed and within the rules have
// left the report, and are counted all the same
const PROCESSED_BEFORE = 34;
function queueCounts() {
  const count = (q) => library.filter((r) => r.queue === q).length;
  return { queued: count('queued'), processing: count('sent'), processed: PROCESSED_BEFORE + count('done'), failed: count('failed') };
}

const inQueue = (r) => r.queue === 'queued' || r.queue === 'sent';
const queueable = (r) => !inQueue(r) && !r.blocked;

// queueRework and queueReworkMatching: a title waiting or sent stays as it
// is; one the queue doesn't take, or that isn't in the library, is skipped
// with its reason. Each count is said too, null when there is nothing to
// say; nothing asked for says why nothing was queued (empty).
function enqueue(rows, unknown = [], empty = null) {
  let queued = 0;
  let already = 0;
  const skips = unknown.map((itemId) => ({ itemId, title: itemId, why: 'unknown' }));
  for (const r of rows) {
    if (inQueue(r)) already++;
    else if (r.blocked) skips.push({ itemId: r.itemId, title: nameOf(r), why: r.blocked });
    else {
      Object.assign(r, { queue: 'queued', queueReason: WAITING, queueDetail: null });
      queued++;
    }
  }
  const titles = (n) => `${fmt(n)} ${n === 1 ? 'title' : 'titles'}`;
  const queuedText = queued ? `${titles(queued)} queued to be processed again` : null;
  const alreadyText = already ? `${titles(already)} already in the queue` : null;
  let notQueuedText = null;
  if (skips.length) {
    // by reason, in the order BLOCKED says them
    const by = new Map(Object.keys(BLOCKED).map((why) => [why, skips.filter((x) => x.why === why).length]).filter(([, k]) => k));
    const n = skips.length;
    const head = `${titles(n)} ${n === 1 ? 'wasn’t' : 'weren’t'} queued`;
    notQueuedText = by.size === 1
      ? `${head}: ${n === 1 ? BLOCKED[skips[0].why].one : BLOCKED[skips[0].why].all}.`
      : `${head}: ${list([...by].map(([why, k]) => BLOCKED[why].some(k)))}.`;
  } else if (!queued && !already && empty) {
    notQueuedText = `Nothing was queued: ${empty}.`;
  }
  return {
    queued,
    alreadyQueued: already,
    skipped: skips.length,
    skippedTitles: skips.map((x) => ({ itemId: x.itemId, title: x.title, reason: BLOCKED[x.why].one })),
    message: [queuedText, alreadyText, notQueuedText].filter(Boolean).join(' · '),
    queuedText,
    alreadyText,
    notQueuedText,
  };
}

const setting = (id, key, valueText, valueType, description) => ({
  id, key, valueText, valueType, description, isSecret: valueText == null, isSet: true, updatedAt: hoursAgo(30),
});
const SETTINGS = [
  setting('1', 'library.reencode.rate', '2', 'int', 'titles of the re-encode queue sent a pass'),
  setting('2', 'library.reencode.inflight', '2', 'int', 'titles of the re-encode queue sent and not done at once'),
  setting('3', 'library.reencode.window', '23:00-07:00', 'string', 'when the re-encode queue is sent'),
  setting('4', 'tmdb.api_key', null, 'string', null),
];
const POLICY = { available: true, automatic: true, reason: null, maxAttempts: 3, backoffSeconds: 60, backoffMaxSeconds: 3600, intervalSeconds: 30 };

function reencodeQueue() {
  const count = (q) => library.filter((r) => r.queue === q).length;
  const h = new Date().getHours();
  const inside = h >= 23 || h < 7;
  return {
    queued: count('queued'),
    sent: count('sent'),
    done: count('done'),
    failed: count('failed'),
    idle: inside ? null : 'outside library.reencode.window (23:00-07:00)',
  };
}

function answer(query, vars, scenario) {
  const data = {};
  if (/\bqueueReworkMatching\s*\(/.test(query)) {
    // exactly the matches queueable sums up
    const ids = new Set(matchingOf(asked(vars, scenario), vars).filter(queueable).map((r) => r.itemId));
    data.queueReworkMatching = enqueue(library.filter((r) => ids.has(r.itemId)), [], 'no title fits the filter anymore');
    return { data };
  }
  if (/\bqueueRework\s*\(/.test(query)) {
    const items = vars.items ?? [];
    const rows = library.filter((r) => items.includes(r.itemId));
    data.queueRework = enqueue(rows, items.filter((id) => !rows.some((r) => r.itemId === id)), 'no title was selected');
    return { data };
  }
  if (/\brefreshCompliance\b/.test(query)) {
    checkUntil = Date.now() + 6000;
    setTimeout(() => {
      evaluatedAt = new Date().toISOString();
      for (const r of library) r.evaluatedAt = evaluatedAt;
    }, 6000);
    data.refreshCompliance = true;
    return { data };
  }
  if (/\blibraryCompliance\b/.test(query)) {
    if (scenario === 'old') {
      return {
        errors: [
          { message: 'Unknown type "ComplianceKind".', locations: [{ line: 1, column: 20 }] },
          { message: 'Unknown type "ComplianceRule".', locations: [{ line: 1, column: 45 }] },
          { message: 'Cannot query field "libraryCompliance" on type "Query".', locations: [{ line: 2, column: 3 }] },
        ],
      };
    }
    data.libraryCompliance = compliance(vars, scenario);
  }
  if (/\bsettings\b/.test(query)) data.settings = SETTINGS;
  if (/\bretryPolicy\b/.test(query)) data.retryPolicy = POLICY;
  if (/\bprocessingOverview\b/.test(query)) {
    data.processingOverview = { steps: [], failed: [], failedTotal: 0, retry: POLICY, reencodeQueue: reencodeQueue() };
  }
  // the other tabs read, empty: enough for each to render beside this one
  if (/\bscanJobs\b/.test(query)) data.scanJobs = [];
  if (/\bactivity\b/.test(query)) data.activity = [];
  return { data };
}

function cookie(req, name) {
  const m = (req.headers.cookie ?? '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  const scenario = cookie(req, 'mock-rules');
  if (path === '/api/manage/stream') {
    // the catalog stream: open, and quiet
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    res.write(': mock\n\n');
    const t = setInterval(() => res.write(': ping\n\n'), 15_000);
    req.on('close', () => clearInterval(t));
    return;
  }
  if (path === '/api/manage/query' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let q;
      try {
        q = JSON.parse(body);
      } catch {
        res.writeHead(400).end('bad json');
        return;
      }
      if (scenario === 'down' && /\blibraryCompliance\b/.test(q.query ?? '')) {
        res.writeHead(502).end('bad gateway');
        return;
      }
      // a little latency, as over a network
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(answer(q.query ?? '', q.variables ?? {}, scenario)));
      }, 120);
    });
    return;
  }
  res.writeHead(404).end();
}).listen(PORT, () => console.log(`mock katalog-manager on http://localhost:${PORT}`));
