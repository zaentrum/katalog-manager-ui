import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ANOTHER_CODE,
  AS_THE_SOURCE,
  choiceOf,
  hasTracks,
  isLanguageCode,
  languageName,
  languageOptions,
  languageText,
  languageToSet,
  setNotice,
  trackDetails,
  trackName,
} from './tracks.ts';

test('zxx is no dialogue, und and none unknown, any other code its name', () => {
  assert.equal(languageName('zxx'), 'No dialogue');
  assert.equal(languageName('und'), 'Unknown');
  assert.equal(languageName(''), 'Unknown');
  assert.equal(languageName(null), 'Unknown');
  assert.equal(languageName(undefined), 'Unknown');
  assert.equal(languageName('eng'), 'English');
  assert.equal(languageName('ger'), 'German');
  assert.equal(languageName('deu'), 'German');
  assert.equal(languageName('FRE'), 'French');
  assert.equal(languageName('qqq'), 'qqq');
});

test('the table writes a language with its code', () => {
  assert.equal(languageText('zxx'), 'No dialogue (zxx)');
  assert.equal(languageText('und'), 'Unknown (und)');
  assert.equal(languageText('ger'), 'German (ger)');
  assert.equal(languageText(null), 'Unknown');
  assert.equal(languageText(''), 'Unknown');
});

test('a language is set as three lowercase letters', () => {
  for (const ok of ['eng', 'zxx', 'und', 'ger']) assert.equal(isLanguageCode(ok), true, ok);
  for (const bad of ['', 'en', 'ENG', 'english', 'en-US', 'e1g', ' eng']) assert.equal(isLanguageCode(bad), false, bad);
});

test('the choices are the source’s, no dialogue, unknown, the languages by name and another code', () => {
  const options = languageOptions({ sourceLanguage: 'und', languageOverride: null });
  assert.deepEqual(options[0], { label: 'As the source says: Unknown (und)', value: AS_THE_SOURCE });
  assert.deepEqual(options[1], { label: 'No dialogue (zxx)', value: 'zxx' });
  assert.deepEqual(options[2], { label: 'Unknown (und)', value: 'und' });
  assert.deepEqual(options.at(-1), { label: 'Another code…', value: ANOTHER_CODE });
  const named = options.slice(3, -1);
  assert.deepEqual(named.map((o) => o.label), named.map((o) => o.label).sort((a, b) => a.localeCompare(b, 'en')));
  assert.ok(named.some((o) => o.value === 'eng' && o.label === 'English (eng)'));
  assert.ok(named.some((o) => o.value === 'deu' && o.label === 'German (deu)'));
  assert.equal(new Set(options.map((o) => o.value)).size, options.length);
  assert.equal(languageOptions({ sourceLanguage: null, languageOverride: null })[0].label, 'As the source says: Unknown');
});

test('a language set that is none of the choices is offered too', () => {
  const options = languageOptions({ sourceLanguage: 'eng', languageOverride: 'ger' });
  assert.ok(options.some((o) => o.value === 'ger' && o.label === 'German (ger)'));
  assert.equal(options.filter((o) => o.value === 'zxx').length, 1);
  assert.equal(languageOptions({ sourceLanguage: 'eng', languageOverride: 'zxx' }).filter((o) => o.value === 'zxx').length, 1);
});

test('the select starts on the language set, else on the source’s', () => {
  assert.equal(choiceOf({ languageOverride: 'zxx' }), 'zxx');
  assert.equal(choiceOf({ languageOverride: null }), AS_THE_SOURCE);
});

test('a choice sets its language, the source’s clears it, another code is checked', () => {
  assert.deepEqual(languageToSet('zxx', ''), { language: 'zxx' });
  assert.deepEqual(languageToSet('eng', 'ignored'), { language: 'eng' });
  assert.deepEqual(languageToSet(AS_THE_SOURCE, 'eng'), { language: null });
  assert.deepEqual(languageToSet(ANOTHER_CODE, ' TLH '), { language: 'tlh' });
  for (const typed of ['', 'en', 'english', 'e1g']) {
    const r = languageToSet(ANOTHER_CODE, typed);
    assert.ok('error' in r && /three letters/.test(r.error), typed);
  }
});

test('a track is named by its kind and ordinal, and described by what it says', () => {
  assert.equal(trackName({ kind: 'audio', ordinal: 0 }), 'audio 0');
  assert.equal(trackName({ kind: 'subtitle', ordinal: 2 }), 'subtitle 2');
  assert.equal(trackDetails({ title: ' Commentary ', format: null, forced: false, reported: true }), 'Commentary');
  assert.equal(trackDetails({ title: null, format: 'webvtt', forced: true, reported: true }), 'webvtt · forced');
  assert.equal(trackDetails({ title: '', format: null, forced: false, reported: false }), 'no package reported it');
  assert.equal(trackDetails({ title: null, format: null, forced: false, reported: true }), '');
});

test('the page says what the track plays as, and that a packaging takes it', () => {
  assert.equal(setNotice({ kind: 'audio', ordinal: 0, sourceLanguage: 'und' }, 'zxx'),
    'audio 0 is set to No dialogue (zxx): the title’s package takes it when it is packaged again (Re-encode).');
  assert.equal(setNotice({ kind: 'subtitle', ordinal: 1, sourceLanguage: 'ger' }, null),
    'subtitle 1 plays as its source says, German (ger): the title’s package takes it when it is packaged again (Re-encode).');
  assert.equal(setNotice({ kind: 'audio', ordinal: 1, sourceLanguage: null }, null),
    'audio 1 plays as its source says, Unknown (und): the title’s package takes it when it is packaged again (Re-encode).');
});

test('a movie and an episode have tracks, nothing else', () => {
  for (const type of ['movie', 'episode']) assert.equal(hasTracks(type), true, type);
  for (const type of ['series', 'season', 'album', 'track', '']) assert.equal(hasTracks(type), false, type);
});
