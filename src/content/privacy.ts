/**
 * The privacy policy text.
 *
 * Kept as data so the screen is pure presentation, and kept in the app rather
 * than behind a WebView so it is readable with no connection.
 *
 * Every claim below was checked against the code that makes it true:
 *   - src/store/persist.ts  -- what is stored, and in which of the two backends
 *   - src/api/client.ts     -- the only outbound requests the app makes
 *   - src/api/download.ts   -- where downloaded video lands
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
      'Manzar is a player for a media server that you provide. It has no accounts of its own, no analytics, no advertising, and no third-party tracking of any kind. Nothing you do in this app is sent anywhere except to the server address you type in when you sign in.',
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
      'The app talks to exactly one host: the server address you entered. It sends your username and password with each request, because that is how the Xtream protocol authenticates.',
      'When you play or download something, your server answers with a redirect to its own storage provider, and your device then fetches the video from there directly. That storage provider sees your IP address, as it would for any file download.',
      'There are no other network calls. No crash reporting, no telemetry, no advertising identifiers, no social logins.',
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
    heading: 'Children',
    body: [
      'Manzar is a general-purpose media player and is not directed at children. It does not knowingly collect information from anyone, of any age, because it does not collect information at all.',
    ],
  },
  {
    heading: 'Changes',
    body: [
      'If this policy changes, the updated text ships with the app update and the date at the top of this screen changes with it.',
    ],
  },
];
