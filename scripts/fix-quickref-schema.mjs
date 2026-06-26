/**
 * fix-quickref-schema.mjs
 *
 * One-time repair for the quick-ref one-pager Article JSON-LD that
 * `update-quickref-aeo.mjs` corrupted. That script injected datePublished/
 * dateModified before the FIRST `"url":` in the schema — which is the one
 * inside the author object — producing a double comma and date fields stranded
 * inside `author`, which makes the whole Article object invalid JSON.
 *
 * This script relocates the dates to where they belong (siblings of author),
 * repairs the commas, and validates that the Article block now parses.
 * Idempotent: files that already parse are left untouched.
 *
 * Run:  node scripts/fix-quickref-schema.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Matches the exact corruption and captures the two dates.
const BROKEN = /"name":\s*"Andy Hite",,\s*\n\s*"datePublished":\s*"([^"]+)",\s*\n\s*"dateModified":\s*"([^"]+)"\s*\n\s*"url":\s*"https:\/\/scalingminds\.com\/about"\s*\n\s*},/;

const fixBlock = (html) =>
  html.replace(
    BROKEN,
    (_m, datePublished, dateModified) =>
      `"name": "Andy Hite",\n    "url": "https://scalingminds.com/about"\n  },\n` +
      `  "datePublished": "${datePublished}",\n  "dateModified": "${dateModified}",`
  );

/** Pull the Article JSON-LD block and confirm it parses. */
const articleIsValid = (html) => {
  const blocks = [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    ),
  ].map((m) => m[1].trim());
  const article = blocks.find((b) => b.includes('"Article"'));
  if (!article) return { ok: false, reason: 'no Article block' };
  try {
    JSON.parse(article);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
};

let fixed = 0;
let alreadyOk = 0;
const failures = [];

for (const file of readdirSync(ROOT).filter((f) => f.endsWith('.html'))) {
  const path = join(ROOT, file);
  const html = readFileSync(path, 'utf8');
  if (!html.includes('header-series')) continue; // one-pagers only

  const before = articleIsValid(html);
  if (before.ok) {
    alreadyOk++;
    continue;
  }

  const repaired = fixBlock(html);
  const after = articleIsValid(repaired);
  if (after.ok) {
    writeFileSync(path, repaired);
    fixed++;
    console.log(`  fixed  ${file}`);
  } else {
    failures.push(`${file} — ${after.reason}`);
  }
}

console.log(`\nfixed: ${fixed} | already valid: ${alreadyOk} | failures: ${failures.length}`);
if (failures.length) {
  console.log('FAILURES:');
  failures.forEach((f) => console.log(`  ${f}`));
  process.exit(1);
}
