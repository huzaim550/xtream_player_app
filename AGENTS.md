# Manzar (Xtream Player app)

React Native + Expo client (Android phone + Android TV / Fire Stick) for the
self-hosted Xtream Codes server in `~/Documents/xtream` (live at
`https://iptv.manzaronline.site`). The server is a separate repo and is
**read-only** from this project's point of view — never modify it to suit the app.

The app is branded **Manzar** (`app.config.ts` `name`). The slug
(`xtream-player`), the scheme and the Android package id
(`site.manzaronline.xtream`) deliberately keep their original values — the slug
ties the project to its EAS id, and changing the package id would orphan every
existing install's data. Brand assets in `assets/images/` are generated from the
SVG sources; `Palette.brand` is the red that carries it through the UI.

Expo has changed across versions: consult the versioned docs at
https://docs.expo.dev/versions/v56.0.0/ before writing Expo-API code.

## Build

```bash
npm run android:tv      # TV variant  -> emulator TV_1080p (or a Fire Stick)
npm run android:phone   # phone variant
npm start               # Metro (dev client; Expo Go can NOT run this app)
npm run typecheck
npm test                # jest (unit only -- see jest.config.js for why)
```

## Shipping a fix

`expo-updates` is configured against the EAS project, so **JS-only fixes go out
over the air** — `eas update --branch <channel>` — with no rebuild or reinstall.

`runtimeVersion` uses the `appVersion` policy, which makes `version` in
`app.config.ts` the compatibility contract: **bump it whenever you add or
remove a native module.** If you don't, old installs will happily download JS
that calls a native module their APK does not contain, and crash at startup —
which is exactly what adding `expo-file-system` did once already. Native
changes always need a real build and a reinstall.

When something does crash, `(app)/diagnostics.tsx` (Settings → Diagnostics)
shows the last 20 errors with stack traces, read from disk so the crash from
the *previous* launch is the one you see. It is local-only on purpose: a hosted
crash reporter would contradict `src/content/privacy.ts`. Everything written
there passes through `redact()` first, because stream URLs carry the password
as a path segment — `src/store/__tests__/crashLog.test.ts` guards that.

- **Expo SDK 56, pinned.** `react-native` is aliased to `react-native-tvos@0.85-stable`.
  Never `expo upgrade` without confirming a matching `<version>-stable` tag exists
  on react-native-tvos first.
- `.npmrc` sets `legacy-peer-deps=true` because npm reads the fork's `0.85.3-3`
  as a prerelease, which fails every plain peer range (e.g. reanimated's
  `react-native@"0.81 - 0.85"`). Do not remove it.
- `EXPO_TV=1` must be set for **both** prebuild and run — the npm scripts handle
  this. Phone and TV builds use different package ids
  (`site.manzaronline.xtream` / `.tv`) so they coexist on one device.
