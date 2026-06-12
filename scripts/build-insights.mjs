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

function renderIndex(articles) {
  const cards = articles
    .map(
      (a) => `      <a class="insight-card" href="${escapeAttr('/' + a.slug)}">
        <span class="insight-card__cat">${escapeAttr(a.category || 'Insight')}</span>
        <h2 class="insight-card__title">${escapeAttr(a.title)}</h2>
        <p class="insight-card__desc">${escapeAttr(a.description)}</p>
        <span class="insight-card__more">Read →</span>
      </a>`
    )
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
    :root { --green: #123E35; --gold: #C4973B; --cream: #F5F0E8; --white: #FFFFFF; --text-muted: #4B5563; }
    .insights-hero { background: var(--green); color: var(--white); padding: 120px 24px 64px; text-align: center; }
    .insights-hero .eyebrow { color: var(--gold); margin-bottom: 16px; }
    .insights-hero h1 { color: var(--white); font-size: clamp(2rem, 4vw, 3rem); margin-bottom: 16px; }
    .insights-hero h1 em { color: var(--gold); font-style: normal; display: inline; background-image: linear-gradient(var(--gold), var(--gold)); background-repeat: no-repeat; background-position: left bottom; background-size: 0% 3px; padding-bottom: 2px; animation: insights-underline 1s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.5s forwards; }
    @keyframes insights-underline { to { background-size: 100% 3px; } }
    @media (prefers-reduced-motion: reduce) { .insights-hero h1 em { animation: none; background-size: 100% 3px; } }
    .insights-hero p { color: rgba(255,255,255,0.72); max-width: 600px; margin: 0 auto; font-size: 1.12rem; line-height: 1.7; }
    .insights-grid { max-width: 840px; margin: 0 auto; padding: 56px 24px 80px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
    .insight-card { display: flex; flex-direction: column; background: var(--white); border: 1px solid #e7e2d6; border-radius: 8px; padding: 28px; transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease; }
    .insight-card:hover { transform: translateY(-3px); box-shadow: 0 12px 28px rgba(18,62,53,0.1); border-color: var(--gold); }
    .insight-card__cat { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 600; color: var(--gold); margin-bottom: 12px; }
    .insight-card__title { font-family: 'Libre Baskerville', serif; font-size: 1.3rem; line-height: 1.3; color: var(--green); margin-bottom: 12px; }
    .insight-card__desc { font-size: 0.98rem; line-height: 1.6; color: var(--text-muted); flex: 1; margin-bottom: 18px; }
    .insight-card__more { font-size: 0.9rem; font-weight: 600; color: var(--green); }
    .insights-empty { max-width: 600px; margin: 64px auto; text-align: center; color: var(--text-muted); }
    @media (max-width: 640px) { .insights-hero { padding: 104px 20px 48px; } .insights-grid { grid-template-columns: 1fr; padding: 44px 20px 64px; } }
  </style>
${GTAG}
</head>
<body>
${NAV}
  <div class="page-transition">
  <header class="insights-hero">
    <span class="eyebrow">Insights</span>
    <h1>Field Notes on <em>Leadership That Holds</em></h1>
    <p>Practical reading on executive team performance, leadership transitions, and the work of building teams that don't need you in the room.</p>
  </header>
  <main>
    ${articles.length
      ? `<div class="insights-grid">\n${cards}\n    </div>`
      : `<div class="insights-empty"><p>New insights are on the way. Check back soon.</p></div>`}
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
    bodyHtml,
    faq,
    url,
  };
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

  mkdirSync(INSIGHTS_DIR, { recursive: true });
  writeFileSync(join(INSIGHTS_DIR, 'index.html'), renderIndex(articles));
  console.log(`[insights] built /insights index (${articles.length} article${articles.length === 1 ? '' : 's'})`);

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
