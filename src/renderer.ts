import type { Block } from "./parser";

/**
 * Renders a parsed Homebrewery Block tree into `container`, using Obsidian's
 * createDiv/createEl/createSpan/appendText helpers rather than innerHTML —
 * all text reaches the DOM via textContent-safe APIs, so nothing in the
 * source markdown can inject markup.
 */
export function renderStatblock(blocks: Block[], container: HTMLElement): void {
	renderBlocks(blocks, container);
}

function renderBlocks(blocks: Block[], container: HTMLElement): void {
	for (const block of blocks) {
		renderBlock(block, container);
	}
}

function renderBlock(block: Block, container: HTMLElement): void {
	switch (block.type) {
		case "div": {
			const cls = block.classes.map((c) => `hb-${sanitizeClass(c)}`).join(" ");
			const div = container.createDiv({ cls });
			const isWide = block.classes.some((c) => c.toLowerCase() === "wide");
			if (isWide) {
				renderWideSplit(block.children, div);
			} else {
				renderBlocks(block.children, div);
			}
			break;
		}
		case "heading": {
			const level = Math.min(Math.max(block.level, 1), 6);
			const tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
			renderInline(container.createEl(tag), block.text);
			break;
		}
		case "paragraph": {
			renderInline(container.createEl("p"), block.text);
			break;
		}
		case "prop": {
			const row = container.createDiv({ cls: "hb-prop" });
			renderInline(row.createSpan({ cls: "hb-prop-label" }), block.label);
			renderInline(row.createSpan({ cls: "hb-prop-value" }), block.value);
			break;
		}
		case "table": {
			const table = container.createEl("table");
			const headRow = table.createEl("thead").createEl("tr");
			for (const cell of block.header) {
				renderInline(headRow.createEl("th"), cell);
			}
			const tbody = table.createEl("tbody");
			for (const row of block.rows) {
				const tr = tbody.createEl("tr");
				for (const cell of row) {
					renderInline(tr.createEl("td"), cell);
				}
			}
			break;
		}
	}
}

/**
 * Homebrewery's "wide" monster blocks put the name, subtitle, vitals and
 * ability-score tables above a two-column flow of Traits/Actions/Reactions
 * text. In the source markdown that split isn't marked explicitly — it
 * falls out of where the author's {{stats}} div happens to close relative
 * to the first `###` heading. We approximate it generically: everything
 * before the first level-3-or-deeper heading in a "wide" div's direct
 * children stays full width; everything from that heading onward flows into
 * two CSS columns, which the browser balances automatically — no manual
 * break needed (the parser drops \column entirely; see parser.ts).
 */
function renderWideSplit(children: Block[], container: HTMLElement): void {
	const splitIndex = children.findIndex((b) => b.type === "heading" && b.level >= 3);
	if (splitIndex === -1) {
		renderBlocks(children, container);
		return;
	}
	const header = container.createDiv({ cls: "hb-header" });
	renderBlocks(children.slice(0, splitIndex), header);

	const body = container.createDiv({ cls: "hb-body" });
	renderBlocks(children.slice(splitIndex), body);
}

// Matches ***bold italic***, then **bold**, then *italic*, in that order so
// the longer markers are never mis-split by the shorter ones.
const INLINE_RE = /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*/g;

// Homebrewery source types "--" for a minus sign (as in negative ability
// modifiers like "--2") and "---" for an em dash (as in "Response---Trigger:").
// A single "-" (e.g. "5-foot", "Recharge 5-6") is left alone. "---" is
// replaced first so it isn't mis-read as a "--" followed by a stray "-".
function normalizeDashes(text: string): string {
	return text.replace(/---/g, "\u2014").replace(/--/g, "\u2212");
}

function renderInline(parent: HTMLElement, rawText: string): void {
	const text = normalizeDashes(rawText);
	INLINE_RE.lastIndex = 0;
	let lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = INLINE_RE.exec(text)) !== null) {
		if (match.index > lastIndex) {
			parent.appendText(text.slice(lastIndex, match.index));
		}
		if (match[1] !== undefined) {
			parent.createEl("strong").createEl("em", { text: match[1] });
		} else if (match[2] !== undefined) {
			parent.createEl("strong", { text: match[2] });
		} else if (match[3] !== undefined) {
			parent.createEl("em", { text: match[3] });
		}
		lastIndex = INLINE_RE.lastIndex;
	}
	if (lastIndex < text.length) {
		parent.appendText(text.slice(lastIndex));
	}
}

// Class names from the source are rendered verbatim but prefixed with
// "hb-" so they can never collide with Obsidian's or a theme's own CSS
// classes (e.g. the source's "frame" class becoming a bare .frame would be
// asking for trouble).
function sanitizeClass(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9-]/g, "");
}
