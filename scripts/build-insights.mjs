#!/usr/bin/env node
/**
 * Insights builder for scalingminds.com
 * --------------------------------------
 * Reads one markdown file per article from insights/_articles/*.md,
 * and emits:
 *   - insights/<slug>/index.html   (clean URL: /insights/<slug>)
 *   - insights/index.html          (the Insights index, lists every article)
 *
 * Each article's markdown carries frontmatter (slug, title, description, etc.).
 * The build emits matching <title>, meta description, canonical, OG/Twitter tags,
 * and JSON-LD (Article + FAQPage + BreadcrumbList) so the series is AI/search visible.
 *
 * Design comes from the existing site: shared style.css + fonts + main.js, the same
 * nav/footer chrome, and the brand palette (green #123E35, gold #C4973B, cream #F5F0E8).
 *
 * Adding article #N = drop one .md file in insights/_articles/, commit, push.
 * Netlify runs `npm run build:insights` on deploy.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { marked } from 'marked';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARTICLES_DIR = join(ROOT, 'insights', '_articles');
const INSIGHTS_DIR = join(ROOT, 'insights'); // home of the index page
const ARTICLE_OUT = ROOT; // articles publish at top-level: /<slug>
const SITE = 'https://scalingminds.com';
const DEFAULT_OG = '/og-image.png';
const SERIES_LABEL = 'Insights';

marked.setOptions({ mangle: false, headerIds: false });

/* ----------------------------- helpers ----------------------------- */

const escapeAttr = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// Safe to inline inside a <script type="application/ld+json"> block.
const jsonLd = (obj) =>
  JSON.stringify(obj, null, 2).replace(/</g, '\\u003c');

const stripTags = (html = '') => html.replace(/<[^>]+>/g, '');

const tokensToHtml = (tokens) => {
  const links = marked.Lexer.lex('').links || {};
  tokens.links = tokens.links || links;
  return marked.parser(tokens);
};

/**
 * Pull a "Common questions" / "FAQ" section out of the markdown body so it can be
 * rendered as a styled FAQ block AND turned into FAQPage schema — without being
 * duplicated in the prose. Returns { bodyTokens, faq } where faq is [{q, a}].
 */
function splitFaqFromBody(rawBody) {
  const tokens = marked.lexer(rawBody);
  const faqRe = /^(common questions|frequently asked questions|faq|q\s*&\s*a|questions)\b/i;
  const startIdx = tokens.findIndex(
    (t) => t.type === 'heading' && faqRe.test(stripTags(t.text).trim())
  );
  if (startIdx === -1) return { bodyTokens: tokens, faq: [] };

  const sectionLevel = tokens[startIdx].depth;
  const faq = [];
  let i = startIdx + 1;
  let endIdx = tokens.length;

  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === 'heading' && t.depth <= sectionLevel) {
      endIdx = i; // a new top-level section ends the FAQ block
      break;
    }
    if (t.type === 'heading') {
      const q = stripTags(t.text).trim();
      const answerTokens = [];
      i++;
      while (i < tokens.length) {
        const a = tokens[i];
        if (a.type === 'heading' && a.depth <= sectionLevel) break;
        if (a.type === 'heading') break;
        answerTokens.push(a);
        i++;
      }
      const aHtml = answerTokens.length ? tokensToHtml(answerTokens).trim() : '';
      if (q) faq.push({ q, a: aHtml });
      continue;
    }
    i++;
  }

  const bodyTokens = tokens.slice(0, startIdx);
  return { bodyTokens, faq };
}

// Normalize a faq entry's answer to (plainText, html) for schema + display.
function normalizeFaq(entry) {
  if (typeof entry === 'string') return { q: entry, aHtml: '', aText: '' };
  const q = stripTags(String(entry.q ?? entry.question ?? '')).trim();
  const rawA = String(entry.a ?? entry.answer ?? '');
  // Frontmatter answers are markdown; body-extracted answers are already HTML.
  const looksHtml = /^\s*</.test(rawA);
  const aHtml = looksHtml ? rawA : marked.parse(rawA).trim();
  const aText = stripTags(aHtml).replace(/\s+/g, ' ').trim();
  return { q, aHtml, aText };
}

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

const FONT_LINKS = `  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css">`;

const GTAG = `  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-C3Z835JNMP"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-C3Z835JNMP');
  </script>`;

