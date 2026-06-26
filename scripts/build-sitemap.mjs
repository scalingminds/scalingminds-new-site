/**
 * build-sitemap.mjs
 *
 * Generates sitemap.xml + robots.txt from the real content inventory so they
 * never drift as articles are added. Sources:
 *   - Essays:      insights/_articles/*.md  (frontmatter slug + dates)
 *   - One-pagers:  root *.html with class="header-series" (date from JSON-LD)
 *   - Core pages:  a small curated allowlist of public marketing pages
 *
 * URLs match each page's declared <link rel="canonical"> (no trailing slash on
 * article slugs) so the sitemap and canonicals agree.
 *
 * Run:  node scripts/build-sitemap.mjs   (wired into `npm run build`)
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://scalingminds.com';
const ARTICLES_DIR = join(ROOT, 'insights', '_articles');

/** Curated public pages (excludes utility pages like dashboard.html / form.html). */
const CORE_PAGES = [
  { path: '/', priority: '1.0', changefreq: 'monthly' },
  { path: '/about', priority: '0.9', changefreq: 'monthly' },
  { path: '/six-shifts', priority: '0.9', changefreq: 'monthly' },
  { path: '/services', priority: '0.8', changefreq: 'monthly' },
  { path: '/client-results', priority: '0.8', changefreq: 'monthly' },
  { path: '/insights', priority: '0.8', changefreq: 'weekly' },
  { path: '/contact', priority: '0.7', changefreq: 'monthly' },
];

/** Parse the leading `---` fenced frontmatter into a flat key/value map. */
const parseFrontmatter = (raw) => {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return {};
  const data = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+)\s*:\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return data;
};

const isoDate = (d) => (d ? String(d).slice(0, 10) : null);

/** Collect essay entries from markdown frontmatter. */
const essays = () => {
  if (!existsSync(ARTICLES_DIR)) return [];
  return readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_') && f.toLowerCase() !== 'readme.md')
    .map((f) => {
      const fm = parseFrontmatter(readFileSync(join(ARTICLES_DIR, f), 'utf8'));
      const slug = (fm.slug || f.replace(/\.md$/, '')).replace(/^\/+|\/+$/g, '');
      return {
        loc: `${SITE}/${slug}`,
        lastmod: isoDate(fm.dateModified || fm.datePublished),
        priority: '0.8',
      };
    });
};

/** Collect one-pager entries from root *.html carrying the one-pager marker. */
const onePagers = () =>
  readdirSync(ROOT)
    .filter((f) => f.endsWith('.html'))
    .filter((f) => readFileSync(join(ROOT, f), 'utf8').includes('header-series'))
    .map((f) => {
      const html = readFileSync(join(ROOT, f), 'utf8');
      const date = html.match(/"datePublished"\s*:\s*"([^"]+)"/);
      return {
        loc: `${SITE}/${f.replace(/\.html$/, '')}`,
        lastmod: date ? isoDate(date[1]) : null,
        priority: '0.7',
      };
    });

const core = CORE_PAGES.map((p) => ({
  loc: p.path === '/' ? `${SITE}/` : `${SITE}${p.path}`,
  changefreq: p.changefreq,
  priority: p.priority,
}));

const urls = [...core, ...essays(), ...onePagers()];

const urlXml = (u) =>
  [
    '  <url>',
    `    <loc>${u.loc}</loc>`,
    u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : null,
    u.changefreq ? `    <changefreq>${u.changefreq}</changefreq>` : null,
    u.priority ? `    <priority>${u.priority}</priority>` : null,
    '  </url>',
  ]
    .filter(Boolean)
    .join('\n');

const sitemap =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map(urlXml).join('\n') +
  '\n</urlset>\n';

const robots = `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`;

writeFileSync(join(ROOT, 'sitemap.xml'), sitemap);
writeFileSync(join(ROOT, 'robots.txt'), robots);

console.log(
  `[sitemap] ${urls.length} urls (${core.length} core, ${essays().length} essays, ${onePagers().length} one-pagers) -> sitemap.xml + robots.txt`
);
