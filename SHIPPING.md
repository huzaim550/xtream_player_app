# Shipping Manzar

How a change on this machine becomes a change on somebody's phone — **the
sideloaded build**, installed by hand from the Axe server.

> The Play Store build is a different binary from the same tree, with no
> updater, no OTA and its own signing key. **See `PLAY.md`.** Nothing in this
> document applies to it, and in particular `axe build --type update` cannot
> reach a phone that installed from Play.

Builds run on **Axe Build** — the self-hosted build server in
`~/Documents/android_app_builder`, reachable at `http://192.168.1.200:3000` on
the LAN and at `https://updates.manzaronline.site` through the Cloudflare
tunnel. It replaces EAS: `axe build` instead of `eas build`, a self-hosted
manifest instead of `u.expo.dev`. `eas.json` is still in this repo but nothing
uses it.

---

## When to use what

Everything comes down to one question: **did you touch anything native?**

| You changed | Ships as | Command | What the user does |
|---|---|---|---|
| A screen, a component, a store, a hook | **OTA** | `axe build --type update --release` | nothing — opens the app twice |
| Copy, colours, layout, an icon *inside* the JS | **OTA** | same | nothing |
| An image in `assets/` used by JS | **OTA** | same | nothing |
| A pure-JS dependency (zustand, date-fns…) | **OTA** | same | nothing |
| **A new native module** (`expo-*` with native code) | **APK** | bump `version`, then `axe build --type apk --ota --release` | taps through an install prompt |
| Removing a native module | **APK** | same | same |
| `plugins` in `app.config.ts` | **APK** | same | same |
| Expo SDK / React Native version | **APK** | same | same |
| Android permissions, package id, splash, launcher icon | **APK** | same | same |
| `versionCode` / `version` | **APK** | same | same |

**The test for "is it native":** if the change only exists in `.ts`/`.tsx`
files and `assets/`, it is JS. If it changes what `expo prebuild` generates
into `android/`, it is native. When unsure, look at whether you added a package
that has an `android/` folder in `node_modules/<pkg>/` — if it does, it is
native and needs an APK.

**The cost of getting it wrong is asymmetric.** Shipping a native change as an
OTA gives every existing install a JS bundle that calls native code its APK
does not contain, and the app crashes at launch. Shipping a JS change as an APK
just wastes fifteen minutes. When in doubt, build the APK.

---

## The two commands

```bash
# JS-only fix. ~20-90 seconds. Live immediately.
axe build --type update --release

# Anything native. 8-15 minutes. Must be installed by hand.
axe build --type apk --ota --release
```

Both are run **from this project directory**. `--release` is what makes a build
live; without it the build just sits on the dashboard doing nothing, which is
sometimes what you want (see *Build now, release later*).

`--ota` on an APK build also exports a JS bundle from the same source. Always
pass it: it is what makes the new APK able to receive future OTA updates, and
it costs nothing.

### What `--type apk --ota --release` actually does to phones

It produces two artifacts and flips two switches: the APK goes on the APK
channel, and a JS bundle **tagged with your source tree's `runtimeVersion`**
goes on the OTA channel. Who receives what is decided entirely by whether you
bumped `version`:

| Bumped `version`? | Phones on the old version | Phones on the new APK |
|---|---|---|
| **Yes** (1.2.0 → 1.3.0) | get **nothing** over the air — they must install the APK by hand | receive this bundle, and every later `--type update` |
| **No** (still 1.2.0) | pick the JS up **over the air**, two launches, no download | — |

The manifest endpoint looks a released bundle up by `(slug, channel,
runtimeVersion)`, so a 1.2.0 phone can never be served a 1.3.0 bundle. That is
the safety gate working.

**The trap is the second row.** If you are building an APK *because* you added
a native module, and you leave `version` alone, that OTA bundle lands on phones
whose APK does not contain the module — and they crash at launch. The `--ota`
flag turns "some people haven't updated yet" into an outage. Bump `version`.

Releasing a 1.3.0 OTA does **not** retire the 1.2.0 one: the demotion is scoped
to the same `runtimeVersion`, so phones still on the old binary keep the last
bundle that works for them while they take their time upgrading.

