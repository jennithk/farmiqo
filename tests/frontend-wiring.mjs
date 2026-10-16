// Regression tests for the "X is not defined" runtime failures:
// every services/api.js function the frontend calls must be imported, and every
// inline UI handler must resolve to a real function. Pure static analysis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const apiSrc = readFileSync(path.join(root, 'services', 'api.js'), 'utf8');
const appSrc = readFileSync(path.join(root, 'app.js'), 'utf8');

function apiExports() {
  return [...apiSrc.matchAll(/export (?:async function|function|const|class) ([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
}

function appImportedNames() {
  const m = appSrc.match(/import \{([^}]+)\} from '\.\/services\/api\.js'/);
  assert.ok(m, 'app.js must import from services/api.js');
  return m[1].split(',').map((s) => {
    const parts = s.trim().split(/\s+as\s+/);
    return parts[1] || parts[0];
  }).filter(Boolean);
}

function appDefinedNames() {
  const names = new Set();
  for (const m of appSrc.matchAll(/^(?:async )?function ([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of appSrc.matchAll(/^(?:const|let|var) ([A-Za-z_$][\w$]*)\s*=/gm)) names.add(m[1]);
  const w = appSrc.match(/Object\.assign\(window,\{([^}]+)\}\)/);
  if (w) for (const key of w[1].split(',')) names.add(key.trim());
  for (const m of appSrc.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) names.add(m[1]);
  return names;
}

// Regression: these exact functions threw "X is not defined" in production.
test('address and fee API functions are imported by the frontend', () => {
  const imported = appImportedNames();
  for (const name of ['getAddresses', 'createAddress', 'updateAddress', 'deleteAddress', 'getFeeConfig']) {
    assert.ok(apiExports().includes(name), `services/api.js must export ${name}`);
    assert.ok(imported.includes(name), `app.js must import ${name}`);
  }
});

test('every api function called by the frontend is imported', () => {
  const imported = new Set(appImportedNames());
  const called = new Set();
  for (const m of appSrc.matchAll(/await ([A-Za-z_$][\w$]*)\(/g)) called.add(m[1]);
  const missing = [...called].filter((name) => apiExports().includes(name) && !imported.has(name));
  assert.deepEqual(missing, [], `api functions used but not imported: ${missing.join(', ')}`);
});

test('every inline UI handler resolves to a defined function', () => {
  const defined = appDefinedNames();
  const allowlist = new Set(['state', 'event', 'this', 'void', 'if', 'CSS', 'document', 'window', 'localStorage', 'navigator', 'history', 'location']);
  const unresolved = new Set();
  for (const m of appSrc.matchAll(/on(?:click|input|change|submit|focus|blur)="([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (!defined.has(m[1]) && !allowlist.has(m[1])) unresolved.add(m[1]);
  }
  assert.deepEqual([...unresolved].sort(), [], `UI handlers with no function: ${[...unresolved].join(', ')}`);
});
