/**
 * Parser for Homebrewery's "curly brace" markdown dialect, as used for
 * Homebrewery/GM Binder D&D stat blocks (https://homebrewery.naturalcrit.com/).
 *
 * This grammar layers several non-standard constructs on top of Markdown:
 *
 *   {{className[,className2...]        block div, closed by a matching "}}".
 *     ...content...                     These nest arbitrarily, e.g.
 *   }}                                  {{stats {{vitals ... }} {{tables ... }} }}
 *
 *   \column                             a hint from Homebrewery's own hand-tuned
 *                                        layout about where it broke to the next
 *                                        column — ignored on render; see renderer.ts
 *
 *   **Label**      :: value             a "prop line" — renders as a
 *                                        label/value row (AC, HP, Skills, etc.)
 *
 *   | ... | ... |                       standard GFM pipe tables
 *   |:--|:-:|
 *
 *   # / ## / ### ...                    headings
 *   **bold**, *italic*, ***bold+italic***
 *
 * None of this is understood by Obsidian's built-in Markdown renderer, and
 * the nesting of {{ }} blocks needs depth-tracking that a single regex pass
 * can't reliably do — hence a small purpose-built parser rather than trying
 * to bolt this onto Obsidian's existing pipeline.
 *
 * The parser is intentionally scoped to what Homebrewery statblocks actually
 * use (see the "Raijū" fixture this was built and tested against). It does
 * NOT attempt to be a general Markdown engine — no lists, links, code spans,
 * or blockquotes. Extend parseTextBlocks()/the inline regex in renderer.ts
 * if you need more of Homebrewery's grammar.
 */

export type Block =
	| { type: "div"; classes: string[]; children: Block[] }
	| { type: "heading"; level: number; text: string }
	| { type: "paragraph"; text: string }
	| { type: "prop"; label: string; value: string }
	| { type: "table"; header: string[]; rows: string[][] };

export function parseHomebrewery(source: string): Block[] {
	return parseFlow(source).blocks;
}

/**
 * Scans `src` left to right, splitting it into raw text runs and {{ }} div
 * blocks. Each div's body is recursively parsed the same way, so nesting of
 * arbitrary depth "just works" via the call stack rather than manual depth
 * bookkeeping across the whole document.
 */
function parseFlow(src: string): { blocks: Block[] } {
	const blocks: Block[] = [];
	let i = 0;
	let textStart = 0;

	const flushText = (end: number): void => {
		if (end > textStart) {
			blocks.push(...parseTextBlocks(src.slice(textStart, end)));
		}
	};

	while (i < src.length) {
		if (src.startsWith("{{", i)) {
			flushText(i);

			// Class header: everything after "{{" up to the first whitespace.
			let headerEnd = i + 2;
			while (headerEnd < src.length && !/\s/.test(src[headerEnd])) {
				headerEnd++;
			}
			const classHeader = src.slice(i + 2, headerEnd);
			const classes = classHeader
				.split(",")
				.map((c) => c.trim())
				.filter(Boolean);

			// Walk forward tracking brace depth to find the matching "}}".
			let depth = 1;
			let k = headerEnd;
			while (k < src.length && depth > 0) {
				if (src.startsWith("{{", k)) {
					depth++;
					k += 2;
				} else if (src.startsWith("}}", k)) {
					depth--;
					if (depth === 0) break;
					k += 2;
				} else {
					k++;
				}
			}

			if (depth !== 0) {
				throw new Error(
					`Unclosed "{{${classHeader}" block — missing a matching "}}".`
				);
			}

			const bodySrc = src.slice(headerEnd, k);
			const { blocks: children } = parseFlow(bodySrc);
			blocks.push({ type: "div", classes, children });

			i = k + 2; // skip past the closing "}}"
			textStart = i;
			continue;
		}
		i++;
	}
	flushText(i);
	return { blocks };
}

/** Splits a run of raw text (no {{ }} in it) into block-level nodes. */
function parseTextBlocks(chunk: string): Block[] {
	const lines = chunk.replace(/\r\n/g, "\n").split("\n");
	const blocks: Block[] = [];
	let buffer: string[] = [];

	const flushParagraph = (): void => {
		if (buffer.length === 0) return;
		const text = buffer.join(" ").trim();
		buffer = [];
		if (text) blocks.push({ type: "paragraph", text });
	};

	let i = 0;
	while (i < lines.length) {
		const line = lines[i].trim();

		if (line === "") {
			flushParagraph();
			i++;
			continue;
		}

		if (/^\\column$/.test(line)) {
			// Homebrewery uses \column to mark where a hand-tuned Homebrewery
			// layout jumps to the next print column. Obsidian's CSS multi-column
			// layout balances content automatically, and a forced break here
			// tends to produce worse results than just leaving it to balance —
			// so \column is treated purely as a paragraph boundary and produces
			// no visible output of its own.
			flushParagraph();
			i++;
			continue;
		}

		const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
		if (headingMatch) {
			flushParagraph();
			blocks.push({
				type: "heading",
				level: headingMatch[1].length,
				text: headingMatch[2].trim(),
			});
			i++;
			continue;
		}

		const nextLine = (lines[i + 1] ?? "").trim();
		if (line.startsWith("|") && isTableSeparatorRow(nextLine)) {
			flushParagraph();
			const tableLines = [line];
			let j = i + 1;
			while (j < lines.length && lines[j].trim().startsWith("|")) {
				tableLines.push(lines[j].trim());
				j++;
			}
			blocks.push(parseTable(tableLines));
			i = j;
			continue;
		}

		// "Label :: value" prop line. Table rows also contain "|" so we
		// exclude those explicitly, though the branch above usually claims
		// them first anyway.
		const propIdx = line.indexOf("::");
		if (propIdx !== -1 && !line.startsWith("|")) {
			flushParagraph();
			blocks.push({
				type: "prop",
				label: line.slice(0, propIdx).trim(),
				value: line.slice(propIdx + 2).trim(),
			});
			i++;
			continue;
		}

		buffer.push(line);
		i++;
	}
	flushParagraph();
	return blocks;
}

/** True for GFM table separator rows like `|:--|:-:|:----:|:----:|`. */
function isTableSeparatorRow(line: string): boolean {
	if (!line.includes("-")) return false;
	let s = line.trim();
	if (s.startsWith("|")) s = s.slice(1);
	if (s.endsWith("|")) s = s.slice(0, -1);
	const cells = s.split("|");
	if (cells.length === 0) return false;
	return cells.every((c) => /^\s*:?-+:?\s*$/.test(c));
}

function parseTable(tableLines: string[]): Block {
	const splitRow = (l: string): string[] => {
		let s = l.trim();
		if (s.startsWith("|")) s = s.slice(1);
		if (s.endsWith("|")) s = s.slice(0, -1);
		return s.split("|").map((c) => c.trim());
	};
	const header = splitRow(tableLines[0]);
	const rows = tableLines.slice(2).map(splitRow);
	return { type: "table", header, rows };
}
