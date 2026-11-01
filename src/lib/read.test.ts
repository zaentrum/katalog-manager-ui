import assert from 'node:assert/strict';
import { test } from 'node:test';
import { read, type ReadHandlers } from './read.ts';

// a read's answer, given when the test says
function later<T>() {
  let give!: (v: T) => void;
  let fail!: (e: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    give = resolve;
    fail = reject;
  });
  return { promise, give, fail };
}

// what a read hands on, as the view would take it
function view(log: string[], name: string): ReadHandlers<string> {
  return {
    start: () => log.push(`${name}: start`),
    data: (d) => log.push(`${name}: ${d}`),
    error: (m) => log.push(`${name}: error ${m}`),
    done: () => log.push(`${name}: done`),
  };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

test('a slow older answer never overwrites a newer one: the read a newer one followed is dropped', async () => {
  // the list's filter set to "no", then back to "all" while "no" is slow
  const log: string[] = [];
  const no = later<string>();
  const all = later<string>();
  const callOff = read(() => no.promise, view(log, 'no'));
  callOff(); // the effect's cleanup, as the filter changes
  read(() => all.promise, view(log, 'all'));
  all.give('200 rows');
  await settled();
  no.give('6 rows');
  await settled();
  assert.deepEqual(log, ['no: start', 'all: start', 'all: 200 rows', 'all: done']);
});

test('the error of a read called off is dropped too, and one of the newest read is said', async () => {
  const log: string[] = [];
  const first = later<string>();
  const second = later<string>();
  read(() => first.promise, view(log, 'first'))();
  read(() => second.promise, view(log, 'second'));
  first.fail(new Error('katalog-manager 502'));
  second.fail(new Error('Failed to fetch'));
  await settled();
  assert.deepEqual(log, ['first: start', 'second: start', 'second: error Failed to fetch', 'second: done']);
});

test('a read not called off hands its answer on, and calling it off after changes nothing', async () => {
  const log: string[] = [];
  const answer = later<string>();
  const callOff = read(() => answer.promise, view(log, 'list'));
  answer.give('200 rows');
  await settled();
  callOff(); // the view goes
  assert.deepEqual(log, ['list: start', 'list: 200 rows', 'list: done']);
});

test('a read whose view went before its answer hands on nothing more', async () => {
  const log: string[] = [];
  const answer = later<string>();
  read(() => answer.promise, view(log, 'list'))();
  answer.fail('down');
  await settled();
  assert.deepEqual(log, ['list: start']);
});