// Article-specific styles. Reuses brand vars; constrains the reading measure (~68ch),
// generous line height, question-format H2s, and a styled FAQ block.
const ARTICLE_STYLES = `  <style>
    :root { --green: #123E35; --gold: #C4973B; --gold-deep: #B08832; --cream: #F5F0E8; --white: #FFFFFF; --text-dark: #111111; --text-muted: #4B5563; }
    .article-hero { background: var(--green); color: var(--white); padding: 120px 24px 56px; text-align: center; }
    .article-hero__inner { max-width: 760px; margin: 0 auto; }
    .article-hero .eyebrow { color: var(--gold); margin-bottom: 18px; }
    .article-hero h1 { color: var(--white); font-size: clamp(1.9rem, 4vw, 2.9rem); line-height: 1.2; margin-bottom: 18px; }
    .article-hero__dek { font-size: 1.15rem; line-height: 1.7; color: rgba(255,255,255,0.72); max-width: 620px; margin: 0 auto; }
    .article-hero__meta { margin-top: 24px; font-size: 0.85rem; letter-spacing: 0.04em; color: rgba(255,255,255,0.55); }
    .article-wrap { padding: 64px 24px 24px; }
    .article-prose { max-width: 68ch; margin: 0 auto; font-size: 1.075rem; line-height: 1.78; color: #1d2521; }
    .article-prose > *:first-child { margin-top: 0; }
    .article-prose h2 { font-family: 'Libre Baskerville', serif; font-size: clamp(1.4rem, 2.6vw, 1.8rem); line-height: 1.3; color: var(--green); margin: 2.4em 0 0.7em; }
    .article-prose h3 { font-family: 'Libre Baskerville', serif; font-size: 1.25rem; color: var(--green); margin: 1.8em 0 0.6em; }
    .article-prose p { margin: 0 0 1.25em; }
    .article-prose a { color: var(--gold-deep); text-decoration: underline; text-underline-offset: 2px; }
    .article-prose a:hover { color: var(--gold); }
    .article-prose ul, .article-prose ol { margin: 0 0 1.25em 1.3em; }
    .article-prose li { margin-bottom: 0.5em; }
    .article-prose blockquote { margin: 1.6em 0; padding: 0.4em 0 0.4em 1.4em; border-left: 4px solid var(--gold); font-family: 'Libre Baskerville', serif; font-style: italic; font-size: 1.2rem; line-height: 1.6; color: var(--green); }
    .article-prose blockquote p { margin-bottom: 0.4em; }
    .article-prose hr { border: none; border-top: 1px solid #e2ddd2; margin: 2.6em 0; }
    .article-prose strong { color: var(--green); }
    .article-prose img { max-width: 100%; height: auto; border-radius: 6px; }
    .article-faq { max-width: 68ch; margin: 56px auto 0; padding-top: 40px; border-top: 1px solid #e2ddd2; }
    .article-faq h2 { font-family: 'Libre Baskerville', serif; font-size: 1.6rem; color: var(--green); margin-bottom: 24px; }
    .faq-item { border-bottom: 1px solid #e9e4d9; padding: 18px 0; }
    .faq-item summary { font-family: 'Inter', sans-serif; font-weight: 600; font-size: 1.08rem; color: var(--green); cursor: pointer; list-style: none; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
    .faq-item summary::-webkit-details-marker { display: none; }
    .faq-item summary::after { content: '+'; color: var(--gold); font-size: 1.4rem; font-weight: 400; line-height: 1; flex-shrink: 0; }
    .faq-item[open] summary::after { content: '\\2013'; }
    .faq-item__answer { padding-top: 12px; line-height: 1.75; color: #2a322e; }
    .faq-item__answer p { margin: 0 0 0.8em; }
    .faq-item__answer p:last-child { margin-bottom: 0; }
    .article-cta { background: var(--cream); margin-top: 64px; padding: 64px 24px; text-align: center; }
    .article-cta__inner { max-width: 640px; margin: 0 auto; }
    .article-cta h2 { font-family: 'Libre Baskerville', serif; font-size: clamp(1.5rem, 3vw, 2rem); color: var(--green); margin-bottom: 14px; }
    .article-cta p { color: var(--text-muted); font-size: 1.08rem; line-height: 1.7; margin-bottom: 28px; }
    @media (max-width: 640px) {
      .article-hero { padding: 104px 20px 44px; }
      .article-wrap { padding: 44px 20px 8px; }
      .article-prose { font-size: 1.02rem; }
    }
  </style>`;

/* ----------------------------- article page ----------------------------- */