- `android/` and `ios/` are **generated** (`expo prebuild`) and gitignored.
  Never commit them; put nothing in them by hand. Gradle's JDK pin lives in
  `~/.gradle/gradle.properties` (JDK 21 via the `~/.jdks/jdk-21` symlink —
  Fedora only ships JDK 25, which AGP doesn't support).
- The tvos fork's typings omit `StyleSheet.absoluteFillObject`; use
  `ABSOLUTE_FILL` from `src/ui/platform.ts`.

## Architecture

- `src/app/**` — expo-router routes only; no logic. Screens read from stores.
- `src/api/**` — the only code that talks to the server. `client.ts` is the
  single choke point; `normalize.ts` is the only place wire shapes are coerced.
  `download.ts` owns the disk and the transfer, nothing about *which* titles.
- `src/store/**` — zustand + AsyncStorage. Password lives in SecureStore only.
  `progress.ts` and `downloads.ts` both denormalise title/poster/ext into each
  record on purpose, so their screens render *and play* with no catalogue, no
  session and no network.
- `src/ui/**` — `Focusable` is the one interactive primitive (D-pad + touch);
  never use a bare Pressable/Touchable. Design tokens in `platform.ts` branch
  on `IS_TV` once — components must not.
- `src/content/**` — long-form copy (the privacy policy) as data, so screens
  stay pure presentation.

Navigation is **five tabs** — Home, Movies, Series, Search, My List. Downloads,
Notifications, Settings, the privacy policy and sign-out live behind the header
avatar (`AccountSheet`), and `AppHeader`'s `SUBPAGE_ROUTE` is what gives those
pushed screens a back control. The bell beside the avatar is the one shortcut
that earned space in the header: a badge nobody can find is not a notification. My List earns a tab because it is a browsing
destination like the other four; Downloads is somewhere you visit occasionally.
Six tabs on a phone makes every one of them too narrow to hit — do not add one
without taking one away.

## Offline downloads

- Files live in `Paths.document/downloads` (app-private, invisible to the
  gallery and other apps, gone on uninstall) — **never** `Paths.cache`, which
  the system may delete mid-download. This is OS sandboxing, not encryption,
  and `src/content/privacy.ts` says so.
- One transfer at a time; the rest sit `queued`. Foreground only — the native
  task's JS handle does not survive the process, so `hydrate()` re-marks
  anything left mid-transfer as `failed` with a retry.
- A finished download is played by passing `localUri` to `/player`, which then
  builds **no** stream URL at all: no request, no connection slot, no network.
  Progress is keyed on `movieKey`/`episodeKey`, so offline and streamed
  playback share one resume position.
- The same two server rules as playback apply to the transfer: build the URL
  inside the start handler (connection slots), and set no `headers`.

## In-app notifications

Announcements composed on the mybuild dashboard (`/notifications`) and **pulled**
by the app: `src/store/notifications.ts` polls
`updates.manzaronline.site/api/notifications/xtream-player-app` on launch and on
foreground, rate-limited to one request per five minutes. There is no push, no
device token and no registration — which is exactly why the whole feature
shipped over the air with no native module and no new APK. A closed app shows
nothing until it is next opened; that is the deal, and the dashboard says so.

- A sync **replaces** the list rather than merging it, so retracting a message on
  the dashboard actually removes it. A failed poll changes nothing, so the inbox
  still reads offline.
- Read state is local and separate from the list; marks for messages that stop
  being served are pruned on each sync so the file cannot grow forever.
- `coerce()` in the store is the only place a wire record becomes an app record —
  same rule as `src/api/normalize.ts`. `linkUrl` is re-checked for `http(s)` on
  the device even though the server already refuses anything else, because that
  URL goes to the system browser.
- Two surfaces, one store: the bell badge in `AppHeader` plus the inbox at
  `(app)/notifications.tsx`, and `NotificationBanner` in the `(app)` layout,
  which shows only the newest unread one and is always dismissible.
- `src/content/privacy.ts` names this call. If the app ever sends anything about
  the user to that host, that file has to change with it.

## Server contract hazards (all verified against the server source)

- **Auth failure is HTTP 200** with `user_info.auth === 0` — never a 401.
- **10 failed logins per IP per 5 min throttles the IP**, and the same check
  gates `/movie` and `/series` — so never auto-retry credentials anywhere.
- **Stream URLs grab a connection slot held for 30 min** (max 2 per user).
  Build them only inside a play handler (`src/api/streamUrl.ts` documents this).
  Playing via anything other than `/movie|/series/...` also skips the server's
  play analytics.
- `get_vod_info` for an unknown id returns `{"info":{},"movie_data":{}}` with 200.
- `get_series_info` season keys are **strings**; sort numerically or seasons
  render as 1, 10, 2. Episode ids are strings (they are URL path segments).
- Poster URLs carry an HMAC token — use them verbatim from responses, never
  construct one. `""` means no artwork.
- **There is no wide artwork and no trailer.** `backdrop_path` is present but
  hardcoded `[]` in both `get_vod_info` and `get_series_info`, and
  `youtube_trailer` is always `""`. The only image is the 2:3 poster — which is
  why `src/ui/Hero.tsx` composes its banner from a blurred copy of the poster
  rather than fetching a backdrop. Do not "fix" this by building a URL.
- **There is no popularity signal to rank by.** `get_vod_streams` hardcodes
  `rating`, year, plot, cast and genre to empty in the *list* response (real
  values only come from `get_vod_info`); series `rating` is hardcoded `"0"`
  everywhere; and series `last_modified` is always the current time, so it is
  useless for recency. Any chart must therefore be derived locally and labelled
  honestly — see the Top 10 row in `(app)/home.tsx`.
- Never set `headers` on a video source: OkHttp replays them onto the presigned
  R2 redirect and breaks the SigV4 signature.
- First catalogue call after the server's 300s scan-cache expiry blocks on an
  R2 listing; through the Cloudflare tunnel that can be ~10s. Timeouts: 20s
  normal, 60s first catalogue fetch.

## Local dev against the server

Run the Flask server from `~/Documents/xtream` on `0.0.0.0:8000`; reach it at
`http://10.0.2.2:8000` from an emulator (cleartext is enabled in dev builds
only). Offline test users (no R2 needed) are in the server repo's
`tests/conftest.py`. The de-facto wire contract is `tests/test_player_api.py`.
