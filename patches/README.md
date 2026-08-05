# Patches

`patch-package` runs from `postinstall`, so these apply on this machine and on
the Axe build server alike — the server runs `npm ci`, which runs `postinstall`.
Nothing here works over the air: a patch changes native code, so it only reaches
a phone in a new APK.

## `expo-video+56.1.4.patch` — the black picture with working audio

`FirstFrameEventGenerator.isPlayerSurfaceLayoutValid()` decides whether
`onRenderedFirstFrame` may be delivered. Upstream requires the surface's aspect
ratio to match the video track's, within 0.05:

```kotlin
val hasCorrectRatio = abs(trackAspectRatio - surfaceAspectRatio) < epsilon
return (hasCorrectRatio || hasFillContentFit || videoSizeIsUnknown)
```

The player is full-screen — 2340×1080, ratio 2.167 — and this library is mostly
2.35:1 films; 1130×480 is 2.354. The difference is 0.19, so the gate never
passes. That matters far more than a missing event, because the same signal is
what sets the video surface's alpha from 0 to 1. The film then plays to the end
into an invisible surface: audio, black screen, no error raised anywhere.

Confirmed on a CPH1823 over adb before patching: `MediaCodec` reporting
`mRenderFrameCnt = 25 fps` while the screen was black, the view hierarchy
showing the `SurfaceView` visible and full-bounds with `exo_shutter` invisible,
and the in-app probe reading `1130×480 · video/avc · ok · frame NO`.

The patch keeps the zero-size check — that one really is about layout being
ready — and drops the shape requirement. With `contentFit: 'contain'` the
surface is *supposed* to be a different shape from the video, so shape cannot be
the readiness signal.

`useExoShutter` is the documented escape hatch for the surface-hiding mechanism
and is **not** patched, because it is separately broken: its setter calls
`applySurfaceViewVisibility()` before assigning the backing field, so setting it
`true` reads the stale value and does nothing. `src/app/player.tsx` exploits
that ordering deliberately — see the comment there — and that workaround is what
keeps installs on the *unpatched* 1.2.0 APK playing until they update. Both
mechanisms are in effect on purpose; neither is redundant while an unpatched APK
is still in the wild.

### After bumping expo-video

`patch-package` will fail loudly if the file moved. Re-derive rather than
force it:

```bash
npm run patch:expo-video   # re-applies the edit, regenerates the .patch
```

`scripts/patch-expo-video.py` refuses to guess: if the upstream text no longer
matches, it says so, and the gate should be re-read before patching. If a
release fixes this properly, delete the patch, the script, the npm scripts, and
the `useExoShutter` flip in `src/app/player.tsx` together.
