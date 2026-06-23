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
  // Lead with one cornerstone essay (frontmatter `featured: true`, else the
  // first by order) — adds hierarchy and leaves an even grid below (no orphan).
  const featured = articles.find((a) => a.featured) || articles[0] || null;
  const rest = featured ? articles.filter((a) => a !== featured) : articles;

  const featuredCard = featured
    ? `      <a class="featured-essay" href="${escapeAttr('/' + featured.slug)}">
        <div class="featured-essay__body">
          <span class="featured-essay__badge">Foundation</span>
          <h2 class="featured-essay__title">${escapeAttr(featured.title)}</h2>
          <p class="featured-essay__desc">${escapeAttr(featured.description)}</p>
          <span class="featured-essay__cta">Read the essay <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        </div>
        <div class="featured-essay__accent">
          <span class="featured-essay__accent-icon"><svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M6 10h20M6 16h14M6 22h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
          <p class="featured-essay__accent-quote">"Trust isn't the destination — it's the foundation everything else is built on."</p>
        </div>
      </a>`
    : '';

  const cards = rest
    .map(
      (a, i) => `      <a class="essay-card" href="${escapeAttr('/' + a.slug)}">
        <div class="essay-card__num">${String(i + 1).padStart(2, '0')}</div>
        <h2 class="essay-card__title">${escapeAttr(a.title)}</h2>
        <p class="essay-card__desc">${escapeAttr(a.description)}</p>
        <div class="essay-card__footer">
          <span class="essay-card__read">Read →</span>
          <span class="essay-card__arrow"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        </div>
      </a>`
    )
    .join('\n');

  // Group one-pagers by category (richest groups first) so the 27 read as a
  // handful of scannable clusters rather than one wall. The group label carries
  // the category, so the cards drop their per-card category eyebrow.
  const groups = new Map();
  for (const p of onePagers) {
    const key = p.category || 'More';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const orderedGroups = [...groups.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])
  );
  const quickGroupsHtml = orderedGroups
    .map(
      ([cat, items]) => `        <div class="qr-group">
          <div class="qr-group__header">
            <span class="qr-group__label">${escapeAttr(cat)}</span>
            <span class="qr-group__line"></span>
          </div>
          <div class="qr-grid">
${items
  .map(
    (p) => `            <a class="qr-card" href="${escapeAttr('/' + p.slug)}">
              <span class="qr-card__dot"></span>
              <h3 class="qr-card__title">${escapeAttr(p.title)}</h3>
              <p class="qr-card__hook">${escapeAttr(p.hook)}</p>
            </a>`
  )
  .join('\n')}
          </div>
        </div>`
    )
    .join('\n');

  const quickReadsSection = onePagers.length
    ? `    <section class="quick-reads">
      <div class="quick-reads__inner">
        <div class="quick-reads__head">
          <span class="section-label">Quick Reads</span>
          <h2>One-page references</h2>
          <p>Single-page breakdowns of the patterns that shape executive teams — scan one in about two minutes.</p>
        </div>
${quickGroupsHtml}
      </div>
    </section>`
    : '';

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
    :root { --green: #123E35; --green-dark: #0c2e27; --gold: #C4973B; --gold-light: #e0b96a; --cream: #F5F0E8; --white: #FFFFFF; --text-muted: #4B5563; --border: #e2d9c4; }
    .section-label { display: inline-flex; align-items: center; gap: 10px; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.18em; font-weight: 700; color: var(--gold); margin-bottom: 8px; }
    .section-label::before { content: ''; display: inline-block; width: 20px; height: 2px; background: var(--gold); }
    .insights-hero { position: relative; background: var(--green-dark); color: var(--white); padding: 140px 24px 80px; text-align: center; overflow: hidden; }
    .insights-hero::before { content: ''; position: absolute; inset: 0; background-image: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(196,151,59,0.18) 0%, transparent 70%), radial-gradient(circle at 15% 80%, rgba(196,151,59,0.08) 0%, transparent 50%); pointer-events: none; }
    .insights-hero::after { content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 64px; background: linear-gradient(to bottom right, transparent 49%, var(--white) 50%); pointer-events: none; }
    .insights-hero__inner { position: relative; max-width: 720px; margin: 0 auto; }
    .insights-hero .eyebrow { display: inline-flex; align-items: center; gap: 10px; color: var(--gold); font-size: 0.78rem; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 600; margin-bottom: 20px; }
    .insights-hero .eyebrow::before, .insights-hero .eyebrow::after { content: ''; display: inline-block; width: 28px; height: 1px; background: var(--gold); opacity: 0.6; }
    .insights-hero h1 { color: var(--white); font-family: 'Libre Baskerville', serif; font-size: clamp(2.2rem, 5vw, 3.4rem); line-height: 1.15; margin-bottom: 20px; font-weight: 700; }
    .insights-hero h1 em { color: var(--gold); font-style: italic; }
    .insights-hero p { color: rgba(255,255,255,0.68); max-width: 560px; margin: 0 auto; font-size: 1.1rem; line-height: 1.75; font-weight: 300; }
    .insights-hero__stats { display: flex; justify-content: center; gap: 48px; margin-top: 48px; padding-top: 36px; border-top: 1px solid rgba(255,255,255,0.1); }
    .insights-hero__stat { text-align: center; }
    .insights-hero__stat strong { display: block; font-family: 'Libre Baskerville', serif; font-size: 2rem; color: var(--gold); line-height: 1; margin-bottom: 4px; }
    .insights-hero__stat span { font-size: 0.82rem; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.1em; }
    .featured-section { background: var(--white); padding: 80px 24px 0; }
    .featured-section__inner { max-width: 960px; margin: 0 auto; }
    .featured-section__head { margin-bottom: 36px; }
    .featured-section__head h2 { font-family: 'Libre Baskerville', serif; font-size: clamp(1.4rem, 2.5vw, 1.8rem); color: var(--green); margin-top: 6px; }
    .featured-essay { display: grid; grid-template-columns: 1fr 320px; gap: 0; background: var(--cream); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; transition: box-shadow 0.25s ease; text-decoration: none; }
    .featured-essay:hover { box-shadow: 0 20px 48px rgba(18,62,53,0.14); }
    .featured-essay__body { padding: 48px 52px; }
    .featured-essay__badge { display: inline-block; background: var(--green); color: var(--gold); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.15em; font-weight: 700; padding: 5px 12px; border-radius: 3px; margin-bottom: 22px; }
    .featured-essay__title { font-family: 'Libre Baskerville', serif; font-size: clamp(1.5rem, 2.8vw, 2.1rem); line-height: 1.22; color: var(--green); margin-bottom: 18px; }
    .featured-essay__desc { font-size: 1.05rem; line-height: 1.75; color: var(--text-muted); margin-bottom: 28px; max-width: 56ch; }
    .featured-essay__cta { display: inline-flex; align-items: center; gap: 8px; font-size: 0.92rem; font-weight: 600; color: var(--green); border-bottom: 2px solid var(--gold); padding-bottom: 2px; }
    .featured-essay__accent { background: var(--green); display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 48px 36px; text-align: center; gap: 20px; }
    .featured-essay__accent-quote { font-family: 'Libre Baskerville', serif; font-size: 1.15rem; font-style: italic; color: rgba(255,255,255,0.85); line-height: 1.6; }
    .featured-essay__accent-icon { color: var(--gold); opacity: 0.6; }
    .essays-section { background: var(--white); padding: 64px 24px 80px; }
    .essays-section__inner { max-width: 960px; margin: 0 auto; }
    .essays-section__head { margin-bottom: 36px; }
    .essays-section__head h2 { font-family: 'Libre Baskerville', serif; font-size: clamp(1.4rem, 2.5vw, 1.8rem); color: var(--green); margin-top: 6px; }
    .essays-section__head p { color: var(--text-muted); font-size: 0.95rem; margin-top: 6px; }
    .essays-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
    .essay-card { display: flex; flex-direction: column; background: var(--white); border: 1px solid var(--border); border-radius: 8px; padding: 28px; text-decoration: none; transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease; position: relative; }
    .essay-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--gold); border-radius: 8px 8px 0 0; transform: scaleX(0); transform-origin: left; transition: transform 0.25s ease; }
    .essay-card:hover::before { transform: scaleX(1); }
    .essay-card:hover { transform: translateY(-4px); box-shadow: 0 14px 32px rgba(18,62,53,0.1); border-color: rgba(196,151,59,0.3); }
    .essay-card__num { font-size: 0.7rem; font-weight: 700; color: rgba(18,62,53,0.2); letter-spacing: 0.1em; margin-bottom: 14px; }
    .essay-card__title { font-family: 'Libre Baskerville', serif; font-size: 1.05rem; line-height: 1.35; color: var(--green); margin-bottom: 12px; flex: 1; }
    .essay-card__desc { font-size: 0.88rem; line-height: 1.6; color: var(--text-muted); margin-bottom: 20px; flex: 2; }
    .essay-card__footer { display: flex; align-items: center; justify-content: space-between; margin-top: auto; }
    .essay-card__read { font-size: 0.85rem; font-weight: 600; color: var(--green); }
    .essay-card__arrow { width: 28px; height: 28px; border-radius: 50%; background: var(--cream); display: flex; align-items: center; justify-content: center; color: var(--green); transition: background 0.2s ease; }
    .essay-card:hover .essay-card__arrow { background: var(--gold); color: var(--white); }
    .insights-empty { max-width: 600px; margin: 64px auto; text-align: center; color: var(--text-muted); }
    .quick-reads { background: var(--cream); padding: 80px 24px 100px; position: relative; }
    .quick-reads::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, var(--gold), transparent); opacity: 0.4; }
    .quick-reads__inner { max-width: 1020px; margin: 0 auto; }
    .quick-reads__head { max-width: 600px; margin: 0 auto 60px; text-align: center; }
    .quick-reads__head h2 { font-family: 'Libre Baskerville', serif; font-size: clamp(1.6rem, 3vw, 2.2rem); color: var(--green); margin: 10px 0 12px; }
    .quick-reads__head p { color: var(--text-muted); font-size: 1.0rem; line-height: 1.65; }
    .qr-group { margin-bottom: 52px; }
    .qr-group:last-child { margin-bottom: 0; }
    .qr-group__header { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
    .qr-group__label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.16em; font-weight: 700; color: var(--green); white-space: nowrap; }
    .qr-group__line { flex: 1; height: 1px; background: linear-gradient(90deg, rgba(18,62,53,0.2), transparent); }
    .qr-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
    .qr-card { display: flex; flex-direction: column; background: var(--white); border: 1px solid var(--border); border-radius: 6px; padding: 22px 24px; text-decoration: none; transition: transform 0.18s ease, box-shadow 0.18s ease; }
    .qr-card:hover { transform: translateY(-3px); box-shadow: 0 10px 28px rgba(18,62,53,0.1); }
    .qr-card__dot { width: 6px; height: 6px; border-radius: 50%; background: var(--gold); margin-bottom: 12px; }
    .qr-card__title { font-family: 'Libre Baskerville', serif; font-size: 0.97rem; line-height: 1.35; color: var(--green); margin-bottom: 8px; }
    .qr-card__hook { font-size: 0.83rem; line-height: 1.55; color: var(--text-muted); margin: 0; }
    .insights-cta { background: var(--green); padding: 72px 24px; text-align: center; position: relative; overflow: hidden; }
    .insights-cta::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse 70% 80% at 50% 50%, rgba(196,151,59,0.12), transparent); }
    .insights-cta__inner { position: relative; max-width: 600px; margin: 0 auto; }
    .insights-cta__eyebrow { color: var(--gold); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.18em; font-weight: 700; margin-bottom: 16px; }
    .insights-cta h2 { font-family: 'Libre Baskerville', serif; font-size: clamp(1.6rem, 3vw, 2.2rem); color: var(--white); margin-bottom: 16px; line-height: 1.25; }
    .insights-cta p { color: rgba(255,255,255,0.65); font-size: 1.05rem; line-height: 1.65; margin-bottom: 32px; }
    .insights-cta .btn-primary { display: inline-flex; align-items: center; gap: 8px; background: var(--gold); color: var(--white); font-weight: 600; font-size: 0.95rem; padding: 14px 28px; border-radius: 5px; text-decoration: none; transition: background 0.2s ease; }
    .insights-cta .btn-primary:hover { background: var(--gold-light); }
    @media (max-width: 900px) { .featured-essay { grid-template-columns: 1fr; } .featured-essay__accent { display: none; } .essays-grid { grid-template-columns: repeat(2, 1fr); } .qr-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 640px) { .insights-hero { padding: 110px 20px 70px; } .insights-hero__stats { gap: 28px; } .featured-section { padding: 56px 20px 0; } .featured-essay__body { padding: 32px 28px; } .essays-section { padding: 48px 20px 60px; } .essays-grid { grid-template-columns: 1fr; } .quick-reads { padding: 56px 20px 72px; } .qr-grid { grid-template-columns: 1fr; } }
  </style>
