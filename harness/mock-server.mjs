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
//   unset       none of the queue's settings is set: the confirm says no pace
//   old         a katalog-manager without the report: graph-gophers' validation errors
//   down        katalog-manager answers 502
// It keeps the queue in memory; restart it for the seeded state.
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_PORT) || 8793;
const GiB = 1024 ** 3;

// a seeded generator: the same library at every start
let seed = 20261026;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const between = (a, b) => a + rand() * (b - a);
const round1 = (n) => Math.round(n * 10) / 10;

// the rules the workers report
const TRANSCODER = {
  worker: 'transcoder',
  version: '0.9.0',
  rules: [
    { key: 'movie.cap.1080', label: 'movie video at 1080p', value: '8 Mbit/s' },
    { key: 'movie.cap.2160', label: 'movie video at 2160p', value: '14 Mbit/s' },
    { key: 'movie.cap.size', label: 'movie size', value: '15 GiB' },
    { key: 'episode.cap.1080', label: 'episode video at 1080p', value: '6 Mbit/s' },
    { key: 'episode.cap.2160', label: 'episode video at 2160p', value: '8 Mbit/s' },
    { key: 'encode', label: 'video over a cap', value: 'one HEVC encode within it' },
  ],
};
const PACKAGER = {
  worker: 'packager',
  version: '0.7.2',
  rules: [
    { key: 'audio.surround', label: 'surround track', value: '5.1' },
    { key: 'subtitles.image', label: 'image subtitles', value: 'carried' },
  ],
};
const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString();
const reportedAt = { transcoder: hoursAgo(3.2), packager: hoursAgo(3.1) };
let evaluatedAt = hoursAgo(1.4);
let checkUntil = 0;

const finding = {
  bitrate: (mbit, cap, h) => ({
    rule: 'OVER_BITRATE_CAP',
    text: `video at ${mbit} Mbit/s, over the ${cap} Mbit/s cap at ${h}p`,
    measured: `${mbit} Mbit/s`,
    limit: `${cap} Mbit/s`,
  }),
  size: (bytes) => ({
    rule: 'OVER_SIZE_CAP',
    text: 'package over the 15 GiB cap',
    measured: `${round1(bytes / GiB)} GiB`,
    limit: '15 GiB',
  }),
  hevc: () => ({ rule: 'VIDEO_NOT_HEVC', text: 'video in H.264, not HEVC', measured: 'H.264', limit: 'HEVC' }),
  surround: () => ({ rule: 'NO_SURROUND', text: 'no 5.1 track in the package; the original has 7.1', measured: 'stereo', limit: '5.1' }),
  images: (n) => ({
    rule: 'IMAGE_SUBTITLES_MISSING',
    text: `${n} image subtitle ${n === 1 ? 'track' : 'tracks'} of the original not in the package`,
    measured: `0 of ${n}`,
    limit: `${n} of ${n}`,
  }),
  unpackaged: () => ({ rule: 'NOT_PACKAGED', text: 'not packaged', measured: null, limit: null }),
  failed: () => ({ rule: 'PACKAGING_FAILED', text: 'packaging failed, no attempt left', measured: null, limit: null }),
};

