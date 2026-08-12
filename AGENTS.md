# Manzar (Xtream Player app)

React Native + Expo client (Android phone + Android TV / Fire Stick) for the
self-hosted Xtream Codes server in `~/Documents/xtream` (live at
`https://iptv.manzaronline.site`). The server is a separate repo and is
**read-only** from this project's point of view — never modify it to suit the app.

The app is branded **Manzar** (`app.config.ts` `name`). The slug
(`xtream-player`), the scheme and the Android package id
(`site.manzaronline.xtream`) deliberately keep their original values — the slug
ties the project to its EAS id, and changing the package id would orphan every
existing install's data. The mark is a television with rabbit-ear antennas and a
play triangle; every raster in `assets/images/` and `assets/store/` is generated
from the SVG sources in `assets/brand/` and none should be hand-edited — see
that directory's README, which documents the two pieces of geometry that will
bite you. `Palette.brand` is the red that carries it through the UI.

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

**`SHIPPING.md` is the full guide** — read it before building anything.
**`PLAY.md` is the Play Store one**, and they describe different binaries:
`EXPO_PUBLIC_DISTRIBUTION=play` drops the in-app APK updater (a Device and
Network Abuse violation), disables self-hosted OTA, forces cleartext off and
removes the server prefill. `src/distribution.ts` is the switch and documents
how much of that is compile-time and how much is runtime. The short version of
the sideload path:

Builds run on the self-hosted Axe server (`~/Documents/android_app_builder`),
not EAS. `eas.json` is still here but nothing uses it.

```bash
axe build --type update --release     # JS-only fix, ~20s, user opens the app twice
axe build --type apk --ota --release  # anything native, 8-15 min, user installs by hand
```

`axe build` uploads the **working tree**, not your last commit — including
`.env`, which is gitignored and load-bearing (`EXPO_PUBLIC_DEFAULT_SERVER_URL`
is inlined at build time).

`runtimeVersion` uses the `appVersion` policy, which makes `version` in
`app.config.ts` the compatibility contract: **bump it whenever you add or
remove a native module.** If you don't, old installs will happily download JS
that calls a native module their APK does not contain, and crash at startup —
which is exactly what adding `expo-file-system` did once already. Native
changes always need a real build and a reinstall. `android.versionCode` is a
separate counter and must go up on every released APK, or Android refuses the
install and `useAppUpdate` never offers it.

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

**React Compiler is on** (`app.config.ts` `experiments.reactCompiler`), and it
**discards the dependency array you write**, inferring one from what the
callback actually closes over. So a screen must derive from the state it
selected, never by wrapping a store getter:

```ts
const rows = useMemo(() => list(), [list, entries]);        // FROZEN AT MOUNT
const rows = useMemo(() => sortedDownloads(entries), [entries]);  // correct
```

`list()` reads `get().entries` internally, so the callback closes over nothing
reactive and the compiler emits `if ($[0] !== list)` — computed once, never
again. That is what left deleted downloads on screen and progress bars stuck at
their first sample until the app was restarted. Every getter with a screen-side
caller therefore also exists as a pure function of the map — `sortedDownloads`,
`downloadedBytes`, `continueWatchingFrom`, `lastEpisodeIn` — and the store
methods delegate to those. Selectors are *not* affected
(`useProgress((s) => s.resumeAt(k))` is fine); zustand re-runs those on every
store change. To check what the compiler did to a file:
`npx babel --plugins babel-plugin-react-compiler <file>`.

Navigation is **five tabs** — Home, Movies, Series, Search, My List. Downloads,
Notifications, Settings, the privacy policy and sign-out live behind the header
avatar (`AccountSheet`), and `AppHeader`'s `SUBPAGE_ROUTE` is what gives those
pushed screens a back control. The bell beside the avatar is the one shortcut
that earned space in the header: a badge nobody can find is not a notification. My List earns a tab because it is a browsing
destination like the other four; Downloads is somewhere you visit occasionally.
Six tabs on a phone makes every one of them too narrow to hit — do not add one
without taking one away.

## The player screen owns no window state

`/player` is the only route that is landscape, and the only one with no system
bars. **All of that is declared, never imperative.** Orientation lives in the
route's `orientation: 'landscape'` option (against `'portrait'` on the root
`screenOptions`); the navigation bar is `<NavigationBar hidden />` mounted in
the playback tree.

This is not style. Playback used to call
`ScreenOrientation.lockAsync()` on mount and again on unmount, which drives
`setRequestedOrientation()` on the Activity from JS on its own schedule — and
it fired while react-native-screens was attaching and detaching the fragments
either side of the transition. Backing out of a film landed on a blank native
surface with the entire app gone from it: a grey screen, and then a white one,
that survived three rounds of fixes aimed at the navigation. Anything
lifecycle-tied (a route option, a mounted element) is owned by the same system
that owns the transition and cannot race it. **Do not reintroduce an imperative
window call here.**

- `VideoView` must keep `useExoShutter`. expo-video sets the video surface to
  `alpha = 0` on construction and brings it back only inside its own
  `onRenderedFirstFrame`, which in SDK 56 is guarded by
  `if (player.currentVideoView == this)` — a guard 3.x does not have. When the
  first frame arrives at a moment that guard is false, nothing ever re-runs it,
  and the film plays to completion into an invisible surface: **audio over a
  black picture, every title, no error anywhere.** `useExoShutter` opts into
  media3's own shutter instead — surface alpha stays 1, PlayerView covers it
  until its own first frame, on a listener with no such guard. Verified by
  diffing against `~/Desktop/kaizen-app`, which plays the same server fine on
  expo-video 3.0.16.
