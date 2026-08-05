/**
 * Which shop this build is for. Set at build time; see app.config.ts.
 *
 * `sideload` is the build installed by hand from the Axe server. `play` is the
 * Play Store build, and the difference is not cosmetic: Play's Device and
 * Network Abuse policy prohibits an app that downloads and installs an APK, and
 * that is exactly what src/hooks/useAppUpdate.ts does. Anything gated on this
 * constant is compiled out of the store bundle, because
 * EXPO_PUBLIC_DISTRIBUTION is inlined as a literal and the bundler drops the
 * dead branch.
 *
 * Defaults to sideload when unset, so a normal build is unaffected and only a
 * deliberate store build opts in.
 */
export const IS_PLAY = process.env.EXPO_PUBLIC_DISTRIBUTION === 'play';

/** Play does its own updating; the sideload build has to ask. */
export const SELF_UPDATES = !IS_PLAY;
