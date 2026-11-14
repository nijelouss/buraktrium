import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUpdaterJson, expectedPlatforms } from './build-updater-json.mjs';

// A Windows-only release as tauri-action uploads it.
const ASSETS = [
  'Buraktrium_1.42.0_x64-setup.exe',
  'Buraktrium_1.42.0_x64-setup.exe.sig',
  'latest.json',
];

const sigsFor = (names) =>
  Object.fromEntries(names.filter((n) => n.endsWith('.sig')).map((n) => [n, `sig-of:${n}\n`]));

const build = (assetNames, signatures = sigsFor(assetNames)) =>
  buildUpdaterJson({
    repo: 'nijelouss/buraktrium',
    version: '1.42.0',
    pubDate: '2026-11-14T12:00:00.000Z',
    assetNames,
    signatures,
  });

test('emits every platform key the shipped updater resolves', () => {
  const manifest = build(ASSETS);
  assert.deepEqual(Object.keys(manifest.platforms).sort(), ['windows-x86_64', 'windows-x86_64-nsis']);
  assert.equal(manifest.version, '1.42.0');
  assert.equal(manifest.pub_date, '2026-11-14T12:00:00.000Z');
  assert.equal(manifest.notes, '');
});

test('points at the NSIS installer with its trimmed signature', () => {
  const { platforms } = build(ASSETS);
  assert.deepEqual(platforms['windows-x86_64-nsis'], {
    signature: 'sig-of:Buraktrium_1.42.0_x64-setup.exe.sig',
    url: 'https://github.com/nijelouss/buraktrium/releases/latest/download/Buraktrium_1.42.0_x64-setup.exe',
  });
  assert.deepEqual(platforms['windows-x86_64'], platforms['windows-x86_64-nsis']);
});

test('refuses to build when the installer is missing', () => {
  assert.throws(() => build(ASSETS.filter((n) => !n.endsWith('setup.exe'))), /Buraktrium_1\.42\.0_x64-setup\.exe/);
});

test('refuses an artifact whose signature file is empty', () => {
  const sigs = sigsFor(ASSETS);
  sigs['Buraktrium_1.42.0_x64-setup.exe.sig'] = '  \n';
  assert.throws(() => build(ASSETS, sigs), /Buraktrium_1\.42\.0_x64-setup\.exe\.sig/);
});

test('artifact names follow the version', () => {
  assert.equal(expectedPlatforms('2.0.1')['windows-x86_64-nsis'], 'Buraktrium_2.0.1_x64-setup.exe');
});