- `expo-screen-orientation` is still a dependency with no importer. That is
  deliberate: it is a native module, so keeping it in the APK is what would let
  a landscape regression be fixed over the air rather than with another build.
- The route also sets `statusBarHidden` and `navigationBarHidden`.
  `statusBarHidden` works; `navigationBarHidden` did **not** hide the
  back/home/recents bar on a real device, which is why expo-navigation-bar was
  added despite costing a rebuild. Both are left set — they are correct where
  they are honoured.
- The back arrow in `PlayerControls` is load-bearing, not decoration: with the
  system bars gone it is the only always-available way out once the controls
  are up. Do not demote it.

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

## Advertising

AdMob, on unconditionally for every account — the Xtream server has no say in
this; `src/store/ads.ts` used to read a per-account flag off the login
handshake (`manzar_ads`), but that coupling was removed, and the server repo
is read-only from here regardless. The one thing that turns ads off now is the
**Remove Ads subscription** below, bought through Google Play — not a server
setting.

- Placement counts (`DEFAULT_ADS_CONFIG` in `src/store/ads.ts`) are fixed in
  the app now, not server-tunable. Changing them needs an app update, not a
  dashboard checkbox.
- Every pure function in `src/store/ads.ts` (`adsOn`, `bannerOn`, `preRollOn`,
  `midRollPoints`) takes a `purchased: boolean` and returns the "no ads"
  answer when true. Adding a new ad placement means adding it to this file
  *and* threading that same boolean through its call site — the compiler
  will not catch a placement that forgets to check it.
- `src/ads/**` is the only code that imports `react-native-google-mobile-ads`,
  and `useAdsInit` skips `initAds()` entirely once Remove Ads is owned — no
  Google network call at all for someone who paid specifically not to see one.

### Remove Ads (Google Play Billing subscription)

- `src/iap/index.ts` is the only file that imports `react-native-iap`, same
  boundary role `src/ads/index.ts` plays for AdMob. Everything in it no-ops
  when `!IS_PLAY` (`src/distribution.ts`) — Play Billing does not exist on the
  sideloaded build, so that build keeps ads on with no purchase option.
- There is no backend and nothing to verify a receipt against. Google's own
  `getAvailablePurchases()` answer *is* the entitlement — `src/store/purchases.ts`
  caches it to disk only so a cold start knows the answer before Play has
  responded, never as the source of truth. A failed check (offline, Play
  unreachable) keeps the last cached value rather than assuming the
  subscription lapsed.
- Deliberately **not** reset on sign-out or by `wipeAllData()`'s per-store
  calls, unlike `useAds`: this entitlement belongs to the Google account /
  device, not the Xtream login. The wipe's raw-key backstop still deletes the
  cached value along with everything else, which is harmless — the next
  `refresh()` re-derives it from Google in seconds.
- `react-native-iap` ships its own Expo config plugin (`withIAP`), listed in
  `app.config.ts`'s `plugins`. It is not optional decoration: the library
  declares an amazon/play Gradle product-flavor split internally, and without
  the plugin's `missingDimensionStrategy "store", "play"` line, `expo
  prebuild` cannot resolve which flavor to build and fails outright — on
  *both* distributions, not just the Play one.
- Pinned to the `12.x` line (`react-native-iap@^12.16.4`) rather than the
  current major, which requires `react-native-nitro-modules` (a New
  Architecture native-module ecosystem this project has never used) as a peer.
  12.x is the last classic-bridge release and is not deprecated; check before
  moving off it, same caution as the AdMob pin below.
- The consent form is a modal over whatever is on screen, which is why
  `useAdsInit` is mounted in `(app)` and never in the player.
- The player's ad breaks read the **`timeUpdate` payload**, never the player
  object, so the one thing running every second cannot be what touches a
  released player. `adShowing` drops `PlayerControls` for the same reason `left`
  does, and `VideoView` stays mounted throughout.
- **Returning from a full-screen ad re-attaches the video surface**, which is
  the failure the expo-video patch exists for — so the `useExoShutter` flip runs
  again on every `adGeneration` bump. It used to be a one-shot at mount; an ad
  is the thing that made that insufficient.
- Ads never run over a downloaded file (choosing to download is choosing to
  watch offline) or on TV (no dismiss control a remote can reach).
- **`react-native-google-mobile-ads` is pinned to 16.0.0**, and moving it needs
  a check first. 16.4.0 pins `play-services-ads:25.4.0`, whose classes carry
  Kotlin **2.3.0** metadata; this project compiles with Kotlin 2.1.0, and an
  older compiler cannot read newer metadata, so every Gradle build dies with
  `Module was compiled with an incompatible version of Kotlin`. 16.0.0 pins
  24.6.0, which predates that. Before upgrading, check
  `npm view react-native-google-mobile-ads@<v> sdkVersions.android.googleMobileAds`
  — anything on the 25.x line needs `kotlinVersion` raised in
  expo-build-properties at the same time, which recompiles every native module.

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
`http://10.0.2.2:8000` from an emulator. Cleartext HTTP is an explicit opt-in —
set `EXPO_PUBLIC_ALLOW_CLEARTEXT=1` in `.env` and rebuild, or Android blocks
every plain-http request. It used to key off `NODE_ENV`, which nothing sets on
the Axe build server, so released builds were shipping cleartext enabled; never
put that flag in a build you release. Offline test users (no R2 needed) are in the server repo's
`tests/conftest.py`. The de-facto wire contract is `tests/test_player_api.py`.