And if you did not bump `version` because the change was pure JS — you did not
need an APK build at all. `--type update` does the same job in 20 seconds.

---

## What actually gets uploaded

`axe build` tars **your working tree** — not your last commit. Uncommitted
edits ship. If you want what is live to match a commit, commit first.

Excluded from the upload: `node_modules`, `.git`, `android`, `ios`, `.expo`,
`dist`, `build`, `web-build`, `axe.json`, and any `.apk`/`.aab`/`.tgz`. The
server runs `npm ci` and `expo prebuild` itself from `package-lock.json` and
`app.config.ts`.

Everything else goes, **including `.env`**, which is gitignored. That is
load-bearing rather than a leak: `EXPO_PUBLIC_DEFAULT_SERVER_URL` is inlined
into the bundle at build time, so a build without your local `.env` would ship
a login screen with an empty server field. Keep nothing secret in it — the
comment at the top of `.env.example` says the same thing.

`.npmrc` is uploaded too, which is what keeps `legacy-peer-deps=true` in force
on the server. Without it `npm ci` fails on peer ranges.

---

## The two version numbers, and which one to bump

Both live in `app.config.ts`. They do different jobs and are bumped at
different times.

### `version` (currently `1.3.0`) — the OTA compatibility gate

`runtimeVersion` follows it (`policy: 'appVersion'`). An OTA update is only
ever served to an app reporting the **exact same** runtimeVersion.

**Bump it whenever you add or remove a native module.** Old installs then stop
accepting new JS — which is the point. They keep running the bundle they have
until their user installs the new APK, instead of downloading JS that calls a
native module their APK does not contain and crashing at startup. That is not
hypothetical: adding `expo-file-system` did exactly that once, and `1.2.0`
exists because `expo-navigation-bar` was added.

Two runtimeVersions live side by side happily. A 1.1.0 install keeps getting
1.1.0 updates while a 1.2.0 install gets 1.2.0 ones.

### `android.versionCode` (currently `6`) — the install ordering integer

This is the number Android itself uses to decide what is newer, and the number
`src/hooks/useAppUpdate.ts` compares against
`/api/apps/xtream-player-app/latest` to decide whether to show the in-app
"update available" prompt.

**Bump it on every APK you release.** If you don't, Android may refuse the
install as a downgrade, and the in-app prompt has nothing to compare and never
fires.

OTA-only builds do not need either bump — that is the whole point of an OTA.

---

## What the user has to do

**After an OTA:** open the app, close it fully, open it again. `expo-updates`
downloads the new bundle in the background on the first launch and swaps it in
on the second. One launch is never enough. This is standard expo-updates
behaviour, not an Axe quirk, and `fallbackToCacheTimeout: 0` is why — the app
refuses to block its splash screen on a network call.

**After an APK:** `useAppUpdate` fires on launch, sees a higher `versionCode`
than the running build, and offers the download. Tapping it hands the URL to
Android's download manager, which shows the system install prompt. Installing
over the old build keeps all app data. There is no automatic path here — an APK
always needs a human to tap Install.

---

## Recipes

### Ship a JS fix

```bash
npm run typecheck && npm test        # the server will not do this for you
git commit -am "..."                 # so what is live matches a commit
axe build --type update --release
```

Then open the app twice on the phone.

### Ship a native change

```bash
# 1. edit app.config.ts:
#      version: '1.2.0'  ->  '1.3.0'      (adds/removes a native module)
#      versionCode: 4    ->  5            (always, for a released APK)
npm run typecheck && npm test
axe build --type apk --ota --release
```

Fifteen minutes later, install the APK on your own phone from
`http://192.168.1.200:3000` and check it launches before telling anyone else.
Every other install will offer itself the update on next launch.

### Build now, release later

```bash
axe build --type update              # no --release: builds, stays dark
axe release <buildId>                # promote when you are ready
axe release <buildId> --ota          # OTA channel only
axe release <buildId> --apk          # APK channel only
```

The two channels are separate switches on purpose: promoting an OTA-only build
must not retire the APK phones are still downloading.

### Roll back a bad OTA

```bash
axe release <previous-good-buildId> --ota
```

