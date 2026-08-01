# Brand sources

The Manzar mark: a bold `M` whose two diagonals are shaded like a folded
ribbon. Red `#E11D2E` (`Palette.brand`) on `#0B0D10`.

These SVGs are the source of truth for every raster in `assets/images/`.
Regenerate with ImageMagick (its RSVG delegate renders the SVG):

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

`adaptive-fg.svg` and `mono.svg` scale the mark to 46% so it sits inside the
inner 66% safe zone Android's adaptive-icon mask requires. Do not enlarge them
without checking the mask on a round launcher.
