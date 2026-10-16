// i18n integrity: English and Telugu dictionaries must stay in lockstep so the
// runtime string-substitution localizer never shows a missing or mixed key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const en = (await import(`file://${root}/i18n/en.js`)).default;
const te = (await import(`file://${root}/i18n/te.js`)).default;

test('en and te expose identical key sets', () => {
  const enKeys = Object.keys(en).sort();
  const teKeys = Object.keys(te).sort();
  assert.deepEqual(teKeys, enKeys);
});

test('no duplicate literal keys and every value is a non-empty string', () => {
  for (const [name, src] of [['en', 'i18n/en.js'], ['te', 'i18n/te.js']]) {
    const text = readFileSync(path.join(root, src), 'utf8');
    const keys = [...text.matchAll(/^\s*([A-Za-z0-9_]+)\s*:/gm)].map((m) => m[1]);
    assert.equal(new Set(keys).size, keys.length, `${name} has duplicate keys`);
    const dict = name === 'en' ? en : te;
    for (const key of Object.keys(dict)) {
      assert.equal(typeof dict[key], 'string', `${name}.${key} must be a string`);
      assert.ok(dict[key].length > 0, `${name}.${key} must not be empty`);
    }
  }
});

test('telugu values contain no other Indic scripts', () => {
  for (const key of Object.keys(te)) {
    if (key === 'english') continue;
    for (const char of te[key]) {
      const cp = char.codePointAt(0);
      const indic = cp >= 0x0900 && cp <= 0x0D7F;
      const telugu = cp >= 0x0C00 && cp <= 0x0C7F;
      assert.ok(!indic || telugu, `te.${key} mixes non-Telugu Indic script`);
    }
  }
});
