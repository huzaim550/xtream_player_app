/**
 * Which shop this build is for. Set at build time; see app.config.ts.
 *
 * `sideload` is the build installed by hand from the Axe server. `play` is the
 * Play Store build, and the difference is not cosmetic: Play's Device and
 * Network Abuse policy prohibits an app that downloads and installs an APK, and
 * that is exactly what src/hooks/useAppUpdate.ts does.
 *
 * **These are runtime constants, not compile-time ones.** It is tempting to
 * assume otherwise -- EXPO_PUBLIC_DISTRIBUTION really is inlined as a literal
 * where it is *read*, and the minifier really does collapse a branch on it --
 * but that only holds inside the module that reads it. Metro does no
 * cross-module constant propagation, so `if (SELF_UPDATES)` imported from here
 * survives minification as a live branch, and the strings inside it survive
 * with it. Checked by exporting a play bundle and running `strings` over the
 * .hbc, which is the only way to know rather than believe.
 *
 * What that buys is still the whole of what policy asks for: the branch is
 * never taken, so no APK is fetched, no install is offered, and the request is
 * not made. Where a *string* also had to go -- the APK endpoint itself -- the
 * fold is written at its own use site instead; see UPDATE_API in
 * src/hooks/useAppUpdate.ts.
 *
 * Defaults to sideload when unset, so a normal build is unaffected and only a
 * deliberate store build opts in.
 */
export const IS_PLAY = process.env.EXPO_PUBLIC_DISTRIBUTION === 'play';

/** Play does its own updating; the sideload build has to ask. */
export const SELF_UPDATES = !IS_PLAY;
