# Homebrewery Statblock

Renders Homebrewery-style D&D stat block markdown — the `{{monster,frame,wide ... }}` curly-brace syntax — directly inside an Obsidian note, unmodified from what you'd paste into [Homebrewery](https://homebrewery.naturalcrit.com/).

## Usage

Wrap your Homebrewery block in a fenced code block tagged `homebrewery-statblock`:

````markdown
```homebrewery-statblock
{{monster,frame,wide

## Raijū, Raging Bolt

*Huge Elemental (Air), Chaotic Neutral*

{{stats
...
}}

### Traits
...

}}
```
````

Nothing about the content inside the fence needs to change from what you'd paste into Homebrewery's own editor — the plugin parses the `{{ }}` divs, `\column` breaks, `Label :: value` prop lines, and GFM tables itself.

## What's implemented

- **`src/parser.ts`** — a small recursive-descent parser for the curly-brace   grammar. Tracks `{{`/`}}` depth so blocks nest correctly (e.g. `{{stats {{vitals ... }} {{tables ... }} }}`), then splits the text inside each div into headings, paragraphs, `Label :: value` prop rows, GFM tables, and `\column` breaks.
- **`src/renderer.ts`** — walks that tree and builds real DOM nodes with Obsidian's `createDiv`/`createEl`/`createSpan`/`appendText` helpers (no `innerHTML`, so nothing in the source can inject markup). Class names from the source are kept but prefixed with `hb-` (`stats` → `.hb-stats`) to avoid colliding with Obsidian's or a theme's own CSS.
- **`src/main.ts`** — registers the `homebrewery-statblock` code block processor. Parse errors (e.g. an unclosed `{{`) render as an inline error box instead of failing silently.
- **`styles.css`** — a plain, readable layout using Obsidian's theme CSS variables (adapts to light/dark automatically). Not a pixel copy of any particular Homebrewery CSS theme — restyle freely, nothing in the TS depends on the visual values here, only on the class names existing.

### The "wide" two-column layout

Homebrewery's wide monster blocks show the name/vitals/ability tables at full width, then flow Traits/Actions/Reactions into two columns. That split isn't marked explicitly in the source — it falls out of wherever the `{{stats}}` div happens to close relative to the first `###` heading. The renderer approximates it generically: for any div classed `wide`, everything before its first level-3-or-deeper heading stays full width (`.hb-header`), everything from that heading on gets `columns: 2` (`.hb-body`), and `\column` forces a break wherever it appears. This was built and tested against a real Homebrewery-exported monster block — if your other statblocks structure things differently, this is the function to adjust: `renderWideSplit()` in `src/renderer.ts`.

### Not handled (yet)

The grammar here is scoped to what stat blocks actually use — no lists, links, code spans, or blockquotes. If a block you paste in uses one of those, it'll fall through to plain paragraph text. Extend `parseTextBlocks()` in `src/parser.ts` and the `INLINE_RE` regex in `src/renderer.ts` if you need more of Homebrewery's grammar.

## Try it

Copy `test-note.md` into your vault with the plugin enabled — it's your Raijū block wrapped in the fence above, and doubles as a regression fixture: the parser and renderer were both tested against it (a plain-Node harness outside Obsidian, dumping the resulting DOM tree) before this was written up.

## Development

This started from the standard [obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin) template, so the usual workflow applies unchanged:

- `npm i`
- `npm run dev` to compile `src/main.ts` → `main.js` in watch mode
- Copy `main.js`, `styles.css`, `manifest.json` into `VaultFolder/.obsidian/plugins/homebrewery-statblock/` (or symlink the repo there) and enable the plugin in Obsidian's settings

No changes were needed to `esbuild.config.mjs`, `tsconfig.json`, or `package.json` — the template already bundles `src/main.ts`. The sample plugin's ribbon icon, settings tab, and modal were removed from `main.ts` since this plugin doesn't need them.

## TODO

- Fix spacing between the end of a paragraph and the next heading (e.g. the gap between the last trait and the 'Actions' heading)
- Fix immunities appearing on a second line
