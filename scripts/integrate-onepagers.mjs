#!/usr/bin/env node
/**
 * One-pager integration for scalingminds.com
 * -------------------------------------------
 * One-time, idempotent transform that wires the 27 standalone "Insight" one-pagers
 * (root-level *.html with class="header-series") into the site brand shell:
 *
 *   1. Brand palette  — replaces each page's embedded :root with the brand palette,
 *                        NAMESPACED to --sm-* so it can never clobber style.css tokens
 *                        (which the shared nav/footer rely on). All var(--x) refs in
 *                        the page's own CSS are renamed to var(--sm-x) to match.
 *   2. Font swap       — Playfair Display -> Libre Baskerville (link + every font-family).
 *   3. Site chrome     — links /style.css, injects the real <nav> and <footer>, and a
 *                        small override <style> that un-fixes the page's own masthead
 *                        (kept as a sub-nav band) and the bottom CTA bar, and hides the
 *                        masthead's redundant logo (the site nav already shows it).
 *   4. Metadata        — canonical + og:url -> the real clean URL (/<slug>), and adds
 *                        Article + BreadcrumbList JSON-LD (no FAQPage; these have no FAQ).
 *   5. Cross-links     — four pages get a "Go deeper ->" link to their paired article.
 *
 * Collision handling: the only one-pager classes that clash with style.css are .btn and
 * .footer (the page's tiny references line). Both are renamed to .op-* before the shared
 * footer/buttons are injected, so the two stylesheets stay isolated.
 *
 * Idempotent: a page already carrying the SENTINEL is skipped. Safe to re-run.
 *
 * This is a dev tool — run locally and commit the rewritten HTML. It is NOT part of the
 * Netlify build (only build-insights.mjs runs on deploy).
 *
 *   node scripts/integrate-onepagers.mjs            # transform all matching pages
 *   node scripts/integrate-onepagers.mjs --check    # report only, write nothing
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SITE = 'https://scalingminds.com';
const MARKER = 'class="header-series"';
const SENTINEL = '<!-- sm-integrated -->';
const CHECK = process.argv.includes('--check');

/* ----------------------------- brand tokens ----------------------------- */

// Namespaced so the page's own colors never override style.css's --green/--gold/etc.
// Greens: brand base #123E35 plus two derived lighter tints (replacing the old
// #2D6A4F / #40916C mids). Gold: #C4973B; secondary gold #b08832 (was #D4A017).
// Creams/tints carried over — they read fine against the new green.
const ROOT_PALETTE =
  ':root { ' +
  '--sm-green: #123E35; --sm-green-mid: #235C4E; --sm-green-muted: #3A8270; ' +
  '--sm-gold: #C4973B; --sm-gold-light: #b08832; ' +
  '--sm-cream: #D4C5A9; --sm-cream-light: #F0EBE0; --sm-cream-pale: #FAF7F2; ' +
  '--sm-green-tint: #E4F0E8; --sm-warm-tint: #F9E4DC; }';

const VAR_NAMES = [
  'green-mid', 'green-muted', 'green-tint', 'green',
  'gold-light', 'gold',
  'cream-pale', 'cream-light', 'cream',
  'warm-tint',
];

const FONT_AND_CSS =
  '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">\n' +
  '    <link rel="stylesheet" href="/style.css">';

/* ----------------------------- shared chrome ----------------------------- */

const NAV = `  <nav class="nav">
    <div class="nav__inner">
      <a href="/" class="nav__logo" style="display: flex; align-items: center; gap: 10px;">
        <img src="/scaling_minds_logo.png" alt="Scaling Minds" style="height: 44px; width: auto;">
      </a>
      <ul class="nav__links">
        <li><a href="/">Home</a></li>
        <li><a href="/about">About</a></li>
        <li><a href="/six-shifts">The Six Shifts™</a></li>
        <li><a href="/services">Services</a></li>
        <li><a href="/client-results">Client Results</a></li>
        <li><a href="/insights">Insights</a></li>
        <li><a href="https://portal.scalingminds.com" target="_blank" style="font-size: 0.85rem; opacity: 0.7;">Client Login</a></li>
        <li><a href="/contact" class="nav__cta">Start Here</a></li>
      </ul>
      <button class="nav__toggle" aria-label="Toggle navigation">
        <span></span><span></span><span></span>
      </button>
    </div>
  </nav>`;