Find the id on the dashboard. The bad bundle is retired the moment the older
one is promoted, and phones pick the rollback up on their next launch — same
two-launch rule. There is no rollback for an APK: ship a higher `versionCode`.

### Check what is actually live

```bash
# Does the OTA manifest answer for this runtimeVersion? 200 = yes.
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "expo-runtime-version: 1.2.0" \
  -H "expo-platform: android" \
  -H "expo-protocol-version: 1" \
  -H "expo-channel-name: production" \
  https://updates.manzaronline.site/api/updates/xtream-player-app/manifest

# What APK is being offered to the in-app prompt?
curl -sS https://updates.manzaronline.site/api/apps/xtream-player-app/latest
```

A 404 on the first means nothing is released **for that runtimeVersion** — the
usual cause of "the update never arrives".

### Cancel a build

```bash
axe cancel <buildId>
```

Only one build runs at a time, so this is also how you unblock a queue.

### Rebuild without re-uploading

```bash
axe rebuild <buildId>          # same source, same settings
axe rebuild <buildId> --ota    # same source, add an OTA bundle this time
```

Useful when a Gradle failure was really a flaky download.

---

## This project's coordinates

| Thing | Value |
|---|---|
| Axe slug | `xtream-player-app` (in `axe.json`) |
| Expo slug | `xtream-player` (in `app.config.ts`) |
| Channel | `production` |
| Dashboard | `http://192.168.1.200:3000` |
| Notifications composer | `http://192.168.1.200:3000/notifications` |
| OTA manifest | `https://updates.manzaronline.site/api/updates/xtream-player-app/manifest` |
| APK metadata | `https://updates.manzaronline.site/api/apps/xtream-player-app/latest` |
| CLI config | `~/.axebuild/config.json` (server URL + token) |

**The two slugs are different, and that is not a mistake.** The Expo slug stays
`xtream-player` because it is tied to the original EAS project id; the Axe
project was created as `xtream-player-app`, which is why every URL above says
`-app`. Neither can be renamed without breaking something, so just use the
right one for the right place.

Timings measured on this project: an OTA-only build is about **20 seconds**; a
full APK is 8–15 minutes warm, 20–30 on a cold cache.

---

## Notifications

The in-app inbox (`src/store/notifications.ts`) is fed by the same box:
compose at `http://192.168.1.200:3000/notifications`, pick this app, send.

It is a **pull** channel — the app asks on launch and on foreground, rate
limited to once per five minutes. A closed app shows nothing until it is
opened, there are no device tokens and no registry. That is what let the whole
feature ship over the air with no native module.

Retracting a message on the dashboard genuinely removes it from the app,
because a sync replaces the list rather than merging into it.

---

## When it doesn't work

| Symptom | Cause | Fix |
|---|---|---|
| OTA never arrives | `runtimeVersion` mismatch — the phone is on 1.1.0, the update was built from a 1.2.0 tree | check Settings → version on the phone against the build's `Runtime` on the dashboard; a phone on an older version needs the APK |
| OTA never arrives | app was only opened once | open it twice |
| OTA never arrives | build was never released | look for the green `live` pill on the dashboard |
| "Update available" never shows | `versionCode` not bumped | bump it and rebuild |
| "Update available" never shows | no APK build released yet | `curl .../api/apps/xtream-player-app/latest` — a 404 means nothing is on the APK channel |
| App crashes at launch after an update | a native change went out as an OTA | roll back the OTA, bump `version`, ship an APK |
| Build fails in `npm ci` | `package-lock.json` out of step with `package.json` | run `npm install` locally, commit the lockfile, rebuild |
| Build fails in `expo prebuild` about a package id | `android.package` missing | it is set here; check nothing removed it |
| Build stuck at `queued` | another build is running — one at a time | wait, or cancel the other |
| Build fails only on the server | the server builds from `package-lock.json` + your `.env`, not your `node_modules` | make sure both are correct on disk before building |

The full Gradle log for any build stays on the dashboard after it fails — read
that before guessing.

---

## Reference

The complete Axe documentation is `~/Documents/android_app_builder/DOCS.md`
(server setup, HTTP API, tunnel config, disk management). This file covers only
what shipping *this* app requires.
