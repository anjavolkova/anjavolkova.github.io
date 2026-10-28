// @ts-check
import { defineConfig } from "astro/config";

// A static site: every page is built to an .html file named after it
// (lore.html, on-my-disk.html), which GitHub Pages serves at /lore,
// /on-my-disk. Everything in public/ (the CSS, the scripts, the pictures)
// is copied over as it is. The markup keeps its whitespace exactly as
// written, so text and inline elements sit as they always have.
export default defineConfig({
  site: "https://annavolkova.design",
  build: { format: "file" },
  compressHTML: false,
});