const FOOTER = `  <footer class="footer">
    <div class="container">
      <div class="footer__grid">
        <div class="footer__brand">
          <img src="/scaling_minds_logo.png" alt="Scaling Minds" style="height: 40px; width: auto; margin-bottom: 12px;">
          <p>Executive team performance for privately held companies and mission-driven nonprofits.</p>
          <p style="margin-top: 16px;">
            Chicago, IL<br>
            <a href="tel:3127725825">(312) 772-5825</a>
          </p>
        </div>
        <div>
          <h4>Navigate</h4>
          <ul class="footer__links">
            <li><a href="/">Home</a></li>
            <li><a href="/about">About</a></li>
            <li><a href="/six-shifts">The Six Shifts™</a></li>
            <li><a href="/services">Services</a></li>
            <li><a href="/insights">Insights</a></li>
            <li><a href="/client-results">Client Results</a></li>
          </ul>
        </div>
        <div>
          <h4>Connect</h4>
          <ul class="footer__links">
            <li><a href="/contact">Start Here</a></li>
            <li><a href="https://www.linkedin.com/in/andy-hite/" target="_blank">LinkedIn</a></li>
            <li><a href="https://portal.scalingminds.com" target="_blank">Client Login</a></li>
          </ul>
        </div>
      </div>
      <div class="footer__bottom">
        <p>&copy; 2026 Scaling Minds LLC. All rights reserved.</p>
        <a href="https://www.linkedin.com/in/andy-hite/" target="_blank" aria-label="LinkedIn" class="footer__social">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
        </a>
      </div>
    </div>
  </footer>`;

const GTAG = `  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-C3Z835JNMP"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-C3Z835JNMP');
  </script>`;

// Un-fix the page's own masthead + bottom CTA bar so they flow inside the brand shell,
// and clear the fixed site nav (68px). Loaded last so it wins over the page's own CSS.
const CHROME_OVERRIDES = `  <style>
    /* Site-chrome integration overrides (added by scripts/integrate-onepagers.mjs) */
    body { padding-top: 68px !important; padding-bottom: 0 !important; }
    .header { position: static !important; box-shadow: none !important; }
    .header-logo { display: none !important; }
    .action-bar { position: static !important; box-shadow: none !important; }
    @media (max-width: 640px) { body { padding-top: 60px !important; } }
    @media print { .nav, .footer, .op-godeeper { display: none !important; } body { padding-top: 0 !important; } }
  </style>`;

// one-pager slug -> paired article { slug, label }
const CROSS_LINKS = {
  'trust-repair': { slug: 'executive-team-trust', label: 'What to Do When Your Executive Team Doesn’t Trust Each Other' },
  'cost-of-silence': { slug: 'leadership-team-hard-conversations', label: 'How to Get Your Leadership Team to Stop Avoiding Hard Conversations' },
  'candor-vs-politeness': { slug: 'leadership-team-hard-conversations', label: 'How to Get Your Leadership Team to Stop Avoiding Hard Conversations' },
  'micromanagement': { slug: 'founder-bottleneck', label: 'The Founder Bottleneck: Why Everything Runs Through You' },
};

/* ----------------------------- helpers ----------------------------- */

const escAttr = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const jsonLd = (obj) => JSON.stringify(obj, null, 2).replace(/</g, '\\u003c');

const pick = (re, html, fallback = '') => {
  const m = html.match(re);
  return m ? m[1] : fallback;
};

function buildSchema(slug, html) {
  const rawTitle = pick(/<title>([^<]*)<\/title>/, html);
  const headline = rawTitle.replace(/\s*\|\s*Scaling Minds\s*$/, '').trim();
  const description = pick(/name="description"\s+content="([^"]*)"/, html);
  let image = pick(/property="og:image"\s+content="([^"]*)"/, html) || `${SITE}/og-image.png`;
  if (!/^https?:/.test(image)) image = SITE + (image.startsWith('/') ? '' : '/') + image;
  const url = `${SITE}/${slug}`;

  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    description,
    image: [image],
    author: { '@type': 'Person', name: 'Andy Hite', url: `${SITE}/about` },
    publisher: {
      '@type': 'Organization',
      name: 'Scaling Minds',
      logo: { '@type': 'ImageObject', url: `${SITE}/scaling_minds_logo.png` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  };
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Insights', item: `${SITE}/insights` },
      { '@type': 'ListItem', position: 2, name: headline, item: url },
    ],
  };
  return [article, breadcrumb]
    .map((s) => `  <script type="application/ld+json">\n${jsonLd(s)}\n  </script>`)
    .join('\n');
}

