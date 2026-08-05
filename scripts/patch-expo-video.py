#!/usr/bin/env python3
"""Applies the expo-video source edit that `patches/` is generated from.

Kept in the repo so the patch can be regenerated after an expo-video bump
without reconstructing the reasoning from the diff. See patches/README.md.
"""

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
TARGET = ROOT / (
    'node_modules/expo-video/android/src/main/java/expo/modules/video/'
    'player/FirstFrameEventGenerator.kt'
)

OLD = """    val surfaceAspectRatio = surfaceWidth.toFloat() / surfaceHeight
    val trackAspectRatio = sourceWidth.toFloat() / sourceHeight * sourcePixelWidthHeightRatio

    val videoSizeIsUnknown = sourceWidth == 0 || sourceHeight == 0
    val hasFillContentFit = currentPlayerView.playerView.resizeMode == ContentFit.FILL.toResizeMode()
    val hasCorrectRatio = abs(trackAspectRatio - surfaceAspectRatio) < epsilon

    return (hasCorrectRatio || hasFillContentFit || videoSizeIsUnknown)"""

NEW = """    // PATCHED (see patches/README.md).
    //
    // Upstream also required the surface's aspect ratio to match the track's:
    //
    //   val hasCorrectRatio = abs(trackAspectRatio - surfaceAspectRatio) < epsilon
    //   return (hasCorrectRatio || hasFillContentFit || videoSizeIsUnknown)
    //
    // A full-screen surface showing a letterboxed 2.35:1 film never satisfies
    // that -- 2340x1080 is 2.167, the track is 2.354 -- so onRenderedFirstFrame
    // was withheld forever, and with it the alpha=1 that makes the video
    // surface visible at all. The film then plays to the end into an invisible
    // surface: audio, no picture, no error. The zero-size check above is the
    // part of this function that is actually about layout being ready, and it
    // is kept; `contentFit` legitimately leaves the surface a different shape
    // from the video, so shape can never be the readiness signal.
    return true"""


def main() -> int:
    if not TARGET.exists():
        print(f'not found: {TARGET}', file=sys.stderr)
        return 1
    source = TARGET.read_text()
    if NEW in source:
        print('already patched')
        return 0
    if OLD not in source:
        print(
            'expo-video has changed -- re-read isPlayerSurfaceLayoutValid() and '
            'check whether the aspect-ratio gate is still there before patching.',
            file=sys.stderr,
        )
        return 1
    TARGET.write_text(source.replace(OLD, NEW))
    print(f'patched {TARGET.relative_to(ROOT)}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