function renderArticle(article) {
  const {
    slug, title, metaTitle, description, category, dek,
    datePublished, dateModified, author, ogImage, bodyHtml, faq, url,
  } = article;

  const pageTitle = metaTitle || `${title} | Scaling Minds`;
  const ogImageUrl = ogImage
    ? (ogImage.startsWith('http') ? ogImage : SITE + ogImage)
    : SITE + DEFAULT_OG;

  const faqHtml = faq.length
    ? `  <section class="article-faq">
    <h2>Common Questions</h2>
${faq
  .map(
    (f) => `    <details class="faq-item">
      <summary>${escapeAttr(f.q)}</summary>
      <div class="faq-item__answer">${f.aHtml || `<p>${escapeAttr(f.aText)}</p>`}</div>
    </details>`
  )
  .join('\n')}
  </section>`
    : '';

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    image: [ogImageUrl],
    author: { '@type': 'Person', name: author || 'Andy Hite', url: `${SITE}/about` },
    publisher: {
      '@type': 'Organization',
      name: 'Scaling Minds',
      logo: { '@type': 'ImageObject', url: `${SITE}/scaling_minds_logo.png` },
    },
    datePublished: datePublished || undefined,
    dateModified: dateModified || datePublished || undefined,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  };

  const faqSchema = faq.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.aText },
        })),
      }
    : null;

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Insights', item: `${SITE}/insights` },
      { '@type': 'ListItem', position: 2, name: title, item: url },
    ],
  };

  const schemaBlocks = [articleSchema, faqSchema, breadcrumbSchema]
    .filter(Boolean)
    .map((s) => `  <script type="application/ld+json">\n${jsonLd(s)}\n  </script>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeAttr(pageTitle)}</title>
  <meta name="description" content="${escapeAttr(description)}">
  <meta name="author" content="${escapeAttr(author || 'Andy Hite')}">
  <link rel="canonical" href="${escapeAttr(url)}">
  <meta property="og:title" content="${escapeAttr(metaTitle || title)}">
  <meta property="og:description" content="${escapeAttr(description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${escapeAttr(url)}">
  <meta property="og:image" content="${escapeAttr(ogImageUrl)}">
  <meta property="og:site_name" content="Scaling Minds">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeAttr(metaTitle || title)}">
  <meta name="twitter:description" content="${escapeAttr(description)}">
  <meta name="twitter:image" content="${escapeAttr(ogImageUrl)}">
${FONT_LINKS}
${ARTICLE_STYLES}
${schemaBlocks}
${GTAG}
</head>
<body>
${NAV}
  <div class="page-transition">
  <header class="article-hero">
    <div class="article-hero__inner">
      <span class="eyebrow">${escapeAttr(category || SERIES_LABEL)}</span>
      <h1>${escapeAttr(title)}</h1>
      ${dek ? `<p class="article-hero__dek">${escapeAttr(dek)}</p>` : ''}
    </div>
  </header>
  <main class="article-wrap">
    <article class="article-prose">
${bodyHtml}
    </article>
${faqHtml}
    <section class="article-cta">
      <div class="article-cta__inner">
        <h2>Is your leadership team performing below its potential?</h2>
        <p>The Six Shifts Diagnostic shows you exactly where your executive team is stuck — and how to close the gap.</p>
        <a href="/contact" class="btn btn--primary">Start the Conversation</a>
      </div>
    </section>
  </main>
${FOOTER}
  </div>
  <script src="/main.js"></script>
</body>
</html>
`;
}

function formatDate(d) {
  try {
    const date = typeof d === 'string' ? new Date(d + 'T00:00:00') : new Date(d);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  } catch {
    return String(d);
  }
}

/* ----------------------------- index page ----------------------------- */

