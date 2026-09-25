import { Plugin } from "obsidian";
import { parseHomebrewery } from "./parser";
import { renderStatblock } from "./renderer";

/**
 * Renders Homebrewery-style D&D stat block markdown (the
 * {{monster,frame,wide ... }} curly-brace syntax) inside a
 * ```homebrewery-statblock fenced code block.
 *
 * Usage in a note:
 *
 *   ```homebrewery-statblock
 *   {{monster,frame,wide
 *
 *   ## Raijū, Raging Bolt
 *   ...
 *   }}
 *   ```
 *
 * The fenced block's content is passed through unmodified from what you'd
 * paste into Homebrewery — no reformatting required.
 */
export default class HomebreweryStatblockPlugin extends Plugin {
	async onload(): Promise<void> {
		this.registerMarkdownCodeBlockProcessor("homebrewery-statblock", (source, el) => {
			const root = el.createDiv({ cls: "hb-statblock-root" });
			try {
				const blocks = parseHomebrewery(source);
				renderStatblock(blocks, root);
			} catch (err) {
				root.empty();
				const errBox = root.createDiv({ cls: "hb-statblock-error" });
				errBox.createEl("strong", {
					text: "Homebrewery Statblock couldn't render this block:",
				});
				errBox.createEl("pre", {
					text: err instanceof Error ? err.message : String(err),
				});
			}
		});
	}
}
