/** Guarded machine translation through LTEngine. A result that breaks a rule is retried another way, then refused. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BRANDS, mismatch } from "./lib.mjs";

const BASE = process.env.LTENGINE_URL ?? "http://127.0.0.1:5050";
const TARGET = { zh: "zh-Hans" };

const glossaryPath = join(import.meta.dirname, "glossary.json");
const GLOSSARY = existsSync(glossaryPath) ? JSON.parse(readFileSync(glossaryPath, "utf8")) : {};

async function request(text, locale, format = "text") {
    for (let attempt = 1; ; attempt++) {
        try {
            const response = await fetch(`${BASE}/translate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ q: text, source: "en", target: TARGET[locale] ?? locale, format }),
                signal: AbortSignal.timeout(120_000),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return (await response.json()).translatedText.trim().replace(/'(?=[{<])/g, "’");
        } catch (error) {
            if (attempt === 4) throw error;
            await new Promise((done) => setTimeout(done, attempt * 2000));
        }
    }
}

const SENTINEL = /⟦K(\d+)⟧/g;
/** Placeholders, tags, color codes, links and addresses never reach the model. */
const TOKEN = /\{\w+\}|<\/?\w+>|§.|%[sd]|https?:\/\/[^\s)]*[^\s).,;]|[\w.]+@[\w.]+\w|\btn_\w+/g;

function problem(english, out) {
    const bad = mismatch(english, out);
    if (bad) return bad;
    if (/[⟦⟧]/.test(out)) return "kept a sentinel";
    if (/[?؟]{2}/.test(out)) return "doubled a question mark";
    if (out.length > Math.max(40, english.length * 4)) return "too long";
    if (/^(?:Source|Translation|English|German|French|Italian|Polish|Russian|Turkish|Chinese|Japanese)\s*:/i.test(out)) return "meta text";
    const unit = english.match(/(?:FPS|BPS|CPS|XYZ)/g)?.find((name) => !out.includes(name));
    if (unit) return `lost ${unit}`;
    const lost = BRANDS.find((brand) => new RegExp(`\\b${brand}\\b`).test(english) && !out.includes(brand));
    if (lost) return `lost ${lost}`;
    const kept = english.match(TOKEN) ?? [];
    return kept.every((token) => out.includes(token)) ? null : "lost a token";
}

export async function translate(english, locale) {
    const known = GLOSSARY[english]?.[locale];
    if (known) return known;
    const store = [];
    const masked = english.replace(TOKEN, (token) => `⟦K${store.push(token) - 1}⟧`);
    const brands = new RegExp(`${TOKEN.source}|\\b(?:${BRANDS.join("|")})\\b`, "g");
    const brandOnly = new RegExp(`\\b(?:${BRANDS.join("|")})\\b(?![.]rip)`, "g");
    const names = [];
    const nameless = english.replace(brands, (token) => `⟦K${names.push(token) - 1}⟧`);
    const attempts = [
        // "Tenacity" and "Opal" are also ordinary words, so the model translates them. A code name it leaves alone.
        ...(english.search(brandOnly) >= 0 ? [masked, english] : []).map((text) => async () => {
            const coded = text.replace(brandOnly, (brand) => `QX${BRANDS.indexOf(brand) + 10}`);
            const out = await request(coded, locale, /<\w+>/.test(coded) ? "html" : "text");
            return out
                .replace(SENTINEL, (_, i) => store[i] ?? "")
                .replace(/QX(\d\d)/g, (code, n) => BRANDS[Number(n) - 10] ?? code);
        }),
        ...(/<\w+>/.test(english) ? [async () => request(english, locale, "html")] : []),
        async () => (await request(masked, locale)).replace(SENTINEL, (_, i) => store[i] ?? ""),
        async () => request(english, locale),
        async () => (await request(nameless, locale)).replace(SENTINEL, (_, i) => names[i] ?? ""),
        async () => request(english.replace(new RegExp(`\\b(?:${BRANDS.join("|")})\\b`, "g"), '"$&"'), locale).then((out) =>
            out.replace(new RegExp(`["“”„«»「」]\\s?(${BRANDS.join("|")})\\s?["“”„«»「」]`, "g"), "$1"),
        ),
        // Fragments lose their grammar, so only short text may be split around its tokens.
        ...(english.split(" ").length > 4 ? [] : [
        async () => {
            const parts = english.split(new RegExp(`(${TOKEN.source}|\\b(?:${BRANDS.join("|")})\\b)`));
            const out = [];
            for (const [i, part] of parts.entries()) {
                const [, lead, core, tail] = part.match(/^([^A-Za-z]*)([\s\S]*?)([^A-Za-z]*)$/);
                if (i % 2 || !core) out.push(part);
                else {
                    const text = await request(core, locale);
                    out.push(lead + text + (/[.?!؟。？！]$/.test(text) ? tail.replace(/^[.?!]/, "") : tail));
                }
            }
            return out.join("");
        },
        ]),
    ];
    let last;
    for (const attempt of attempts) {
        const out = (await attempt()).replace(/'(?=[{<])/g, "’");
        last = problem(english, out);
        if (!last) return out;
    }
    throw new Error(last);
}

/**
 * Short labels mean little alone ("Chest", "Auto"), so they go to the model as a numbered list under a line that says
 * what they are. Returns the labels that came back usable.
 */
export async function translateLabels(labels, context, locale) {
    const out = new Map();
    const todo = [];
    for (const label of labels) {
        const known = GLOSSARY[label]?.[locale];
        if (known) out.set(label, known);
        else todo.push(label);
    }
    for (let i = 0; i < todo.length; i += 20) {
        const batch = todo.slice(i, i + 20);
        const reply = await request(`${context}:\n${batch.map((label, n) => `${n + 1}. ${label}`).join("\n")}`, locale);
        for (const line of reply.split("\n")) {
            const match = line.match(/^\s*[\u200e\u200f]*(\d+|[٠-٩]+)\s*[.．、。)]\s*(.+?)\s*$/);
            if (!match) continue;
            const number = Number(match[1].replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)));
            const english = batch[number - 1];
            if (english && !problem(english, match[2])) out.set(english, match[2]);
        }
    }
    return out;
}