function renderIndex(articles, onePagers = []) {
  // Lead with one cornerstone essay (frontmatter `featured: true`, else the first by order).
  const featured = articles.find((a) => a.featured) || articles[0] || null;
  const rest = featured ? articles.filter((a) => a !== featured) : articles;

  // Reading times from design spec, keyed by slug (fallback: "6 min read").
  const readTimes = {
    'founder-bottleneck': '7 min',
    'executive-team-trust': '6 min',
    'founder-led-to-team-led': '8 min',
    'leadership-team-hard-conversations': '6 min',
    'leaders-wont-take-ownership': '5 min',
    'psychological-safety-executive-team': '7 min',
    'does-my-leadership-team-need-a-coach': '5 min',
    'working-with-executive-team-coach': '6 min',
    'cost-of-executive-team-dysfunction': '6 min',
    'who-helps-executive-teams': '8 min',
    'leadership-offsite-that-works': '6 min',
    'nonprofit-leadership-team-coaching': '5 min',
    'everything-runs-through-me': '5 min',
    'executive-team-coaching-chicago': '4 min',
  };

  // Featured card: the "Six Shifts, Explained" cornerstone essay.
  const featuredUrl = featured ? `/${featured.slug}` : '/six-shifts-explained';
  const sixShifts = [
    { num: '01', name: 'Trust', note: 'Foundational for high-performing teams.' },
    { num: '02', name: 'Candor', note: 'Hard things get said in the room.' },
    { num: '03', name: 'Ownership', note: 'Problems stop escalating up.' },
    { num: '04', name: 'Empowerment', note: 'Decisions get made lower down.' },
    { num: '05', name: 'Alignment', note: 'Everyone rows the same way.' },
    { num: '06', name: 'Leadership', note: 'The team leads without you.' },
  ];
  const sixShiftCells = sixShifts
    .map(
      (s) => `            <li style="background:#F7FAF8; padding:18px 18px 20px; transition:background 0.18s ease;">
              <div style="font-family:'Libre Baskerville',serif; font-size:14px; color:#9DB4A9; margin-bottom:8px;">${s.num}</div>
              <div class="sm-shift-name" style="font-family:'Libre Baskerville',serif; font-weight:700; font-size:19px; color:#234A3E; margin-bottom:5px;">${s.name}</div>
              <div style="font-size:13px; line-height:1.45; color:#6E8A7E;">${s.note}</div>
            </li>`
    )
    .join('\n');

  const featuredSection = `
    <article data-reveal style="background:#f5f0e8; border:1px solid #e2d9c4; border-left:5px solid #1a4339; border-radius:6px; padding:48px clamp(32px,5vw,56px); margin-bottom:52px;">
      <div style="display:flex; align-items:center; gap:14px; margin-bottom:22px;">
        <span style="font-size:12px; font-weight:700; letter-spacing:0.16em; text-transform:uppercase; color:#1a4339; background:#e8ede8; padding:5px 11px; border-radius:3px;">Start Here</span>
        <span style="font-size:13px; font-weight:600; color:#6E8A7E;">The operating system · 12 min read</span>
      </div>
      <h3 style="font-family:'Libre Baskerville',serif; font-weight:700; font-size:clamp(28px,3.4vw,40px); line-height:1.12; margin:0 0 18px; max-width:22ch; text-wrap:balance;">${featured ? escapeAttr(featured.title) : 'The Six Shifts, Explained'}</h3>
      <p style="font-size:18px; line-height:1.62; color:#4D4A40; margin:0 0 30px; max-width:60ch;">${featured ? escapeAttr(featured.description) : 'A leadership operating system for executive teams. Six shifts, installed in this order — each one only holds once the shift before it does.'}</p>
      <ol class="sm-six-shifts" style="list-style:none; display:grid; grid-template-columns:repeat(6,1fr); gap:1px; background:#D7E2DA; border:1px solid #e2d9c4; border-radius:6px; overflow:hidden; margin:0 0 32px; padding:0;">
${sixShiftCells}
      </ol>
      <a href="${escapeAttr(featuredUrl)}" style="display:inline-flex; align-items:center; gap:8px; text-decoration:none; font-weight:700; font-size:16px; color:#1a4339; transition:gap 0.2s ease;">Read the essay <span class="sm-arrow" style="font-size:18px;">→</span></a>
    </article>`;

  // Essay grid cards (the non-featured articles).
  const essayCards = rest
    .map(
      (a, i) => `      <a data-reveal href="${escapeAttr('/' + a.slug)}" class="sm-card-essay" style="position:relative; display:flex; flex-direction:column; text-decoration:none; color:inherit; background:#f5f0e8; border:1px solid #E6DDCC; border-radius:6px; padding:30px 30px 26px; overflow:hidden;">
        <span class="sm-num" style="position:absolute; top:14px; right:22px; font-family:'Libre Baskerville',serif; font-weight:700; font-size:46px; line-height:1; color:#EFE7D6; transition:color 0.22s ease;">${String(i + 1).padStart(2, '0')}</span>
        <span style="font-size:11px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; color:#c4973b; margin-bottom:14px;">Insight</span>
        <h3 style="font-family:'Libre Baskerville',serif; font-weight:700; font-size:22px; line-height:1.26; margin:0 0 13px; max-width:22ch; text-wrap:balance;">${escapeAttr(a.title)}</h3>
        <p style="font-size:15.5px; line-height:1.56; color:#6B6459; margin:0 0 24px; flex:1;">${escapeAttr(a.description)}</p>
        <div style="display:flex; align-items:center; justify-content:space-between; border-top:1px solid #EDE4D2; padding-top:16px;">
          <span class="sm-read" style="display:inline-flex; align-items:center; gap:6px; font-weight:700; font-size:15px; color:#1a4339; transition:gap 0.2s ease;">Read <span>→</span></span>
          <span style="font-size:13px; font-weight:600; color:#A89D88;">${readTimes[a.slug] || '6 min'} read</span>
        </div>
      </a>`
    )
    .join('\n');

  // Ticker items from quick reads.
  const tickerItemsHtml = onePagers
    .map(
      (p) => `        <a href="${escapeAttr('/' + p.slug)}" class="sm-ticker-item" style="display:inline-flex; align-items:center; gap:18px; text-decoration:none; color:#BACBC3; white-space:nowrap; font-size:13px; font-weight:600; padding:0 18px; transition:color 0.18s ease;">${escapeAttr(p.title)}<span style="color:#5E8A77; font-size:7px;">●</span></a>`
    )
    .join('\n');

  // Quick reads cards.
  const quickCards = onePagers
    .map(
      (p) => `        <a data-reveal href="${escapeAttr('/' + p.slug)}" data-category="${escapeAttr(p.category || 'Insight')}" class="sm-card-quick" style="display:block; text-decoration:none; color:inherit; background:#f5f0e8; border:1px solid rgba(216,184,99,0.22); border-radius:5px; padding:22px 22px 20px;">
          <div style="font-size:11px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:#c4973b; margin-bottom:9px;">${escapeAttr(p.category || 'Insight')}</div>
          <h4 class="sm-qtitle" style="font-family:'Libre Baskerville',serif; font-weight:700; font-size:17px; line-height:1.3; margin:0 0 8px; transition:color 0.18s ease;">${escapeAttr(p.title)}</h4>
          <p style="font-size:14px; line-height:1.5; color:#7A7264; margin:0;">${escapeAttr(p.hook)}</p>
        </a>`
    )
    .join('\n');

  // Filter tab categories.
  const cats = ['All', ...new Set(onePagers.map((p) => p.category || 'Insight').filter(Boolean))];
  const filterTabs = cats
    .map((c) => {
      const count = c === 'All' ? onePagers.length : onePagers.filter((p) => (p.category || 'Insight') === c).length;
      return `        <button type="button" class="sm-tab" data-filter="${escapeAttr(c)}" style="display:inline-flex; align-items:center; font-size:14px; font-weight:600; padding:9px 16px; border-radius:999px; cursor:pointer; transition:all 0.18s ease; background:transparent; color:#BACBC3; border:1px solid rgba(216,184,99,0.32);">${escapeAttr(c)}<span style="margin-left:8px; font-size:12px; font-weight:700; color:#7E9389;">${count}</span></button>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Insights | Scaling Minds</title>
  <meta name="description" content="Field notes on executive team performance, leadership transitions, and the Six Shifts — practical reading for CEOs and the teams they lead.">
  <link rel="canonical" href="${SITE}/insights">
  <meta property="og:title" content="Insights | Scaling Minds">
  <meta property="og:description" content="Field notes on executive team performance, leadership transitions, and the Six Shifts.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${SITE}/insights">
  <meta property="og:image" content="${SITE}${DEFAULT_OG}">
  <meta name="twitter:card" content="summary_large_image">
${FONT_LINKS}
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Inter', -apple-system, sans-serif; color: #23211C; background: #FFFFFF; }
    h1, h2, h3, h4, p { text-wrap: pretty; }
    /* card transitions */
    .sm-card-essay { transition: transform 0.28s cubic-bezier(0.22,0.61,0.36,1), box-shadow 0.28s ease, border-color 0.22s ease !important; }
    .sm-card-essay:hover { border-color: #1a4339 !important; transform: translateY(-6px); box-shadow: 0 18px 40px -20px rgba(26,67,57,0.4); }
    .sm-card-essay:hover .sm-read { gap: 11px !important; }
    .sm-card-essay:hover .sm-num { color: #E3D6BC !important; }
    .sm-card-quick { transition: transform 0.26s cubic-bezier(0.22,0.61,0.36,1), background 0.18s ease, border-color 0.18s ease, box-shadow 0.26s ease !important; }
    .sm-card-quick:hover { background: #FFFFFF !important; border-color: #c4973b !important; transform: translateY(-5px); box-shadow: 0 16px 34px -18px rgba(0,0,0,0.55); }
    .sm-card-quick:hover .sm-qtitle { color: #1a4339 !important; }
    .sm-tab.active { background: #c4973b !important; color: #1a4339 !important; border-color: #c4973b !important; }
    .sm-tab.active span { color: #6E8A4E !important; }
    .sm-tab:hover:not(.active) { color: #F7F2E8 !important; border-color: rgba(216,184,99,0.7) !important; }
    /* ticker */
    @keyframes sm-ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
    .sm-ticker-track { display: flex; width: max-content; animation: sm-ticker 95s linear infinite; }
    .sm-ticker-band:hover .sm-ticker-track { animation-play-state: paused; }
    .sm-ticker-item:hover { color: #1a4339 !important; }
    /* scroll reveal */
    [data-reveal] { opacity: 0; transform: translateY(16px); transition: opacity 0.7s cubic-bezier(0.22,0.61,0.36,1), transform 0.7s cubic-bezier(0.22,0.61,0.36,1); }
    [data-reveal].sm-in { opacity: 1; transform: none; }
    /* ambient glows */
    @keyframes sm-drift { 0% { transform: translate(-6%,-4%) scale(1); } 100% { transform: translate(8%,6%) scale(1.18); } }
    @keyframes sm-drift2 { 0% { transform: translate(6%,4%) scale(1.1); } 100% { transform: translate(-8%,-6%) scale(1); } }
    .sm-glow { position: absolute; border-radius: 50%; filter: blur(30px); pointer-events: none; z-index: 0; }
    /* arrow nudge */
    @keyframes sm-nudge { 0%,100% { transform: translateX(0); } 50% { transform: translateX(5px); } }
    .sm-arrow { display: inline-block; animation: sm-nudge 1.9s ease-in-out infinite; }
    /* underline draw-on */
    .sm-underline { background-image: linear-gradient(#c4973b,#c4973b); background-repeat: no-repeat; background-position: 0 100%; background-size: 0% 3px; padding-bottom: 6px; animation: sm-draw 1s cubic-bezier(0.22,0.61,0.36,1) 0.55s forwards; }
    @keyframes sm-draw { to { background-size: 100% 3px; } }
    /* reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .sm-glow, .sm-arrow, .sm-ticker-track { animation: none !important; }
      .sm-underline { animation: none !important; background-size: 100% 3px !important; }
    }
    .sm-shift-name { white-space: nowrap; }
    @media (max-width: 860px) {
      .sm-six-shifts { grid-template-columns: repeat(3, 1fr) !important; }
    }
    @media (max-width: 640px) {
      .sm-essays-grid { grid-template-columns: 1fr !important; }
      .sm-quick-grid { grid-template-columns: 1fr !important; }
      .sm-six-shifts { grid-template-columns: repeat(2, 1fr) !important; }
    }
  </style>
${GTAG}
</head>
<body>
${NAV}
  <div class="page-transition">

  <!-- MASTHEAD / HERO -->
  <header style="position:relative; overflow:hidden; background:#1a4339;">
    <div class="sm-glow" style="top:-10%; left:34%; width:46%; height:150%; background:radial-gradient(circle, rgba(196,151,59,0.18), rgba(196,151,59,0) 62%); animation:sm-drift 17s ease-in-out infinite alternate;"></div>
    <div class="sm-glow" style="top:-30%; left:-8%; width:42%; height:160%; background:radial-gradient(circle, rgba(120,180,150,0.16), rgba(120,180,150,0) 64%); animation:sm-drift2 21s ease-in-out infinite alternate;"></div>
    <!-- nav is injected by NAV constant above; we re-center content below -->
    <div style="position:relative; z-index:1; max-width:980px; margin:0 auto; text-align:center; padding:64px 32px 88px;">
      <div style="font-size:13px; font-weight:700; letter-spacing:0.26em; text-transform:uppercase; color:#c4973b; margin-bottom:26px;">Insights</div>
      <h1 style="font-family:'Libre Baskerville',serif; font-weight:700; font-size:clamp(40px,5.4vw,64px); line-height:1.08; margin:0 auto 26px; max-width:18ch; letter-spacing:-0.01em; text-wrap:balance; color:#F7F3EA;">Field Notes on <span class="sm-underline" style="font-style:italic; color:#c4973b;">Leadership That Holds</span></h1>
      <p style="font-size:19px; line-height:1.6; color:#C2CEC7; max-width:56ch; margin:0 auto;">Long-form essays for deep dives. Quick references you can read in two minutes.</p>
    </div>
  </header>

  <!-- TOPIC TICKER -->
  <div class="sm-ticker-band" style="position:relative; overflow:hidden; padding:11px 0; background:#1a4339; border-top:1px solid rgba(216,184,99,0.3); border-bottom:1px solid rgba(216,184,99,0.3);">
    <div style="position:absolute; left:0; top:0; bottom:0; z-index:2; display:flex; align-items:center; padding:0 22px 0 max(32px,calc((100vw - 1120px)/2 + 32px)); white-space:nowrap; font-size:11px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; color:#c4973b; background:linear-gradient(90deg,#1a4339 72%,rgba(26,67,57,0));">Across the library</div>
    <div style="position:absolute; right:0; top:0; bottom:0; z-index:2; width:80px; background:linear-gradient(270deg,#1a4339 30%,rgba(26,67,57,0));"></div>
    <div class="sm-ticker-track">
${tickerItemsHtml}
${tickerItemsHtml}
    </div>
  </div>

  <!-- ESSAYS SECTION -->
  <main>
  <section style="max-width:1120px; margin:0 auto; padding:72px 32px 80px;">
    <div data-reveal style="display:flex; align-items:baseline; gap:18px; border-bottom:1px solid #E6DDCC; padding-bottom:18px; margin-bottom:44px;">
      <h2 style="font-family:'Libre Baskerville',serif; font-weight:700; font-size:26px; margin:0; letter-spacing:-0.01em;">Essays</h2>
      <span style="font-size:15px; color:#8A8273;">Long-form deep dives on the patterns that make or break executive teams.</span>
    </div>
    ${featuredSection}
    <div class="sm-essays-grid" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(360px,1fr)); gap:24px;">
${essayCards}
    </div>
  </section>

  <!-- QUICK READS SECTION -->
  <section style="background:#1a4339; border-top:3px solid #c4973b;">
    <div style="max-width:1120px; margin:0 auto; padding:84px 32px 100px;">
      <div data-reveal style="font-size:13px; font-weight:700; letter-spacing:0.24em; text-transform:uppercase; color:#c4973b; margin-bottom:14px;">Quick Reads</div>
      <h2 data-reveal style="font-family:'Libre Baskerville',serif; font-weight:700; font-size:30px; margin:0 0 10px; letter-spacing:-0.01em; color:#F7F2E8;">One-page references</h2>
      <p data-reveal style="font-size:17px; line-height:1.6; color:#BACBC3; max-width:56ch; margin:0 0 32px;">Single-page breakdowns of the patterns that shape executive teams — scan one in about two minutes.</p>
      <div data-reveal id="sm-filter-tabs" style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:40px;">
${filterTabs}
      </div>
      <div class="sm-quick-grid" id="sm-quick-grid" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:16px;">
${quickCards}
      </div>
    </div>
  </section>
  </main>

${FOOTER}
  </div>
  <script src="/main.js"></script>
  <script>
    (function() {
      // Scroll reveal
      var io = new IntersectionObserver(function(entries) {
        entries.forEach(function(en) {
          if (en.isIntersecting) { en.target.classList.add('sm-in'); io.unobserve(en.target); }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
      function observeAll() {
        requestAnimationFrame(function() {
          document.querySelectorAll('[data-reveal]:not(.sm-in)').forEach(function(el) { io.observe(el); });
        });
      }
      observeAll();

      // Filter tabs
      var tabs = document.querySelectorAll('.sm-tab');
      var cards = document.querySelectorAll('#sm-quick-grid .sm-card-quick');
      function setActive(tab) {
        tabs.forEach(function(t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var filter = tab.getAttribute('data-filter');
        cards.forEach(function(card) {
          if (filter === 'All' || card.getAttribute('data-category') === filter) {
            card.style.display = '';
          } else {
            card.style.display = 'none';
          }
        });
        observeAll();
      }
      if (tabs.length > 0) {
        tabs[0].classList.add('active');
        tabs.forEach(function(tab) {
          tab.addEventListener('click', function() { setActive(tab); });
        });
      }
    })();
  </script>
</body>
</html>
`;
}

/* ----------------------------- build ----------------------------- */

function loadArticle(file) {
  const raw = readFileSync(join(ARTICLES_DIR, file), 'utf8');
  const { data, content } = matter(raw);

  const rawSlug = (data.slug || file.replace(/\.md$/, '')).trim().replace(/^\/+|\/+$/g, '');
  const slug = rawSlug.toLowerCase().replace(/[^a-z0-9/-]+/g, '-').replace(/-+/g, '-');
  if (!slug) throw new Error(`Missing/invalid slug in ${file}`);
  if (!data.title) throw new Error(`Missing title in ${file}`);
  if (!data.description) throw new Error(`Missing description in ${file}`);
  // Guard: never clobber a hand-authored top-level page (e.g. /about -> about.html).
  if (existsSync(join(ROOT, `${slug}.html`))) {
    throw new Error(`slug "${slug}" collides with existing ${slug}.html — choose another slug`);
  }

  // FAQ: prefer frontmatter `faq:`; otherwise extract a "Common questions" body section.
  let faqSource = Array.isArray(data.faq) ? data.faq : null;
  let bodyTokens;
  if (faqSource) {
    bodyTokens = marked.lexer(content);
  } else {
    const split = splitFaqFromBody(content);
    bodyTokens = split.bodyTokens;
    faqSource = split.faq;
  }
  const faq = faqSource.map(normalizeFaq).filter((f) => f.q);

  const bodyHtml = tokensToHtml(bodyTokens).trim();
  const url = `${SITE}/${slug}`;

  return {
    slug,
    title: String(data.title),
    metaTitle: data.titleTag || data.metaTitle || data.title_tag || null,
    description: String(data.description),
    category: data.category || data.pillar || null,
    dek: data.dek || data.subtitle || data.excerpt || null,
    datePublished: data.datePublished || data.date || null,
    dateModified: data.dateModified || data.updated || null,
    author: data.author || 'Andy Hite',
    ogImage: data.ogImage || data.image || null,
    order: typeof data.order === 'number' ? data.order : null,
    featured: data.featured === true,
    bodyHtml,
    faq,
    url,
  };
}

/* ----------------------------- one-pagers (Quick Reads) ----------------------------- */

/**
 * Scan root-level *.html for the standalone "Insight" one-pagers and pull the bits the
 * Quick Reads grid needs. A one-pager is any root .html carrying class="header-series"
 * (hand-authored pages like /about don't have it). The one-pager files are the source of
 * truth — there is no per-page markdown.
 *
 * Adding one-pager #28: drop a new <slug>.html at the repo root (built from the same
 * template, so it carries class="header-series"), run scripts/integrate-onepagers.mjs to
 * wire in the brand shell, add its clean-URL + legacy redirects to _redirects, and it
 * shows up here automatically on the next build. No edits to this file required.
 */
const ONEPAGER_MARKER = 'class="header-series"';

function pickMeta(re, html, fallback = '') {
  const m = html.match(re);
  return m ? m[1].trim() : fallback;
}

const decodeEntities = (s = '') =>
  s.replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function trimHook(s = '', max = 90) {
  const t = s.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:—-]+$/, '') + '…';
}

