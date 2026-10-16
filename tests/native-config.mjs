// Regression tests for F1 (master audit): native GPS/camera/photo features
// require platform permissions, otherwise they fail silently on installed apps.
// Pure static checks over tracked config files — no device needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest = readFileSync(path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
const plist = readFileSync(path.join(root, 'ios', 'App', 'App', 'Info.plist'), 'utf8');

test('android declares location, camera and photo permissions', () => {
  for (const perm of [
    'android.permission.INTERNET',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.CAMERA',
    'android.permission.READ_MEDIA_IMAGES',
  ]) {
    assert.ok(manifest.includes(`android:name="${perm}"`), `AndroidManifest must declare ${perm}`);
  }
});

test('ios declares location, camera and photo usage descriptions', () => {
  for (const key of [
    'NSLocationWhenInUseUsageDescription',
    'NSCameraUsageDescription',
    'NSPhotoLibraryUsageDescription',
  ]) {
    assert.ok(plist.includes(`<key>${key}</key>`), `Info.plist must contain ${key}`);
  }
});

test('capacitor app identity matches across platforms', () => {
  const config = JSON.parse(readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
  assert.equal(config.appId, 'com.farmiqo.app');
  assert.ok(manifest.includes('android:label="@string/app_name"'));
  assert.ok(plist.includes('<string>Farmiqo</string>'));
});
