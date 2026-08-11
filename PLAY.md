# Publishing Manzar on Google Play

Everything the Play Console will ask for, and what this repo already does about
it. `SHIPPING.md` remains the guide for the sideloaded build; this is the store
one, and the two produce **different binaries from the same tree** (see
*The store flavour* below).

Read *Before you spend money* first. It is the part that decides whether the
rest is worth doing.

---

## Before you spend money

**Manzar is the kind of app Play rejects, and the reason is not technical.**

There is a large family of "Xtream Codes / IPTV player" apps on Play, and a
large family of removals to go with them. Reviewers do not read your source.
They install the app, see a login screen asking for a server, and decide whether
this is a general-purpose player or a front end for unlicensed streaming. Apps
in this category get refused under **Intellectual Property** ("we don't allow
apps that facilitate unauthorised access to copyrighted content") far more often
than under anything you can fix in code.

What actually moves that decision, in rough order of weight:

1. **The app must ship with no content and no way to find any.** Manzar
   qualifies: there is no bundled playlist, no directory of servers, no search
   across other people's servers, nothing to play until you type in an address
   you already have. The store flavour also drops the prefilled server address
   (below), which is the single most damning thing a player of this kind can
   have on screen when a reviewer opens it.
2. **The listing must not sell it as a way to watch things.** No "watch
   thousands of movies", no channel names, no service logos, no screenshots of
   film posters you do not own the rights to show. The copy below is written to
   this rule; do not "improve" it in the direction of marketing.
3. **The reviewer must be able to get in.** They will not have a server. If
   App access is left blank they see a login wall, cannot proceed, and reject on
   that alone. See *App access* — this is the most common self-inflicted
   rejection and the easiest to avoid.
4. **What they see once they are in is your real listing.** Whatever account
   you hand them, its library is the app as far as the review is concerned.

**The honest odds.** Points 1–4 are the difference between a likely rejection
and a plausible approval. They are not a guarantee, and nothing in this repo can
make one: an app whose entire purpose is playing video from a server the user
supplies will always be a judgement call by a human who has seen a hundred
piracy front ends that week. Budget for at least one rejection and an appeal.

If it is refused twice on IP grounds, the appeal that sometimes works is a short
factual statement that the app contains no content, no content discovery, and no
default server, and that it is a client for a protocol — not a service. Attach
the privacy policy URL. Do not argue about other apps that are still listed.

---

## The store flavour

`EXPO_PUBLIC_DISTRIBUTION` picks what goes in the binary. It defaults to
`sideload`, so an ordinary `axe build` is unchanged, and anything other than the
two known values throws at config time rather than quietly producing a sideload
binary somebody is about to upload to Play (`app.config.ts`).

| | `sideload` | `play` |
|---|---|---|
| In-app "Install version X" | yes | **no** — and the request is not made |
| APK download endpoint in the bundle | present | **absent** (folded out) |
| Self-hosted OTA (`expo-updates`) | enabled | **disabled** in the manifest |
| Prefilled server address | from `.env` | **absent** from the bundle |
| `usesCleartextTraffic` | follows `.env` | **forced false** |
| Signed with | Android debug key | your upload key |

The updater is the load-bearing one: **downloading and installing an APK is a
Device and Network Abuse violation.** `src/distribution.ts` documents exactly
how much of that is compile-time and how much is runtime — briefly, the branches
are runtime (Metro does no cross-module constant folding, so `SELF_UPDATES`
imported from another module stays a live branch) and the two *strings* that
would look bad in a decompiled artifact are folded out at their own use sites.
Verified with `strings` over the exported Hermes bundle, not assumed:

```
needle              play  sideload
api/apps            0     1        # the APK download endpoint
iptv.manzaronline   0     1        # the prefilled server address
```

To re-verify after any change to those files:

```bash
rm -rf /tmp/p /tmp/s
EXPO_PUBLIC_DISTRIBUTION=play npx expo export --platform android --clear -d /tmp/p
npx expo export --platform android --clear -d /tmp/s
for n in api/apps iptv.manzaronline; do
  echo "$n play=$(grep -ac $n /tmp/p/_expo/static/js/android/*.hbc)" \
       "side=$(grep -ac $n /tmp/s/_expo/static/js/android/*.hbc)"
done
```

`--clear` is not optional. Metro's transform cache is not keyed on
`EXPO_PUBLIC_*`, so without it the second export silently returns the first
one's bundle — which is exactly how a "verified" check can be worthless.

---

## Signing, and the one-way door

The build server signs **`aab` builds only**, with the upload key you give it.
`apk` builds stay on the Android debug key, deliberately: signing those too
would change the signature of the flavour the family already has installed, and
Android refuses an update signed by a different key.

**The consequence is unavoidable and worth understanding before you publish.**
Every sideloaded install is debug-signed. The Play build is not. Neither can
update the other. Moving somebody from one to the other is:

> uninstall → install from Play → sign in again

and uninstalling takes their downloaded files, watch history, saved titles and
stored password with it. There is no migration path; the signature is the app's
identity to Android.

Do **not** solve this by uploading the debug keystore to Play. Its private key
ships inside the Android SDK on every developer machine on earth; anyone could
then sign an update for your package name.

The alternative — giving the store flavour its own `applicationId` so the two
coexist — is worse than it sounds. AdMob binds an app ID to a package name, so a
second package means a second registered AdMob app, a second set of ad unit ids,
and another flavour branch through `src/ads/`. Take the uninstall.

### Generating the upload key

Once, and then never lose it. If it is lost, and Play App Signing has not been
enrolled with a separate app signing key, the listing cannot be updated ever
again.

```bash
keytool -genkeypair -v \
  -keystore manzar-upload.jks -alias manzar-upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

Back it up somewhere that is not this machine, along with both passwords.

Then upload it to the build server (Axe dashboard → the `xtream-player-app`
project → Keystore, or `POST /api/projects/xtream-player-app/keystore` with
`keystore`, `keyAlias`, `storePassword`, `keyPassword`). Without it the AAB is
debug-signed and Play refuses the upload with a message that does not explain
why.

---

## Building the artifact

```bash
npm run build:play            # AAB, the thing you upload
npm run build:play -- --apk   # APK of the same flavour, to test on a device
```

The script exists because `axe build` tars the **working tree** and the *server*
runs `expo prebuild` — so an environment variable exported in your shell never
reaches the thing that reads it. The only channel is `.env`, which is uploaded
with everything else. `scripts/build-play.mjs` pins
`EXPO_PUBLIC_DISTRIBUTION=play`, strips `EXPO_PUBLIC_ALLOW_CLEARTEXT` and
`EXPO_PUBLIC_DEFAULT_SERVER_URL`, builds, and restores `.env` in a `finally` so
a Ctrl-C still puts it back.

Download the AAB from the Axe dashboard and upload it by hand. There is no
Play publishing API wired up, and for a listing that ships a few times a year
there does not need to be.

**Bump `android.versionCode` in `app.config.ts` on every upload.** Play never
lets a code be reused, and the counter is shared with the sideloaded flavour, so
it advances past anything either has used. It is `8` now; `6` is live on
sideloads and `7` was burned locally.

### Verifying the artifact before upload

`npm run prebuild:play` regenerates `android/` with the store settings; then
check the manifest says what this document claims:

```bash
grep -o 'usesCleartextTraffic="[a-z]*"' android/app/src/main/AndroidManifest.xml
grep -A1 'updates.ENABLED' android/app/src/main/AndroidManifest.xml
grep versionCode android/app/build.gradle
```

Expected: `false`, `false`, `8`.

---

## Play Console: what to fill in

### App details

| Field | Value |
|---|---|
| App name | `Manzar` |
| Default language | English (United Kingdom or United States) |
| App or game | App |
| Free or paid | Free |
| Category | Video Players & Editors |
| Package name | `site.manzaronline.xtream` — permanent, cannot be changed after the first upload |

### Store listing copy

**Short description** (80 characters max):

```
Play your own Xtream-compatible media server on your phone. Bring your own URL.
```

**Full description**:

```
Manzar is a player. It does not come with anything to watch.

To use it you need a login for a media server that speaks the Xtream Codes
API — a server address, a username and a password, which you get from whoever
runs that server. If you do not already have one, this app will do nothing for
you. There is no directory of servers, no bundled playlist, and no content of
any kind inside the app.

What it does, once you have signed in to your own server:

• Browse your library as posters rather than a wall of text, with your films
  and series separated and grouped the way your server has them
• Resume where you stopped, on any title, whether you were streaming it or
  playing it offline
• Save titles to My List
• Download to the device and watch with no connection at all — downloads are
  stored inside the app, invisible to your gallery and other apps, and removed
  when you uninstall
• Search your own library
• Hand a stream to VLC or another player when a file uses a codec your device
  cannot decode

On privacy: Manzar has no account of its own, no analytics and no crash
reporting. Your password is kept in the Android keystore. Nothing about what
you watch is sent anywhere except the server address you typed in. Settings →
Delete all app data removes everything the app has stored, in one step.

Some accounts see advertising, and that is a decision made on the server, per
account, not by the app. If it has not been switched on for your account, the
Google advertising software in the app is never started and nothing is sent to
Google. The full privacy policy is inside the app under Settings, and at the
URL on this listing.

Manzar is not affiliated with any streaming service or content provider.
```

That last line is not decoration. Leave it in.

### Graphics

| Asset | Requirement | Where |
|---|---|---|
| App icon | 512×512 PNG, **no alpha** | `assets/store/play-icon-512.png` |
| Feature graphic | 1024×500 PNG | `assets/store/play-feature-graphic-1024x500.png` |
| Phone screenshots | 2–8, min 320px, 16:9 or 9:16 | **you must take these** |

Both generated assets come from the brand SVGs via `./scripts/store-assets.sh`,
so a brand change is one command rather than a hunt through PNGs.

**Screenshots are the gap in this repo** — they have to come off a real device
and nothing here can fabricate them. Take them from the store-flavour APK
(`npm run build:play -- --apk`) on a phone, signed into an account whose library
you are willing to have a reviewer look at. Four is plenty:

1. Home, with rows of posters
2. A title page
3. The player, with controls visible
4. Downloads or Settings — something that shows it is a tool, not a catalogue

**Do not** screenshot the login screen as the first image; it reads as a paywall
in the listing. And be aware every poster in those images is somebody's
copyrighted artwork sitting in your public store listing — if the library you
capture is mainstream commercial film, that is the first thing an IP reviewer
sees. Consider capturing an account stocked with content you have the rights to.

### Privacy policy URL

```
https://manzaronline.site/privacy
```

The page is **generated** from `src/content/privacy.ts` by
`npm run privacy:export`, which writes `../landing_page/public/privacy.html`.
Never hand-edit the published copy: the whole point is that the text a reviewer
reads and the text in the app cannot drift.

Run the export and **deploy the landing page** before submitting. A privacy
policy URL that 404s is an automatic rejection, and it is checked by a machine.

---

## Data safety

Answer this from `src/content/privacy.ts`, which was written against the code.
The short version: **the app collects nothing; Google's ad SDK does, and only
for accounts whose server enabled ads.**

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** — because of AdMob |
| Is all of the user data collected by your app encrypted in transit? | **Yes** |
| Do you provide a way for users to request that their data is deleted? | **Yes** — Settings → Delete all app data |

Data types to declare:

| Type | Collected | Shared | Purpose | Optional? |
|---|---|---|---|---|
| **Device or other IDs** (advertising ID) | Yes | Yes | Advertising or marketing | Yes — off unless the server enables ads |
| **App activity → Other actions** (ad impressions/clicks) | Yes | Yes | Advertising or marketing | Yes — same |

Declare **nothing** for: name, email, user IDs, photos, videos, files, location,
contacts, messages, health, financial info, web browsing, installed apps,
purchase history, search history. None of it is collected. In particular:

- **The server address, username and password are not "collected"** in Play's
  sense. They never leave the device except to the server the user themselves
  entered — which is the app's core functionality, at the user's direction, to
  a first party of their choosing. Play's definition of collection is transfer
  off the device *to you or a third party you engage*; this is neither.
- **Watch history and downloads never leave the device at all.**
- **The announcements request** to `updates.manzaronline.site` carries no user
  data — no id, no username, nothing about what is watched. Nothing to declare.

Mark both declared types **"Data is not collected for children"** and set the
app as not directed at children (below).

### Advertising ID declaration

The app uses `com.google.android.gms.permission.AD_ID`, so tick **yes** on the
advertising ID question in App content → Advertising ID, purpose **Advertising
or marketing** (and Analytics is *not* used).

Worth knowing when the question of "why does it ask for this even with ads off"
comes up: the permission is in the manifest of every install because the Google
component declares it, whether or not ads are enabled for the account. The
privacy policy says so in as many words, deliberately.

### App content → Ads

**"Does your app contain ads?" → Yes.** Even though most accounts will not see
them. "Sometimes, for some users" is still yes, and getting this wrong is a
straightforward policy violation with no upside.

---

## Content rating (IARC questionnaire)

Category: **Utility, Productivity, Communication or Other** — not
Entertainment, and not a video-on-demand service. Manzar is a client.

The question that matters:

> Does the app allow users to access or share user-generated or
> uncontrolled content?

**Answer yes.** The whole app is a window onto a server you do not control and
Google cannot inspect. Answering no would be a misrepresentation, and a
misrepresented rating is itself a policy violation that gets found later, when
it costs more.

Expect the questionnaire to then ask about moderation and reporting tools. There
are none, because there is nothing here to moderate — no user-to-user contact,
no sharing, no comments, no uploads. Answer accordingly and expect a rating in
the **PEGI 16–18 / Mature 17+** band. That is the correct outcome for a player
that can show anything at all, and it is much safer than a low rating that gets
challenged.

Ads themselves are capped at PG in `src/ads/index.ts`
(`maxAdContentRating: PG`), which is a separate control and does not lower the
app's own rating.

### Target audience and content

- Target age group: **18 and over**. Do not tick any bracket under 18; the app
  is not designed for children, and ticking one pulls in the Families policy,
  a designed-for-families review, and stricter ad rules.
- "Is your app designed for children?" → **No.**
- Ads present → **Yes** (as above).

---

## App access — do not skip this

The reviewer has no server, so without credentials they see a login screen and
nothing else. Fill in **App access → All functionality is restricted** and give
them a real, working account:

```
Instructions:

Manzar is a client for a media server that the user provides; it ships with no
content and no default server, so sign-in is required to see anything.

A test account on a server we operate:

  Server URL: https://<the address you want reviewed>
  Username:   <reviewer account>
  Password:   <reviewer password>

Enter all three on the first screen and tap Sign in. The library loads on the
home screen. Any title can be played, or downloaded for offline playback from
the title page.

This account is kept active for review. The app works the same way with any
Xtream-compatible server the user has their own credentials for.
```

Practical notes:

- **Make it a dedicated account**, not yours. Accounts get locked out: the
  server throttles an IP after 10 failed logins in 5 minutes (`AGENTS.md`,
  *Server contract hazards*), and a reviewer mistyping a password three times
  from a shared Google IP is not far-fetched.
- **Give it more than 2 connection slots** if you can. A stream URL holds a slot
  for 30 minutes and the default cap is 2, so a reviewer who opens three titles
  in a row hits "no connections available" and files that as a bug.
- **Set it to never expire**, and check it still works the day you submit, and
  again on every update. An expired reviewer account is a rejection on an app
  that has not changed.
- **Curate what is on it.** See the warning under Screenshots: this library is
  what the review sees, and an IP reviewer looking at a wall of current cinema
  releases has been handed their conclusion.

---

## Pre-submission checklist

Code and artifact:

- [ ] `npm run typecheck` and `npm test` pass
- [ ] `android.versionCode` bumped past every previously uploaded value
- [ ] `npm run prebuild:play` → manifest shows `usesCleartextTraffic="false"`
      and `updates.ENABLED` `false`
- [ ] `strings` check above: `api/apps` and `iptv.manzaronline` absent from the
      play bundle
- [ ] Upload keystore uploaded to the build server, and **backed up elsewhere**
- [ ] `npm run build:play` produced an AAB, and the build log says
      "Signing with this project's upload key"
- [ ] `.env` restored (the script does it; confirm `git status` is clean)

Console:

- [ ] Privacy policy regenerated **and the landing page deployed** — load
      `https://manzaronline.site/privacy` in a browser
- [ ] Icon and feature graphic uploaded
- [ ] At least 2 phone screenshots, none of them the login screen
- [ ] Data safety completed and matches the table above
- [ ] Advertising ID declared
- [ ] Content rating questionnaire submitted, user-generated content = yes
- [ ] Target audience 18+, not designed for children
- [ ] Ads = yes
- [ ] **App access credentials filled in and tested from a clean install**

Before you submit, install the store-flavour APK on a phone that has never had
Manzar, and go through it as a stranger: sign in with the reviewer credentials,
play something, download something, open Settings, read the privacy policy,
delete all app data. Anything that breaks there breaks in front of the reviewer.

---

## After the first release

- Play distributes updates; the store build has no updater and no OTA. Every
  fix — including a one-line JS fix that would have been a 20-second
  `axe build --type update` on the sideloaded flavour — is a new AAB, a new
  `versionCode`, and a review. Budget days, not seconds.
- The sideloaded flavour keeps working exactly as `SHIPPING.md` describes.
  Nothing in this document changes it.
- Anything that changes what data leaves the device changes
  `src/content/privacy.ts`, which changes the published page (re-run
  `npm run privacy:export` and deploy) **and** may change the Data safety form.
  The three are one fact stated three times; they go stale together or not at
  all.