function scanOnePagers() {
  const out = [];
  for (const file of readdirSync(ROOT)) {
    if (!file.endsWith('.html')) continue;
    const html = readFileSync(join(ROOT, file), 'utf8');
    if (!html.includes(ONEPAGER_MARKER)) continue;
    const slug = file.replace(/\.html$/, '');
    const rawTitle = pickMeta(/<title>([^<]*)<\/title>/, html);
    const title = decodeEntities(rawTitle.replace(/\s*\|\s*Scaling Minds\s*$/, ''));
    const category = decodeEntities(pickMeta(/class="header-category">([^<]*)</, html, 'Insight'));
    const description = decodeEntities(pickMeta(/name="description"\s+content="([^"]*)"/, html));
    out.push({ slug, title, category, hook: trimHook(description) });
  }
  // Group the Leadership series first, then any others (e.g. Wellbeing); alpha within.
  out.sort((a, b) => a.title.localeCompare(b.title));
  return out;
}

function build() {
  if (!existsSync(ARTICLES_DIR)) {
    console.warn(`[insights] No articles dir at ${ARTICLES_DIR} — writing empty index.`);
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, 'index.html'), renderIndex([]));
    return;
  }

  const files = readdirSync(ARTICLES_DIR).filter(
    (f) =>
      f.endsWith('.md') &&
      !f.startsWith('_') &&
      !f.startsWith('.') &&
      f.toLowerCase() !== 'readme.md'
  );

  const articles = [];
  for (const file of files) {
    try {
      articles.push(loadArticle(file));
    } catch (err) {
      console.error(`[insights] SKIPPED ${file}: ${err.message}`);
    }
  }

  // Sort: explicit `order` first (asc), then newest published date, then title.
  articles.sort((a, b) => {
    if (a.order != null && b.order != null) return a.order - b.order;
    if (a.order != null) return -1;
    if (b.order != null) return 1;
    const da = a.datePublished ? Date.parse(a.datePublished) : 0;
    const db = b.datePublished ? Date.parse(b.datePublished) : 0;
    if (db !== da) return db - da;
    return a.title.localeCompare(b.title);
  });

  for (const article of articles) {
    const dir = join(ARTICLE_OUT, article.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), renderArticle(article));
    console.log(`[insights] built /${article.slug}`);
  }

  const onePagers = scanOnePagers();
  mkdirSync(INSIGHTS_DIR, { recursive: true });
  writeFileSync(join(INSIGHTS_DIR, 'index.html'), renderIndex(articles, onePagers));
  console.log(`[insights] built /insights index (${articles.length} article${articles.length === 1 ? '' : 's'}, ${onePagers.length} quick reads)`);

  updateGitignore(articles.map((a) => a.slug));
}

/**
 * Keep generated, top-level article dirs out of git automatically, so the publishing
 * workflow stays "add one .md, commit, push" — no stray generated HTML to stage.
 * Rewrites a managed block in .gitignore; the rest of the file is left untouched.
 */
function updateGitignore(slugs) {
  const path = join(ROOT, '.gitignore');
  if (!existsSync(path)) return;
  const BEGIN = '# BEGIN generated-insights (auto-managed by scripts/build-insights.mjs)';
  const END = '# END generated-insights';
  const block = [BEGIN, ...slugs.sort().map((s) => `/${s}/`), END].join('\n');
  let txt = readFileSync(path, 'utf8');
  const re = new RegExp(`${BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END}`);
  txt = re.test(txt) ? txt.replace(re, block) : `${txt.replace(/\s*$/, '')}\n\n${block}\n`;
  writeFileSync(path, txt);
}

build();