function goDeeperBand(slug) {
  const link = CROSS_LINKS[slug];
  if (!link) return '';
  return `  <section class="op-godeeper" style="background: #F5F0E8; text-align: center; padding: 2rem 1.5rem;">
    <p style="font-family: 'Inter', sans-serif; font-size: 0.95rem; color: #4B5563; margin: 0;">Go deeper &rarr; <a href="/${link.slug}" style="color: #b08832; font-weight: 600; text-decoration: underline; text-underline-offset: 2px;">${escAttr(link.label)}</a></p>
  </section>`;
}

/* ----------------------------- transform ----------------------------- */

function transform(slug, html) {
  if (html.includes(SENTINEL)) return { skipped: true };
  let out = html;

  // 1. Fonts: swap the Google Fonts <link> for Libre Baskerville + link style.css.
  out = out.replace(
    /<link href="https:\/\/fonts\.googleapis\.com\/css2[^"]*"[^>]*>/,
    FONT_AND_CSS
  );
  // every Playfair reference -> Libre Baskerville
  out = out.split("'Playfair Display'").join("'Libre Baskerville'");

  // 2. Palette: replace the page's first :root block, then namespace its var() refs.
  out = out.replace(/:root\s*\{[^}]*\}/, ROOT_PALETTE);
  for (const name of VAR_NAMES) {
    out = out.split(`var(--${name})`).join(`var(--sm-${name})`);
  }

  // 3. Class collisions with style.css: .btn* and .footer -> .op-* (do BEFORE chrome inject).
  out = out.split('.btn-cta').join('.op-btn-cta');
  out = out.split('.btn-download').join('.op-btn-download');
  out = out.replace(/\.btn(?![\w-])/g, '.op-btn');
  out = out.split('class="btn op-btn-cta"').join('class="op-btn op-btn-cta"'); // safety (unused path)
  out = out.split('class="btn btn-cta"').join('class="op-btn op-btn-cta"');
  out = out.split('class="btn btn-download"').join('class="op-btn op-btn-download"');
  out = out.replace(/\.footer(?![\w-])/g, '.op-footer');
  out = out.split('<div class="footer">').join('<div class="op-footer">');

  // 4. Metadata: canonical + og:url -> real clean URL.
  out = out.split(`${SITE}/insights/${slug}.html`).join(`${SITE}/${slug}`);

  // 5. Head injections (JSON-LD, analytics, chrome overrides) before </head>.
  const schema = buildSchema(slug, html); // derive from ORIGINAL (pre-rename) head
  out = out.replace(/<\/head>/, `${schema}\n${GTAG}\n${CHROME_OVERRIDES}\n</head>`);

  // 6. Body chrome: nav after <body>, footer (+ go-deeper) + main.js before </body>.
  out = out.replace(/<body>/, `<body>\n${SENTINEL}\n${NAV}`);
  const band = goDeeperBand(slug);
  out = out.replace(
    /<\/body>/,
    `${band ? band + '\n' : ''}${FOOTER}\n  <script src="/main.js"></script>\n</body>`
  );

  return { skipped: false, out };
}

/* ----------------------------- run ----------------------------- */

const files = readdirSync(ROOT).filter((f) => f.endsWith('.html'));
let changed = 0, skipped = 0;
const warnings = [];

for (const file of files) {
  const path = join(ROOT, file);
  const html = readFileSync(path, 'utf8');
  if (!html.includes(MARKER)) continue; // not a one-pager
  const slug = file.replace(/\.html$/, '');

  const res = transform(slug, html);
  if (res.skipped) { skipped++; console.log(`  skip  ${file} (already integrated)`); continue; }

  // sanity: no un-namespaced brand var refs or stray colliding classes should remain
  for (const bad of ['var(--green)', 'var(--gold)', 'var(--gold-light)', 'var(--cream-light)', 'var(--green-mid)', 'var(--green-tint)', 'var(--warm-tint)']) {
    if (res.out.includes(bad)) warnings.push(`${file}: leftover ${bad}`);
  }
  if (!res.out.includes('class="nav"') || !res.out.includes('class="footer"')) warnings.push(`${file}: chrome missing`);
  if (res.out.includes(`${SITE}/insights/${slug}.html`)) warnings.push(`${file}: canonical not updated`);

  if (!CHECK) writeFileSync(path, res.out);
  changed++;
  console.log(`  ${CHECK ? 'would fix' : 'fixed'}  ${file}  ->  /${slug}`);
}

console.log(`\n${CHECK ? '[check] ' : ''}${changed} transformed, ${skipped} skipped.`);
if (warnings.length) {
  console.log('\nWARNINGS:');
  for (const w of warnings) console.log('  ! ' + w);
  process.exitCode = 1;
}
