#!/usr/bin/env node
/**
 * Translates legal/en/*.mdx line by line with a local LTEngine, keeping the Markdown structure and every link.
 *
 *   node scripts/translate-legal.mjs [--locales de,fr]
 *
 * A page is rewritten only when its English text changes (recorded in translations.lock.json).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { hash, LOCALES, ROOT } from "./lib.mjs";
import { translate } from "./mt.mjs";

const at = process.argv.indexOf("--locales");
const locales = at > 0 ? process.argv[at + 1].split(",") : LOCALES;
const lockPath = join(ROOT, "translations.lock.json");

/** Translates the text between bold markers and links, leaving the markers and URLs alone. */
async function inline(text, locale) {
    const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/);
    let out = "";
    for (const part of parts) {
        const bold = part.match(/^\*\*(.+?)(:?)\*\*$/);
        const link = part.match(/^\[(.+)\]\((.+)\)$/);
        let piece;
        if (bold) piece = `**${/^tn_/.test(bold[1]) ? bold[1] : clean(await translate(bold[1], locale))}${bold[2]}**`;
        else if (link) piece = `[${clean(await translate(link[1], locale))}](${link[2]})`;
        else if (/[A-Za-z]{2}/.test(part)) {
            const [, lead, core, tail] = part.match(/^([\s.,;:]*)([\s\S]*?)(\s*)$/);
            piece = lead + spaced(clean(await translate(core, locale))) + tail;
        } else piece = part;
        // Markdown closes bold only next to a space or punctuation it knows.
        if (out && (bold || link) && !/\s$/.test(out)) out += " ";
        if (out.endsWith("**") && piece && !/^[\s.,;:]/.test(piece)) out += " ";
        out += piece;
    }
    return out;
}

const clean = (text) => text.replace(/[*_`<>{}[\]\\]/g, (c) => (c === "_" ? "_" : "")).replace(/\s*\n\s*/g, " ");
/** A bare link runs on into following letters or CJK punctuation, so it ends with a space or ASCII punctuation. */
const spaced = (text) =>
    text.replace(/(https?:\/\/[\w./-]*[\w/]|[\w.]+@[\w.]+\w)(?=[^\s\w./-])/g, (url, _, offset) =>
        /[.,;:)]/.test(text[offset + url.length]) && /^.\s|^.$/.test(text.slice(offset + url.length)) ? url : `${url} `,
    );

for (const file of readdirSync(join(ROOT, "legal", "en"))) {
    const source = readFileSync(join(ROOT, "legal", "en", file), "utf8").replace(/\r\n/g, "\n");
    for (const locale of locales) {
        const label = `legal/${locale}/${file}`;
        const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, "utf8")) : {};
        if (lock[label] === hash(source) && existsSync(join(ROOT, label))) continue;
        const lines = [];
        let left = 0;
        for (const line of source.split("\n")) {
            const front = line.match(/^(title|description): "(.*)"$/);
            const [, mark, text] = line.match(/^((?:#+ |- |\d+\. )?(?:\d+(?:\.\d+)*\.? (?=\S))?)(.*)$/);
            try {
                if (front) lines.push(`${front[1]}: "${(await translate(front[2], locale)).replace(/["“”„«»\\]/g, "")}"`);
                else if (line.startsWith("updated:") || line === "---" || !text.trim()) lines.push(line);
                else lines.push(mark + (await inline(text, locale)));
            } catch (error) {
                console.error(`${label}: ${error.message}: ${text.slice(0, 60)}`);
                lines.push(line);
                left++;
            }
        }
        mkdirSync(join(ROOT, "legal", locale), { recursive: true });
        writeFileSync(join(ROOT, label), lines.join("\n"));
        if (left === 0) {
            lock[label] = hash(source);
            writeFileSync(lockPath, `${JSON.stringify(lock, null, 1)}\n`);
        }
        console.log(`${label}: ${left} lines left in English`);
    }
}
