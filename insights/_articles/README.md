# Insights — how to publish

Each article is **one markdown file** in this folder. To publish:

1. Copy `_TEMPLATE.md` to `your-slug.md` and write the article.
2. Commit and push.

Netlify runs `npm run build:insights` on deploy, which turns every `.md` here into:

- `/insights/<slug>` — the article page (Article + FAQPage + BreadcrumbList JSON-LD,
  canonical, OG/Twitter tags, on-brand design)
- `/insights/` — the index, automatically listing every article

That's it. No HTML to touch, no index to update by hand.

## Notes

- Files starting with `_` (like `_TEMPLATE.md`) are ignored.
- Required frontmatter: `slug`, `title`, `description`. A file missing these is
  skipped with a warning (it won't break the rest of the build).
- Generated HTML is **not** committed (it's in `.gitignore`); it's built fresh on deploy.
- To preview locally: `npm install && npm run build:insights`, then serve the repo root
  (e.g. `python3 -m http.server 8770`) and open `/insights/`.

The builder lives at `../../scripts/build-insights.mjs`.