// what a title takes at most under a cap: its video at the cap and a 5.1
// track, a movie within the size cap too
const atMost = (minutes, capMbit, sizeCap = Infinity) => Math.min(sizeCap, (minutes * 60 * (capMbit + 0.64) * 1e6) / 8);

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
      row.findings = [finding.bitrate(Math.round((row.packageBytes * 8) / (minutes * 60) / 1e6), 14, 2160), finding.size(row.packageBytes)];
      row.estimatedBytes = atMost(minutes, 14, 15 * GiB);
    } else if (p < 0.65) {
      // a near-copy of a 1080p remux, some of them H.264
      row.originalBytes = between(11, 36) * GiB;
      row.packageBytes = row.originalBytes * between(0.9, 0.98);
      row.findings = [finding.bitrate(Math.round((row.packageBytes * 8) / (minutes * 60) / 1e6), 8, 1080)];
      if (row.packageBytes > 15 * GiB) row.findings.push(finding.size(row.packageBytes));
      if (rand() < 0.5) row.findings.push(finding.hevc());
      row.estimatedBytes = atMost(minutes, 8, 15 * GiB);
    } else if (p < 0.77) {
      row.originalBytes = between(9, 30) * GiB;
      row.packageBytes = between(6, 14) * GiB;
      row.findings = [finding.surround()];
    } else if (p < 0.85) {
      row.originalBytes = between(9, 30) * GiB;
      row.packageBytes = between(6, 14) * GiB;
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
      row.estimatedBytes = atMost(minutes, row.originalBytes > 30 * GiB ? 14 : 8, 15 * GiB);
    } else {
      row.originalBytes = between(8, 40) * GiB;
      row.findings = [finding.failed()];
      row.estimatedBytes = atMost(minutes, 14, 15 * GiB);
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
        const cap = s.uhd ? 8 : 6;
        const row = { itemId: `${s.id}e${season}${String(episode).padStart(2, '0')}`, title: `Chapter ${episode}`, year: null,
          kind: 'EPISODE', seriesId: s.id, seriesTitle: s.title, season, episode,
          findings: [finding.bitrate(Math.round((pkg * 8) / (minutes * 60) / 1e6), cap, s.uhd ? 2160 : 1080)],
          originalBytes: original, packageBytes: pkg, estimatedBytes: atMost(minutes, cap), queue: null };
        if (!s.uhd && rand() < 0.3) row.findings.push(finding.surround());
        rows.push(row);
      }
    }
  }
  return rows;
}

const library = [...movies(), ...episodes()].map((r) => ({ ...r, evaluatedAt }));
// a few titles in the queue already
for (const [i, q] of [[3, 'sent'], [5, 'queued'], [8, 'queued'], [12, 'queued'], [20, 'failed'], [31, 'done'], [240, 'sent']]) {
  if (library[i]) library[i].queue = q;
}

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
  const notEvaluated = scenario === 'unreported' ? ['the transcoder has not reported its rules, so its caps are not checked'] : [];
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
  return {
    rules,
    notEvaluated,
    evaluatedAt: scenario === 'never' ? null : evaluatedAt,
    evaluating,
    total: matching.length,
    summary,
    rows: matching.slice(offset, offset + first),
    nextCursor: offset + first < matching.length ? `o:${offset + first}` : null,
  };
}

// queueRework and queueReworkMatching: a title waiting or sent stays as it
// is; one not in the library is skipped
function enqueue(rows, unknown = 0) {
  let queued = 0;
  let already = 0;
  for (const r of rows) {
    if (r.queue === 'queued' || r.queue === 'sent') already++;
    else {
      r.queue = 'queued';
      queued++;
    }
  }
  const parts = [`queued ${queued} ${queued === 1 ? 'title' : 'titles'} to be encoded again`];
  if (already) parts.push(`${already} queued already`);
  if (unknown) parts.push(`${unknown} skipped: unknown item`);
  return { queued, alreadyQueued: already, skipped: unknown, message: parts.join('; ') };
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

function reencodeQueue(scenario) {
  const count = (q) => library.filter((r) => r.queue === q).length;
  const h = new Date().getHours();
  const inside = h >= 23 || h < 7;
  return {
    queued: count('queued'),
    sent: count('sent'),
    done: count('done'),
    failed: count('failed'),
    idle: scenario === 'unset' || inside ? null : 'outside library.reencode.window (23:00-07:00)',
  };
}

function answer(query, vars, scenario) {
  const data = {};
  if (/\bqueueReworkMatching\s*\(/.test(query)) {
    const ids = new Set(matchingOf(asked(vars, scenario), vars).map((r) => r.itemId));
    data.queueReworkMatching = enqueue(library.filter((r) => ids.has(r.itemId)));
    return { data };
  }
  if (/\bqueueRework\s*\(/.test(query)) {
    const items = vars.items ?? [];
    const rows = library.filter((r) => items.includes(r.itemId));
    data.queueRework = enqueue(rows, items.length - rows.length);
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
  if (/\bsettings\b/.test(query)) data.settings = scenario === 'unset' ? SETTINGS.filter((s) => !s.key.startsWith('library.')) : SETTINGS;
  if (/\bretryPolicy\b/.test(query)) data.retryPolicy = POLICY;
  if (/\bprocessingOverview\b/.test(query)) {
    data.processingOverview = { steps: [], failed: [], failedTotal: 0, retry: POLICY, reencodeQueue: reencodeQueue(scenario) };
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
