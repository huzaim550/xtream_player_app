#!/usr/bin/env bash
#
# Play Console graphic assets, generated from assets/brand/*.svg.
#
# Same rule as the rasters in assets/images/ (see assets/brand/README.md): the
# SVGs are the source of truth and these are artefacts, so a brand change is one
# edit and one command rather than a hunt through PNGs. ImageMagick renders the
# SVGs through its RSVG delegate.
#
#   ./scripts/store-assets.sh
#
# Produces, into assets/store/:
#   play-icon-512.png             512x512, no alpha  -- Play rejects transparency here
#   play-feature-graphic-1024x500.png                -- the banner above the listing
#
# Screenshots are NOT generated: they have to come off a real device. See PLAY.md.
set -euo pipefail

cd "$(dirname "$0")/.."
BRAND=assets/brand
OUT=assets/store
mkdir -p "$OUT"

BG='#0B0D10'
RED='#E11D2E'
MUTED='#9AA3AE'
# Montserrat is the closest thing installed to the heavy grotesque the landing
# page sets its wordmark in. If a machine lacks it, pick another -Bold face
# rather than letting ImageMagick fall back to something with different metrics.
FONT_BOLD=Montserrat-ExtraBold
FONT_BODY=Montserrat-Medium

# --- Store icon -------------------------------------------------------------
# Flattened onto the brand background on purpose: Play requires a 512x512 32-bit
# PNG and rejects one with an alpha channel, and the launcher icon's own
# background is a separate adaptive-icon layer that does not apply here.
magick "$BRAND/icon.svg" -resize 512x512 \
  -background "$BG" -alpha remove -alpha off \
  -depth 8 -strip "PNG24:$OUT/play-icon-512.png"

# --- Feature graphic --------------------------------------------------------
# 1024x500, and Play crops it hard in some placements, so everything that has to
# survive sits in the middle band and nothing important goes near an edge.
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# A wash behind the lockup rather than a flat field. It peaks at brandDeep, not
# brand: the mark carries red of its own, so a full-saturation glow behind it
# turns the whole banner into one red rectangle with the mark lost in the middle
# -- which is exactly what the first version did. Squeezed from a square gradient
# so the falloff stays circular rather than banding across a 2:1 canvas.
magick -size 1000x1000 radial-gradient:'#6E0912'-"$BG" \
  -resize 1500x750\! -gravity center -crop 1024x500+0+0 +repage \
  "$TMP/glow.png"

magick -background none "$BRAND/mark.svg" -resize x250 -strip "PNG32:$TMP/mark.png"

# The wordmark, split so the two halves take different colours the way the
# landing page sets it: MAN white, ZAR brand red.
magick -background none -font "$FONT_BOLD" -pointsize 96 -kerning 4 \
  -fill white label:'MAN' "$TMP/w1.png"
magick -background none -font "$FONT_BOLD" -pointsize 96 -kerning 4 \
  -fill "$RED" label:'ZAR' "$TMP/w2.png"
magick "$TMP/w1.png" "$TMP/w2.png" +append "$TMP/word.png"

magick -background none -font "$FONT_BODY" -pointsize 30 -kerning 1 \
  -fill "$MUTED" label:'Your server. Your library. Your player.' "$TMP/tag.png"

# Text block: wordmark over tagline, left-aligned to each other.
magick -background none "$TMP/word.png" \
  \( -size 1x22 xc:none \) "$TMP/tag.png" \
  -gravity west -append "$TMP/text.png"

# Horizontal lockup: mark, a gap, the text block.
magick -background none "$TMP/mark.png" \
  \( -size 44x1 xc:none \) "$TMP/text.png" \
  -gravity center +append "$TMP/lockup.png"

magick -size 1024x500 "xc:$BG" \
  \( "$TMP/glow.png" -channel A -evaluate multiply 0.7 +channel \) \
  -gravity center -geometry +0+0 -composite \
  \( "$TMP/lockup.png" \) -gravity center -geometry +0+0 -composite \
  -depth 8 -strip "PNG24:$OUT/play-feature-graphic-1024x500.png"

identify "$OUT"/*.png
