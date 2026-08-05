/**
 * Renders src/content/privacy.ts into the public page on the landing site.
 *
 * Google Play requires a privacy policy at a public URL, and the app requires
 * one that reads with no connection -- so the same text has to exist in two
 * places. Rather than maintain both and hope, this generates one from the
 * other: src/content/privacy.ts stays canonical, and the web page is an
 * artefact of it.
 *
 *   npm run privacy:export                      # default landing-page path
 *   npm run privacy:export -- /some/other.html
 *
 * Then deploy the landing page. If the two ever disagree, the date shown on
 * both is what gives it away.
 *
 * Node strips the TypeScript on import (26+), so there is no build step and no
 * second copy of the text anywhere in this repo.
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRIVACY_SECTIONS, PRIVACY_UPDATED } from '../src/content/privacy.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = resolve(HERE, '../../landing_page/public/privacy.html');

/** The policy is prose, not markup: everything interpolated gets escaped. */
const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** policies.google.com is named in the text; make it clickable, nothing else. */
function linkify(text) {
  return esc(text).replace(
    /policies\.google\.com\/technologies\/ads/g,
    '<a href="https://policies.google.com/technologies/ads" rel="noopener">policies.google.com/technologies/ads</a>',
  );
}

const sections = PRIVACY_SECTIONS.map(
  (s) => `      <section>
        <h2>${esc(s.heading)}</h2>
${s.body.map((p) => `        <p>${linkify(p)}</p>`).join('\n')}
      </section>`,
).join('\n\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <!-- GENERATED FILE -- do not edit.
       Source: src/content/privacy.ts in the Manzar app repo.
       Regenerate: npm run privacy:export, then deploy this site. -->

  <title>Privacy Policy — Manzar</title>
  <meta name="description" content="What the Manzar app stores on your device, what leaves it, and what Google receives when ads are enabled for your account." />
  <link rel="canonical" href="https://manzaronline.site/privacy" />
  <meta name="robots" content="index, follow" />
  <meta name="theme-color" content="#0b0b0b" />

  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />

  <link rel="stylesheet" href="/css/style.css" />
  <style>
    /* Long-form reading column. The landing page is all full-bleed sections;
       a policy is a document, so it gets a narrower measure and more air. */
    .policy { max-width: 760px; margin: 0 auto; padding: 120px 24px 96px; }
    .policy h1 { font-size: clamp(28px, 5vw, 40px); line-height: 1.2; }
    .policy .updated { color: var(--text-dim); margin-top: 8px; font-size: 15px; }
    .policy section { margin-top: 40px; }
    .policy h2 { font-size: 20px; margin-bottom: 12px; }
    .policy p { color: var(--text-dim); margin-bottom: 14px; }
    .policy a { color: var(--accent); text-decoration: underline; }
    .policy .back { display: inline-block; margin-top: 48px; color: var(--text-dim); }
    .policy .back:hover { color: var(--text); }
  </style>
</head>
<body>

  <header class="navbar">
    <div class="container nav-inner">
      <a href="/" class="logo">MAN<span>ZAR</span></a>
    </div>
  </header>

  <main class="policy">
    <h1>Privacy Policy</h1>
    <p class="updated">Last updated: ${esc(PRIVACY_UPDATED)}</p>

    <p class="updated">This is the policy for the Manzar Android app. The same
      text is readable inside the app, under Settings &rarr; Privacy Policy.</p>

${sections}

    <a class="back" href="/">&larr; Back to manzaronline.site</a>
  </main>

</body>
</html>
`;

const out = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_OUT;
writeFileSync(out, html);
console.log(`privacy policy (${PRIVACY_UPDATED}, ${PRIVACY_SECTIONS.length} sections) -> ${out}`);