${GTAG}
</head>
<body>
${NAV}
  <div class="page-transition">
  <header class="insights-hero">
    <div class="insights-hero__inner">
      <span class="eyebrow">Insights</span>
      <h1>Field Notes on<br><em>Leadership That Holds</em></h1>
      <p>Practical reading on executive team performance, leadership transitions, and the work of building teams that don't need you in the room.</p>
      <div class="insights-hero__stats">
        <div class="insights-hero__stat"><strong>${articles.length}+</strong><span>Essays</span></div>
        <div class="insights-hero__stat"><strong>30+</strong><span>Quick Reads</span></div>
        <div class="insights-hero__stat"><strong>9</strong><span>Topics</span></div>
      </div>
    </div>
  </header>
  <main>
    <section class="featured-section">
      <div class="featured-section__inner">
        <div class="featured-section__head">
          <span class="section-label">Start Here</span>
          <h2>The essential read</h2>
        </div>
        ${featured ? featuredCard : `<div class="insights-empty"><p>New insights are on the way. Check back soon.</p></div>`}
      </div>
    </section>
    <section class="essays-section">
      <div class="essays-section__inner">
        <div class="essays-section__head">
          <span class="section-label">Essays</span>
          <h2>In-depth reads</h2>
          <p>Long-form deep dives on the patterns that make or break executive teams.</p>
        </div>
        ${rest.length ? `<div class="essays-grid">\n${cards}\n        </div>` : ''}
      </div>
    </section>
${quickReadsSection}
    <section class="insights-cta">
      <div class="insights-cta__inner">
        <p class="insights-cta__eyebrow">Ready to go deeper?</p>
        <h2>See what this work looks like in practice</h2>
        <p>If the patterns described here are showing up on your team, let's talk about what's actually getting in the way — and whether working together makes sense.</p>
        <a href="/contact" class="btn-primary">Start the conversation <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
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
