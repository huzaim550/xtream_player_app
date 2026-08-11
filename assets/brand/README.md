# Brand sources

The Manzar mark: a television with rabbit-ear antennas and a play triangle on
the screen. Frame in a white-to-silver fall (`#FFFFFF` → `#C2CBD8`), play
triangle and antenna tips in brand red `#E11D2E` (`Palette.brand`), on `#0B0D10`.

The play triangle is split along its own axis into a lit face and a folded one.
That seam is inherited from the previous mark — a stylised `M` shaded like a
folded ribbon — and is the one piece of it that carried over.

These SVGs are the source of truth for every raster in `assets/images/` and
`assets/store/`. Nothing in either directory should be edited by hand.

## Two things that will bite you

**The mark is not centred on 50.** Its bounding box runs y 13.2 → 92.6, centred
on **52.9**, because the antennas add height above the set and nothing balances
them below it. Every transform here recentres on 52.9 before scaling:

```
transform="translate(50,50) scale(s) translate(-50,-52.9)"
```

Use `-50,-50` and the mark sits visibly low in its square.

**The frame is an open stroke**, so anything drawn behind it shows through the
screen. The antennas run past the frame's top edge and are cut at y=42.4 — the
*inner* edge of that stroke — by the `aboveFrame` clip path. Stop them short
instead and the V's vertex sits above the frame as a notch; drop the clip and it
hangs inside the screen as a white wedge. Both are obvious once seen.

## Regenerating

ImageMagick renders the SVGs through its RSVG delegate.

```sh
cd assets/brand
magick icon.svg          -resize 1024x1024 -depth 8 -strip PNG24:../images/icon.png
magick -background none adaptive-fg.svg -resize 1024x1024 -depth 8 -strip PNG32:../images/android-icon-foreground.png
magick -background none mono.svg        -resize 1024x1024 -depth 8 -strip PNG32:../images/android-icon-monochrome.png
magick -size 1024x1024 "xc:#0B0D10" ../images/android-icon-background.png
magick -background none mark.svg        -resize 1024x1024 -depth 8 -strip PNG32:../images/splash-icon.png
magick icon.svg          -resize 256x256  -depth 8 -strip PNG24:../images/logo-mark.png
magick -background none glow.svg        -resize 768x768  -depth 8 -strip PNG32:../images/logo-glow.png
magick icon.svg          -resize 48x48    -depth 8 -strip PNG24:../images/favicon.png
```

Then the Play Console assets, which are their own script because they compose
the mark with type:

```sh
./scripts/store-assets.sh
```

## The scales, and why they differ

| File | Scale | Why |
|---|---|---|
| `icon.svg` | 0.74 | Launcher and store icon: fills the square with a comfortable margin |
| `adaptive-fg.svg` | 0.66 | Inside the inner 66% every launcher mask is guaranteed to leave visible. **Check a circular mask before enlarging.** |
| `mono.svg` | 0.66 | Must match `adaptive-fg.svg`, or the themed icon changes size when a user turns theming on |
| `glow.svg` | 0.90 | The splash and the login backdrop. Higher than the old `M`'s 0.62 on purpose: that glyph was tall and narrow, this one is wide and short, so the same number reads smaller inside the halo |

`mono.svg` also drops the screen glow. The system keeps only the alpha and
tints it, so a soft red wash contributes nothing but a grey haze.

## Removed

`assets/tv_icons/` held eight Android TV banner rasters carrying the previous
mark. The TV variant is not currently built (see the note at the top of
`app.config.ts`), the files were stale artwork, and they were 7 MB uploaded on
every build. Restore them from git if the TV variant comes back — and
regenerate them from these sources rather than restoring the old art.
