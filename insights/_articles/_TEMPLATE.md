---
# Files starting with "_" are ignored by the builder — copy this to a real
# filename (e.g. my-article-slug.md) to publish a new Insight.
#
# Required: slug, title, description.  Everything else is optional.
slug: my-article-slug              # becomes the URL: /insights/my-article-slug
title: "The On-Page H1 and Default <title>"
titleTag: "Full SEO Title Tag — Keyword Rich | Scaling Minds"   # optional; overrides <title> only
description: "The meta description + Open Graph description. ~150–160 characters, written to earn the click."
category: "Trust"                  # the gold eyebrow label (e.g. a Six Shifts pillar)
dek: "Optional one-sentence subtitle shown under the H1 in the hero."
datePublished: 2026-06-12          # YYYY-MM-DD
author: "Andy Hite"
# order: 1                         # optional manual sort weight for the index (lower = first)
# ogImage: /og-image.png           # optional per-article social image; defaults to site OG image
---

Open with the hook. Normal prose, normal markdown. **Bold** and [internal links](/six-shifts) work as expected.

## Phrase Section Headings as Questions

This is good for AI/search visibility. Each `##` becomes a styled green Libre Baskerville heading.

> Pull quotes render as a gold-bordered serif blockquote.

## Common Questions

Everything under this heading is pulled OUT of the prose, rendered as a styled FAQ
accordion, AND emitted as FAQPage schema for Google/AI. (You can instead define an
`faq:` list in the frontmatter — either works.)

### Is this question phrased the way someone would search it?

Yes. The question becomes the FAQ `<summary>` and the schema Question name; the
paragraph(s) below become the answer.

### Can answers have multiple paragraphs or lists?

Yes — everything until the next question heading is the answer.

---

*Author byline goes here, at the bottom of the file, and renders as part of the prose.*
