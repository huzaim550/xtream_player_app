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
 *     react-native-google-mobile-ads plugin entry in app.config.ts -- the third
 *     host, and the rule that nothing Google-related runs until the server has
 *     enabled ads for the account
 *   - src/app/(app)/settings.tsx -- the deletion controls named here
 * If any of those change, this file has to change with them.
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
      'It can show advertising, supplied by Google AdMob. Whether it does is decided by whoever runs your server, per account — if they have not switched ads on for you, the Google software in this app is never started at all, and nothing is sent to Google. The Advertising section below describes what happens when they have.',
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
      'The app talks to three hosts, and only three. The first is the server address you entered. It sends your username and password with each request, because that is how the Xtream protocol authenticates.',
      'The second is Manzar’s own update server. The app asks it three things: whether a newer version of the app exists, whether there is a background update to install, and whether there are any announcements to show on the Notifications screen. Those requests carry nothing about you — no username, no account details, no device identifier, and nothing about what you watch. Like any web server, it does see your IP address.',
      'The third is Google, and only when your server has switched ads on for your account. See Advertising below for what is sent.',
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
      'Settings → Clear watch history removes every stored watch position and resume point.',
      'The Downloads screen, in the account menu, lets you delete any downloaded file individually.',
      'Signing out removes your stored password. Your server address, watch history and saved titles are kept so that signing back in does not start you from scratch.',
      'Uninstalling the app removes everything listed on this page from your device.',
    ],
  },
  {
    heading: 'Advertising',
    body: [
      'Ads are supplied by Google AdMob. Whoever runs your server decides, for each account separately, whether you see them at all — and separately how many there are and where they appear: a banner while browsing, one before a film starts, and breaks during it.',
      'When ads are on for your account, Google receives what it needs to serve one: your IP address, your device’s advertising identifier unless you have opted out of it in Android’s settings, general information about your device and this app, and whether an ad was shown or tapped. It does not receive your username, your server address, or anything about what you watch — this app never sends those to Google, and the ad request happens on its own, not alongside anything you did.',
      'You can reset or delete your advertising identifier at any time in Android: Settings → Privacy → Ads. Doing so does not stop ads, but it unlinks them from your past activity.',
      'Google’s own description of how it uses this data is at policies.google.com/technologies/ads. Ad content is limited to a general audience rating.',
      'In regions where consent is legally required, a Google-supplied consent screen appears before the first ad, and your choices can be changed again from Settings.',
      'One note about Android’s permission list: the Google advertising component adds an “advertising ID” permission to the app, and it is listed for every install regardless of whether ads have been turned on for that account. The permission being present is not the same as it being used — nothing reads that identifier until your server enables ads for you.',
    ],
  },
  {
    heading: 'Children',
    body: [
      'Manzar is a general-purpose media player and is not directed at children. It is not tagged for child-directed treatment, and ads shown in it are limited to a general audience content rating.',
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
