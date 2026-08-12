/**
 * The privacy policy text.
 *
 * Kept as data so the screen is pure presentation, and kept in the app rather
 * than behind a WebView so it is readable with no connection.
 *
 * Every claim below was checked against the code that makes it true:
 *   - src/store/persist.ts  -- what is stored, and in which of the two backends
 *   - src/api/client.ts     -- every request to the media server
 *   - src/api/download.ts   -- where downloaded video lands
 *   - src/hooks/useAppUpdate.ts, src/store/notifications.ts, and `updates` in
 *     app.config.ts -- the requests to the update server
 *   - src/ads/index.ts, src/store/ads.ts, src/hooks/useAdsInit.ts, and the
 *     react-native-google-mobile-ads plugin entry in app.config.ts -- ads are
 *     always enabled and Google is always contacted to serve them, unless
 *     Remove Ads is owned
 *   - src/iap/index.ts, src/store/purchases.ts -- the Remove Ads subscription
 *     and what buying it sends to Google Play
 *   - src/app/(app)/settings.tsx -- the deletion controls named here
 * If any of those change, this file has to change with them.
 *
 * Two consumers, and they must not drift: the in-app screen at
 * src/app/(app)/privacy.tsx, and the public page that Play requires a URL for,
 * which scripts/export-privacy.mjs renders from this same file. Never hand-edit
 * the published copy.
 *
 * That second consumer is why this file imports nothing. The script runs under
 * plain Node, which has neither the `@/` alias nor a bundler, so a single
 * import here would break the published policy -- and the two flavours' worth
 * of behaviour that would otherwise want a `SELF_UPDATES` branch (see
 * src/distribution.ts) are stated in the prose instead, where they are true of
 * both builds at once and legible to a reader who does not know there are two.
 */

export const PRIVACY_UPDATED = 'August 2026';

export interface PolicySection {
  heading: string;
  body: string[];
}

export const PRIVACY_SECTIONS: PolicySection[] = [
  {
    heading: 'The short version',
    body: [
      'Manzar is a player for a media server that you provide. It has no accounts of its own, no analytics, and no crash reporting. Nothing about what you watch is sent anywhere except to the server address you type in when you sign in.',
      'It shows advertising, supplied by Google AdMob. The app has ads enabled by default, and sends data to Google to serve them. The Advertising section below describes what is sent and how to control it. Ads can also be turned off entirely with a paid subscription, bought through Google Play — see Subscriptions below.',
    ],
  },
  {
    heading: 'What is stored on your device',
    body: [
      'Your password is stored in the Android keystore (secure storage) and nowhere else. If a device has a broken keystore, the app falls back to its private app storage and tells you so on the Settings screen — it never fails silently.',
      'Your server address and username, a cached copy of your library, your watch positions, and your saved titles are stored in the app’s private storage. This is ordinary app data: other apps cannot read it, and it is removed when you uninstall.',
      'Downloaded video is stored in the app’s private document directory. It does not appear in your gallery or a file manager and is not shared with other apps. Note that this is sandboxing provided by Android, not encryption — on a rooted device those files can still be read.',
    ],
  },
  {
    heading: 'What leaves your device',
    body: [
      'The app talks to two main hosts. The first is the server address you entered. It sends your username and password with each request, because that is how the Xtream protocol authenticates.',
      'The second is Manzar’s own server. Installed from Google Play, the app asks it one thing: whether there are any announcements to show on the Notifications screen. A copy installed by hand instead — this app is also distributed directly — additionally asks whether a newer version exists, and downloads background updates, because nothing else would tell it. None of those requests carry anything about you: no username, no account details, no device identifier, and nothing about what you watch. Like any web server, it does see your IP address.',
      'The app also contacts Google to serve ads, and, if you buy the Remove Ads subscription, to process that purchase through Google Play. See Advertising and Subscriptions below for what each sends.',
      'When you play or download something, your server answers with a redirect to its own storage provider, and your device then fetches the video from there directly. That storage provider sees your IP address, as it would for any file download.',
      'There are no other network calls. No crash reporting, no telemetry, no social logins.',
    ],
  },
  {
    heading: 'What your server records',
    body: [
      'Your server — not this app — keeps its own log of what was played, when, and from which IP address, and counts how many connections your account is using. That data lives on your server and is governed by however you run it. This app cannot read or delete it.',
    ],
  },
  {
    heading: 'Deleting your data',
    body: [
      'Manzar has no account of its own, so there is no account here to delete. Your account belongs to whoever runs your server; ask them to close it, and ask them what they keep. Everything below is about this device.',
      'Settings → Delete all app data removes the lot in one step: your saved password, your server address and username, your watch history, your saved titles, every downloaded file and the cached copy of your library. It asks first, and leaves you at the sign-in screen. It does not cancel an active Remove Ads subscription — that lives with Google Play, not this app, and the app will recognise it again next time you sign in.',
      'If you want something narrower: Settings → Clear watch history removes every stored watch position and resume point, and the Downloads screen in the account menu deletes any downloaded file individually.',
      'Signing out removes your stored password. Your server address, watch history and saved titles are kept so that signing back in does not start you from scratch — use Delete all app data instead if you want those gone too.',
      'Uninstalling the app removes everything listed on this page from your device.',
    ],
  },
  {
    heading: 'Advertising',
    body: [
      'Ads are supplied by Google AdMob. The app has ads enabled by default: a banner while browsing, one before a film starts, and breaks during playback.',
      'When the app runs, Google receives what it needs to serve ads: your IP address, your device\'s advertising identifier unless you have opted out of it in Android\'s settings, general information about your device and this app, and whether an ad was shown or tapped. It does not receive your username, your server address, or anything about what you watch — this app never sends those to Google, and the ad request happens on its own, not alongside anything you did.',
      'You can reset or delete your advertising identifier at any time in Android: Settings → Privacy → Ads. Doing so does not stop ads, but it unlinks them from your past activity.',
      'Google\'s own description of how it uses this data is at policies.google.com/technologies/ads. The app asks Google for nothing rated above PG, so the ads themselves stay suitable for a broad audience.',
      'In regions where consent is legally required, a Google-supplied consent screen appears before the first ad, and your choices can be changed again from Settings.',
      'One note about Android\'s permission list: the Google advertising component adds an "advertising ID" permission to the app, and it is listed for every install. The permission being present is not the same as it being used — nothing reads that identifier until the app is launched.',
    ],
  },
  {
    heading: 'Subscriptions',
    body: [
      'Settings offers a Remove Ads subscription, billed through Google Play. This app never sees your payment details — Google Play handles the checkout entirely, the same as any other Play Store purchase.',
      'To know whether it is currently active, the app asks Google Play, not your server or any server of ours: a purchase made on one device is recognised on any device signed into the same Google account, and Restore Purchase in Settings re-asks Google directly if the app’s own cached answer is ever wrong.',
      'Cancelling or changing the subscription happens in Google Play’s own subscription management, reachable from the "Manage subscription" button in Settings once it is active — this app has no cancel flow of its own.',
      'This subscription is only offered in the version of the app distributed through Google Play. A copy installed by hand does not have it, and keeps ads on.',
    ],
  },
  {
    heading: 'Children',
    body: [
      'Manzar is a general-purpose media player and is not directed at children. It is not tagged for child-directed treatment, and the ads it requests are capped at a PG rating.',
      'The app itself collects nothing about anyone, of any age. When ads are on, what Google receives is described in the Advertising section above.',
    ],
  },
  {
    heading: 'Changes',
    body: [
      'If this policy changes, the updated text ships with the app update and the date at the top of this screen changes with it.',
    ],
  },
];
