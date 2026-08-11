#!/usr/bin/env node
/**
 * Build the Play Store artifact.
 *
 * Why this exists rather than a one-line npm script: `axe build` tars the
 * working tree and the *server* runs `expo prebuild`, so an environment
 * variable exported in your shell never reaches the thing that reads it.
 * The only channel is `.env`, which is uploaded with everything else
 * (SHIPPING.md, "What actually gets uploaded").
 *
 * So a store build means editing `.env`, building, and editing it back -- and
 * the failure mode of forgetting the last step is that your next sideload build
 * silently becomes a Play build with no updater, which nobody would notice
 * until a phone stopped receiving updates. This does the edit, the build and
 * the restore, and restores in a `finally` so a Ctrl-C or a failed build still
 * puts `.env` back.
 *
 *   npm run build:play          # AAB, uploaded to the Axe dashboard
 *   npm run build:play -- --apk # APK instead, for testing the store flavour
 *                               # on a device before uploading anything
 *
 * The artifact lands on the Axe dashboard; download it there and upload it to
 * the Play Console by hand. See PLAY.md.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = resolve(ROOT, '.env');

/**
 * Variables the store build must control, whatever `.env` happens to say.
 *
 * DISTRIBUTION is the switch itself. The other two are belt and braces: both
 * are already forced by app.config.ts for the Play flavour, but a `.env` that
 * still carries them is a thing a reviewer could be shown, and stripping them
 * here means the uploaded tree matches the built artifact.
 */
const FORCED = { EXPO_PUBLIC_DISTRIBUTION: 'play' };
const STRIPPED = ['EXPO_PUBLIC_ALLOW_CLEARTEXT', 'EXPO_PUBLIC_DEFAULT_SERVER_URL'];

/** Rewrite the file in place, keeping comments and ordering. */
function applyOverrides(original) {
  const lines = original.split('\n');
  const kept = lines.filter((line) => {
    const key = line.match(/^\s*([A-Z0-9_]+)\s*=/)?.[1];
    return !key || (!STRIPPED.includes(key) && !(key in FORCED));
  });
  const forced = Object.entries(FORCED).map(([k, v]) => `${k}=${v}`);
  return [
    '# Written by scripts/build-play.mjs for the duration of one build.',
    '# If you are reading this in a checked-out tree, that build crashed hard',
    '# enough to skip its own cleanup -- restore this file from .env.example.',
    ...forced,
    '',
    ...kept,
  ].join('\n');
}

const buildType = process.argv.includes('--apk') ? 'apk' : 'aab';
const existed = existsSync(ENV_PATH);
const original = existed ? readFileSync(ENV_PATH, 'utf8') : '';

let status = 1;
try {
  writeFileSync(ENV_PATH, applyOverrides(original));
  console.log(`.env pinned to EXPO_PUBLIC_DISTRIBUTION=play; building ${buildType}…\n`);
  // No --ota. The store binary has updates disabled, so a bundle published
  // against its runtimeVersion would be dead weight at best -- and at worst a
  // sideloaded 1.3.0 phone picking up a bundle built from a store tree, with
  // the updater compiled out of it.
  //
  // No --release either, and that one is load-bearing. Releasing with no flags
  // promotes "whatever this build produced", and the server counts an aab as
  // something the APK channel can serve -- so a store build would retire the
  // sideload APK and offer phones a file Android cannot install (useAppUpdate
  // compares versionCode and never looks at buildType). A store artifact has
  // nowhere to be released to anyway: it goes to Play, by hand, from the
  // dashboard. Promote sideload builds explicitly with `axe release <id>`.
  status =
    spawnSync('axe', ['build', '--type', buildType], {
      cwd: ROOT,
      stdio: 'inherit',
    }).status ?? 1;
} finally {
  if (existed) writeFileSync(ENV_PATH, original);
  else if (existsSync(ENV_PATH)) unlinkSync(ENV_PATH);
  console.log('\n.env restored.');
}

process.exit(status);
