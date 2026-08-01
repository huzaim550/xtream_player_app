# Xtream Player app

React Native + Expo client (Android phone + Android TV / Fire Stick) for the
self-hosted Xtream Codes server in `~/Documents/xtream` (live at
`https://iptv.manzaronline.site`). The server is a separate repo and is
**read-only** from this project's point of view — never modify it to suit the app.

Expo has changed across versions: consult the versioned docs at
https://docs.expo.dev/versions/v56.0.0/ before writing Expo-API code.

## Build

```bash
npm run android:tv      # TV variant  -> emulator TV_1080p (or a Fire Stick)
npm run android:phone   # phone variant
npm start               # Metro (dev client; Expo Go can NOT run this app)
npm run typecheck
```

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
- `src/store/**` — zustand + AsyncStorage. Password lives in SecureStore only.
- `src/ui/**` — `Focusable` is the one interactive primitive (D-pad + touch);
  never use a bare Pressable/Touchable. Design tokens in `platform.ts` branch
  on `IS_TV` once — components must not.

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
