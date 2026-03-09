import { writeFileSync } from "fs";
import { glossaryTerms } from "../src/data/glossary";
import { comparisons } from "../src/data/comparisons";
import { personas } from "../src/data/personas";
import { curations } from "../src/data/curations";

const BASE = "https://rayfinance.app";
const TODAY = new Date().toISOString().split("T")[0];

interface Page {
  loc: string;
  priority: string;
}

const pages: Page[] = [
  // Homepage
  { loc: "/", priority: "1.0" },

  // Hub pages
  { loc: "/learn", priority: "0.8" },
  { loc: "/compare", priority: "0.8" },
  { loc: "/for", priority: "0.8" },
  { loc: "/best", priority: "0.8" },

  // Glossary spokes
  ...glossaryTerms.map((t) => ({
    loc: `/learn/${t.slug}`,
    priority: "0.6",
  })),

  // Comparison spokes
  ...comparisons.map((c) => ({
    loc: `/compare/${c.slug}`,
    priority: "0.7",
  })),

  // Persona spokes
  ...personas.map((p) => ({
    loc: `/for/${p.slug}`,
    priority: "0.7",
  })),

  // Curation spokes
  ...curations.map((c) => ({
    loc: `/best/${c.slug}`,
    priority: "0.7",
  })),
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (p) => `  <url>
    <loc>${BASE}${p.loc}</loc>
    <lastmod>${TODAY}</lastmod>
    <priority>${p.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>
`;

writeFileSync("out/sitemap.xml", xml);
console.log(`Sitemap generated with ${pages.length} URLs`);
