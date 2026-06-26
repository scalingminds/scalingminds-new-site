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
      ${datePublished ? `<p class="article-hero__meta"><time datetime="${isoDate(datePublished)}">Published ${formatDate(datePublished)}</time></p>` : ''}
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
        <a href="/six-shifts" class="btn btn--primary">Start the Conversation</a>
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

function isoDate(d) {
  try {
    const date = typeof d === 'string' ? new Date(d + 'T00:00:00') : new Date(d);
    return date.toISOString().split('T')[0];
  } catch {
    return String(d);
  }
}

/* ----------------------------- index page ----------------------------- */

function renderIndex(articles, onePagers = []) {
  // Reading times from design spec, keyed by slug (fallback: "6 min").
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
  const readOf = (a) => readTimes[a.slug] || '6 min';

  // Editorial topic taxonomy for the All Essays filter (from the redesign spec).
  // Frontmatter categories are almost all "Insight", so topics are curated here;
  // anything not listed falls back to its category.
  const TOPIC_MAP = {
    'founder-bottleneck': 'CEO Problems',
    'executive-team-trust': 'Trust',
    'founder-led-to-team-led': 'CEO Problems',
    'leadership-team-hard-conversations': 'Candor',
    'leaders-wont-take-ownership': 'Ownership',
    'psychological-safety-executive-team': 'Trust',
    'does-my-leadership-team-need-a-coach': 'Coaching 101',
    'working-with-executive-team-coach': 'Team Dysfunction',
    'six-shifts-explained': 'Six Shifts',
  };
  const topicOf = (a) => TOPIC_MAP[a.slug] || a.category || 'Insight';

  // ---- START HERE: curated symptom -> essay triage cards (exact, from spec) ----
  const triageCards = [
    { slug: 'leadership-team-hard-conversations', symptom: 'If your meetings feel fine but nothing actually changes afterward', title: 'Why Leadership Teams Avoid Hard Conversations' },
    { slug: 'founder-bottleneck', symptom: 'If everything still runs through you, no matter what you try to delegate', title: 'The Founder Bottleneck' },
    { slug: 'executive-team-trust', symptom: 'If your team is good enough on paper but somehow not clicking together', title: "When Your Executive Team Doesn't Trust Each Other" },
    { slug: 'does-my-leadership-team-need-a-coach', symptom: "If you're not sure what's broken — only that something quietly is", title: 'Does My Leadership Team Need a Coach?' },
  ];
  const triageHtml = triageCards
    .map(
      (c) => `        <a href="${escapeAttr('/' + c.slug)}" class="ins-triage__card">
          <span class="ins-triage__symptom">${escapeAttr(c.symptom)}</span>
          <span class="ins-triage__title">${escapeAttr(c.title)} <span class="ins-triage__arrow">→</span></span>
        </a>`
    )
    .join('\n');

  // ---- All Essays: dynamic rows over every essay, with topic tabs ----
  const essayRows = articles
    .map((a, i) => {
      const topic = topicOf(a);
      return `        <a href="${escapeAttr('/' + a.slug)}" class="ins-essay-row" data-topic="${escapeAttr(topic)}">
          <span class="ins-essay-num">${String(i + 1).padStart(2, '0')}</span>
          <span class="ins-essay-body">
            <span class="ins-essay-title">${escapeAttr(a.title)}</span>
            <span class="ins-essay-dek">${escapeAttr(trimHook(a.description, 150))}</span>
          </span>
          <span class="ins-essay-meta">${escapeAttr(readOf(a))} · ${escapeAttr(topic)}</span>
        </a>`;
    })
    .join('\n');

  // Topic tabs: curated order first, then any remaining topics alphabetically.
  const TOPIC_ORDER = ['Trust', 'Candor', 'Ownership', 'CEO Problems', 'Team Dysfunction', 'Coaching 101', 'Six Shifts'];
  const present = new Set(articles.map(topicOf));
  const ordered = [
    ...TOPIC_ORDER.filter((t) => present.has(t)),
    ...[...present].filter((t) => !TOPIC_ORDER.includes(t)).sort(),
  ];
  const tabList = ['All', ...ordered];
  const tabsHtml = tabList
    .map(
      (t, i) => `        <button type="button" class="ins-tab${i === 0 ? ' active' : ''}" data-topic="${escapeAttr(t)}">${escapeAttr(t)}</button>`
    )
    .join('\n');

  // ---- Quick References: dynamic dot-link cards over every one-pager ----
  const quickHtml = onePagers
    .map(
      (p) => `      <a href="${escapeAttr('/' + p.slug)}" class="ins-quick-card"><span class="ins-quick-dot"></span>${escapeAttr(p.title)}</a>`
    )
    .join('\n');

  const essayCount = articles.length;
  const quickCount = onePagers.length;

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
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    ::selection { background: #c4973b; color: #fff; }

    .ins-body { background: #f5f0e8; color: #1a1a1a; font-family: 'Inter', sans-serif; }

    /* HERO */
    .ins-hero { background: #1a4339; padding: clamp(56px,8vw,92px) clamp(20px,5vw,56px) clamp(48px,6vw,72px); }
    .ins-hero__inner { max-width: 1040px; margin: 0 auto; }
    .ins-hero__eyebrow { display: flex; align-items: center; gap: 14px; margin-bottom: 26px; }
    .ins-hero__eyebrow-rule { display: block; width: 34px; height: 1px; background: #c4973b; }
    .ins-hero__eyebrow-label { color: #c4973b; font-size: 11px; letter-spacing: .22em; text-transform: uppercase; font-weight: 600; }
    .ins-hero h1 { font-family: 'Libre Baskerville', serif; color: #f5f0e8; font-size: clamp(34px,5.6vw,60px); line-height: 1.12; font-weight: 400; max-width: 880px; letter-spacing: -.01em; }
    .ins-hero h1 em { font-style: italic; color: #c4973b; }
    .ins-hero__sub { color: #f5f0e8; opacity: .66; font-size: clamp(16px,1.9vw,19px); max-width: 560px; line-height: 1.7; margin-top: 26px; }
    .ins-hero__stats { display: flex; gap: 28px; margin-top: 36px; flex-wrap: wrap; align-items: baseline; }
    .ins-hero__stat { display: flex; align-items: baseline; gap: 8px; }
    .ins-hero__stat-num { font-family: 'Libre Baskerville', serif; color: #c4973b; font-size: 22px; }
    .ins-hero__stat-label { color: #f5f0e8; opacity: .55; font-size: 13px; letter-spacing: .04em; }
    .ins-hero__divider { width: 1px; background: rgba(245,240,232,.2); align-self: stretch; }

    /* START HERE */
    .ins-triage { background: #ede7d9; border-top: 1px solid #d4cfc5; border-bottom: 1px solid #d4cfc5; padding: clamp(36px,5vw,52px) clamp(20px,5vw,56px); }
    .ins-triage__inner { max-width: 1040px; margin: 0 auto; }
    .ins-triage__header { display: flex; align-items: baseline; gap: 14px; margin-bottom: 24px; flex-wrap: wrap; }
    .ins-triage__header h2 { font-family: 'Libre Baskerville', serif; font-size: 20px; color: #1a4339; font-weight: 700; }
    .ins-triage__header span { font-size: 13px; color: #5a5a5a; }
    .ins-triage__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px,1fr)); gap: 14px; }
    .ins-triage__card { background: #fff; border: 1px solid #d4cfc5; border-radius: 2px; padding: 20px; text-decoration: none; display: flex; flex-direction: column; gap: 12px; transition: border-color .2s, box-shadow .2s; }
    .ins-triage__card:hover { border-color: #1a4339; box-shadow: 0 4px 18px rgba(26,67,57,.1); }
    .ins-triage__symptom { font-size: 13px; color: #5a5a5a; line-height: 1.5; }
    .ins-triage__title { font-family: 'Libre Baskerville', serif; color: #1a4339; font-weight: 700; font-size: 15px; line-height: 1.35; margin-top: auto; }
    .ins-triage__arrow { color: #c4973b; }

    /* MAIN */
    .ins-main { max-width: 1040px; margin: 0 auto; padding: clamp(48px,6vw,76px) clamp(20px,5vw,56px); }
    .ins-section-header { display: flex; align-items: baseline; gap: 16px; padding-bottom: 14px; border-bottom: 2px solid #1a4339; margin-bottom: 32px; }
    .ins-section-header h2 { font-family: 'Libre Baskerville', serif; font-size: 23px; color: #1a4339; font-weight: 700; }
    .ins-section-header__note { font-size: 13px; color: #5a5a5a; margin-left: auto; }

    /* FEATURED — lead card */
    .ins-lead { display: grid; grid-template-columns: 1.15fr 1fr; background: #1a4339; border-radius: 2px; overflow: hidden; text-decoration: none; margin-bottom: 20px; transition: box-shadow .25s; }
    .ins-lead:hover { box-shadow: 0 12px 36px rgba(26,67,57,.22); }
    .ins-lead__left { padding: clamp(28px,3.4vw,44px); display: flex; flex-direction: column; gap: 16px; }
    .ins-lead__eyebrow { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: #c4973b; font-weight: 700; }
    .ins-lead h3 { font-family: 'Libre Baskerville', serif; font-size: clamp(24px,3vw,32px); line-height: 1.18; color: #f5f0e8; font-weight: 400; }
    .ins-lead__dek { font-size: 15px; color: #f5f0e8; opacity: .7; line-height: 1.65; }
    .ins-lead__meta { display: flex; align-items: center; gap: 12px; font-size: 12px; color: #c4973b; margin-top: auto; }
    .ins-lead__meta-sep { opacity: .4; color: #f5f0e8; }
    .ins-lead__meta-topic { color: #f5f0e8; opacity: .6; }
    .ins-lead__cta { font-size: 13px; color: #c4973b; font-weight: 600; letter-spacing: .02em; }
    .ins-lead__right { background: #16382f; border-left: 1px solid rgba(196,151,59,.25); display: flex; align-items: center; justify-content: center; padding: 32px; position: relative; }
    .ins-lead__num { font-family: 'Libre Baskerville', serif; font-size: clamp(80px,12vw,150px); color: rgba(196,151,59,.16); line-height: 1; font-weight: 700; }
    .ins-lead__caption { position: absolute; bottom: 24px; left: 32px; right: 32px; font-size: 12px; color: #f5f0e8; opacity: .45; line-height: 1.6; border-top: 1px solid rgba(245,240,232,.14); padding-top: 14px; }

    /* FEATURED — 3-up */
    .ins-3up { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }
    .ins-3up__card { background: #fff; border: 1px solid #d4cfc5; border-top: 3px solid #c4973b; border-radius: 2px; padding: 26px; text-decoration: none; display: flex; flex-direction: column; gap: 11px; transition: box-shadow .2s; }
    .ins-3up__card:hover { box-shadow: 0 6px 22px rgba(0,0,0,.08); }
    .ins-3up__eyebrow { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: #c4973b; font-weight: 700; }
    .ins-3up__card h3 { font-family: 'Libre Baskerville', serif; font-size: 18px; line-height: 1.3; color: #1a4339; font-weight: 700; }
    .ins-3up__dek { font-size: 13.5px; color: #5a5a5a; line-height: 1.6; flex: 1; }
    .ins-3up__meta { font-size: 12px; color: #5a5a5a; }
    .ins-3up__cta { font-size: 13px; color: #1a4339; font-weight: 600; }

    .ins-divider { border: none; border-top: 1px solid #d4cfc5; margin: clamp(44px,5vw,60px) 0; }

    /* ALL ESSAYS — tabs + rows */
    .ins-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }
    .ins-tab { background: #fff; color: #5a5a5a; border: 1px solid #d4cfc5; border-radius: 2px; padding: 7px 16px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; cursor: pointer; transition: background .15s, color .15s, border-color .15s; font-family: 'Inter', sans-serif; }
    .ins-tab:hover { color: #1a4339; border-color: #1a4339; }
    .ins-tab.active { background: #1a4339; color: #f5f0e8; border-color: #1a4339; }
    .ins-essays { margin-top: 8px; }
    .ins-essay-row { display: grid; grid-template-columns: 30px 1fr auto; gap: 20px; padding: 20px 12px; border-bottom: 1px solid #d4cfc5; text-decoration: none; color: inherit; transition: background .15s, box-shadow .15s; border-radius: 2px; }
    .ins-essay-row:hover { background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,.05); }
    .ins-essay-num { font-family: 'Libre Baskerville', serif; font-size: 13px; color: #c4973b; font-weight: 700; padding-top: 3px; }
    .ins-essay-body { display: flex; flex-direction: column; gap: 5px; }
    .ins-essay-title { font-family: 'Libre Baskerville', serif; font-size: 16.5px; color: #1a4339; font-weight: 700; line-height: 1.34; }
    .ins-essay-dek { font-size: 13px; color: #5a5a5a; line-height: 1.5; }
    .ins-essay-meta { font-size: 12px; color: #5a5a5a; white-space: nowrap; padding-top: 4px; text-align: right; }

    /* QUICK REFERENCES */
    .ins-quick-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px,1fr)); gap: 10px; }
    .ins-quick-card { background: #fff; border: 1px solid #d4cfc5; border-radius: 2px; padding: 13px 16px; text-decoration: none; color: #1a1a1a; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 10px; transition: border-color .15s, color .15s; }
    .ins-quick-card:hover { border-color: #1a4339; color: #1a4339; }
    .ins-quick-dot { width: 6px; height: 6px; background: #c4973b; border-radius: 50%; flex-shrink: 0; }

    /* CTA BAND */
    .ins-cta { background: #1a4339; border-radius: 2px; padding: clamp(36px,5vw,52px); display: flex; align-items: center; justify-content: space-between; gap: 32px; flex-wrap: wrap; margin-top: clamp(48px,6vw,72px); }
    .ins-cta__text { flex: 1; min-width: 280px; }
    .ins-cta h3 { font-family: 'Libre Baskerville', serif; color: #f5f0e8; font-size: clamp(22px,2.6vw,28px); font-weight: 400; line-height: 1.25; margin-bottom: 12px; }
    .ins-cta h3 em { font-style: italic; color: #c4973b; }
    .ins-cta__sub { color: #f5f0e8; opacity: .68; font-size: 15px; max-width: 460px; line-height: 1.65; }
    .ins-cta__btn { background: #c4973b; color: #f5f0e8; padding: 15px 30px; font-size: 14px; font-weight: 700; text-decoration: none; white-space: nowrap; border-radius: 2px; letter-spacing: .03em; transition: background .2s; font-family: 'Inter', sans-serif; }
    .ins-cta__btn:hover { background: #b1862f; }

    @media (max-width: 860px) {
      .ins-lead { grid-template-columns: 1fr; }
      .ins-lead__right { display: none; }
      .ins-3up { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 580px) {
      .ins-3up { grid-template-columns: 1fr; }
      .ins-essay-row { grid-template-columns: 24px 1fr; }
      .ins-essay-meta { display: none; }
    }
  </style>
${GTAG}
</head>
<body class="ins-body">
${NAV}
  <div class="page-transition">

  <!-- HERO -->
  <header class="ins-hero">
    <div class="ins-hero__inner">
      <div class="ins-hero__eyebrow">
        <span class="ins-hero__eyebrow-rule"></span>
        <span class="ins-hero__eyebrow-label">Field Notes for CEOs</span>
      </div>
      <h1>Your leadership team has the talent.<br><em>This is about the gap.</em></h1>
      <p class="ins-hero__sub">Long-form essays and quick references for executives who sense something is off with their team — and want to name it precisely before it costs them.</p>
      <div class="ins-hero__stats">
        <div class="ins-hero__stat">
          <span class="ins-hero__stat-num">${essayCount}</span>
          <span class="ins-hero__stat-label">essays</span>
        </div>
        <div class="ins-hero__divider"></div>
        <div class="ins-hero__stat">
          <span class="ins-hero__stat-num">${quickCount}</span>
          <span class="ins-hero__stat-label">quick references</span>
        </div>
      </div>
    </div>
  </header>

  <!-- START HERE -->
  <section class="ins-triage">
    <div class="ins-triage__inner">
      <div class="ins-triage__header">
        <h2>Start where it hurts</h2>
        <span>Four ways CEOs find their way in. Pick the one that sounds like you.</span>
      </div>
      <div class="ins-triage__grid">
${triageHtml}
      </div>
    </div>
  </section>

  <!-- MAIN -->
  <main class="ins-main">

    <!-- FEATURED ESSAYS -->
    <div class="ins-section-header">
      <h2>Featured Essays</h2>
      <span class="ins-section-header__note">The highest-stakes reads</span>
    </div>

    <a href="/founder-bottleneck" class="ins-lead">
      <div class="ins-lead__left">
        <span class="ins-lead__eyebrow">Most Read</span>
        <h3>The Founder Bottleneck: Why Everything Runs Through You</h3>
        <p class="ins-lead__dek">The founder bottleneck is when a company grows but its decisions don't. Why delegation alone won't fix it — and the sequence that does.</p>
        <div class="ins-lead__meta">
          <span>7 min read</span>
          <span class="ins-lead__meta-sep">·</span>
          <span class="ins-lead__meta-topic">Ownership</span>
        </div>
        <span class="ins-lead__cta">Read the essay →</span>
      </div>
      <div class="ins-lead__right">
        <span class="ins-lead__num">01</span>
        <span class="ins-lead__caption">The first essay most CEOs read — and the one they send to their COO afterward.</span>
      </div>
    </a>

    <div class="ins-3up">
      <a href="/executive-team-trust" class="ins-3up__card">
        <span class="ins-3up__eyebrow">Start Here</span>
        <h3>When Your Executive Team Doesn't Trust Each Other</h3>
        <p class="ins-3up__dek">Polite meetings, hallway truth. Why offsites don't fix it — and what the research says does.</p>
        <span class="ins-3up__meta">6 min · Trust</span>
        <span class="ins-3up__cta">Read →</span>
      </a>
      <a href="/working-with-executive-team-coach" class="ins-3up__card">
        <span class="ins-3up__eyebrow">If You're On the Fence</span>
        <h3>What Executive Team Dysfunction Actually Costs</h3>
        <p class="ins-3up__dek">It never shows up on a P&amp;L. The real cost is decision speed, redone work, and lost executives.</p>
        <span class="ins-3up__meta">6 min · CEO Problems</span>
        <span class="ins-3up__cta">Read →</span>
      </a>
      <a href="/six-shifts-explained" class="ins-3up__card">
        <span class="ins-3up__eyebrow">Framework Overview</span>
        <h3>The Six Shifts, Explained: A Leadership Operating System</h3>
        <p class="ins-3up__dek">Trust, candor, ownership, empowerment, alignment, leadership — installed in sequence. Why order matters.</p>
        <span class="ins-3up__meta">12 min · Six Shifts</span>
        <span class="ins-3up__cta">Read →</span>
      </a>
    </div>

    <hr class="ins-divider">

    <!-- ALL ESSAYS -->
    <div class="ins-section-header">
      <h2>All Essays</h2>
      <span class="ins-section-header__note" id="ins-count-label">${essayCount} essays</span>
    </div>

    <div class="ins-tabs" id="ins-tabs">
${tabsHtml}
    </div>

    <div class="ins-essays" id="ins-essays">
${essayRows}
    </div>

    <hr class="ins-divider">

    <!-- QUICK REFERENCES -->
    <div class="ins-section-header" style="margin-bottom:28px;">
      <h2>Quick References</h2>
      <span class="ins-section-header__note">Concepts worth knowing · 2–4 min each</span>
    </div>

    <div class="ins-quick-grid">
${quickHtml}
    </div>

    <!-- CTA BAND -->
    <div class="ins-cta">
      <div class="ins-cta__text">
        <h3>If any of this is <em>hitting close to home —</em></h3>
        <p class="ins-cta__sub">A 30-minute conversation costs nothing. We'll talk about what's actually going on with your team, and whether working together makes sense.</p>
      </div>
      <a href="/contact" class="ins-cta__btn">Start the Conversation</a>
    </div>

  </main>

${FOOTER}
  </div><!-- end .page-transition -->

  <script src="/main.js"></script>
  <script>
    (function() {
      var tabsEl = document.getElementById('ins-tabs');
      var countEl = document.getElementById('ins-count-label');
      var rows = Array.prototype.slice.call(document.querySelectorAll('#ins-essays .ins-essay-row'));
      var total = rows.length;
      function pad(n) { return n < 10 ? '0' + n : '' + n; }
      function apply(topic) {
        var shown = 0;
        rows.forEach(function(r) {
          var match = topic === 'All' || r.getAttribute('data-topic') === topic;
          r.style.display = match ? '' : 'none';
          if (match) {
            shown++;
            var num = r.querySelector('.ins-essay-num');
            if (num) num.textContent = pad(shown);
          }
        });
        countEl.textContent = topic === 'All' ? total + ' essays' : shown + ' in ' + topic;
      }
      if (tabsEl) {
        tabsEl.addEventListener('click', function(ev) {
          var btn = ev.target.closest('.ins-tab');
          if (!btn) return;
          tabsEl.querySelectorAll('.ins-tab').forEach(function(t) { t.classList.remove('active'); });
          btn.classList.add('active');
          apply(btn.getAttribute('data-topic'));
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
