import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

export const ROOT = join(import.meta.dirname, "..");
export const LOCALES = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"))
    .locales.map((l) => l.code)
    .filter((code) => code !== "en");

/** Names that keep their spelling in every language. */
export const BRANDS = [
    "Tenacity", "Opal", "Terminus", "Asphodel", "Minecraft", "YouTube", "Microsoft", "Discord", "Spotify", "Hypixel", "ClickGUI",
    "JavaScript", "TypeScript", "Lua", "Windows", "macOS", "Linux", "Java",
];

export function parseLang(text) {
    const map = new Map();
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        const eq = line.indexOf("=");
        if (eq > 0 && !line.startsWith("#")) map.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
    }
    return map;
}

export function flatten(value, prefix = "", out = new Map()) {
    for (const [key, child] of Object.entries(value)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (child !== null && typeof child === "object") flatten(child, path, out);
        else out.set(path, child);
    }
    return out;
}

/** Rebuilds `shape` (the parsed en.json) with the flat values in `map`. */
export function unflatten(shape, map, prefix = "") {
    const build = (child, path) =>
        child !== null && typeof child === "object" ? unflatten(child, map, path) : map.get(path);
    if (Array.isArray(shape)) return shape.map((child, i) => build(child, prefix ? `${prefix}.${i}` : `${i}`));
    return Object.fromEntries(
        Object.entries(shape).map(([key, child]) => [key, build(child, prefix ? `${prefix}.${key}` : key)]),
    );
}

/** Placeholders, rich-text tags, § codes and printf tokens, sorted. They must match English exactly. */
export function tokens(text) {
    return (String(text).match(/\{\w+\}|<\/?\w+>|§.|%[sd]/g) ?? []).sort();
}

export function mismatch(english, text) {
    if (typeof text !== "string" || !text.trim()) return "is empty";
    if (tokens(english).join() !== tokens(text).join()) return `tokens differ (${tokens(english)} / ${tokens(text)})`;
    if (!english.includes("\n") && text.includes("\n")) return "has a line break";
    if (/'[{<]/.test(text)) return "has an apostrophe before a brace or tag";
    if (/[{}]/.test(text.replace(/\{\w+\}/g, ""))) return "has stray braces";
    if (/[<>]/.test(text.replace(/<\/?\w+>/g, "")) && !/[<>]/.test(english.replace(/<\/?\w+>/g, ""))) return "has stray markup";
    return null;
}

/** Every English catalog with a loader and writer for its translations. */
export function catalogs() {
    const found = [];
    const webEn = join(ROOT, "web", "en.json");
    if (existsSync(webEn)) {
        const shape = JSON.parse(readFileSync(webEn, "utf8"));
        found.push(
            catalog(join(ROOT, "web"), "json", flatten(shape), (text) => flatten(JSON.parse(text)), (map) =>
                `${JSON.stringify(unflatten(shape, map), null, 2)}\n`,
            ),
        );
    }
    const walk = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) walk(join(dir, entry.name));
            else if (entry.name === "en.lang") {
                const en = parseLang(readFileSync(join(dir, entry.name), "utf8"));
                found.push(
                    catalog(dir, "lang", en, parseLang, (map) => `${[...en.keys()].map((k) => `${k}=${map.get(k)}`).join("\n")}\n`),
                );
            }
        }
    };
    walk(join(ROOT, "lang"));
    return found;
}

function catalog(dir, extension, en, parse, print) {
    const file = (locale) => join(dir, `${locale}.${extension}`);
    return {
        en,
        label: (locale) => relative(ROOT, file(locale)).replaceAll("\\", "/"),
        read: (locale) => (existsSync(file(locale)) ? parse(readFileSync(file(locale), "utf8")) : new Map()),
        write: (locale, map) => writeFileSync(file(locale), print(map)),
    };
}

export const hash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 12);

/** Returns every problem that would make a catalog unsafe or incomplete. */
export function check(list = catalogs(), locales = LOCALES) {
    const errors = [];
    for (const c of list) {
        for (const locale of locales) {
            const map = c.read(locale);
            for (const [key, english] of c.en) {
                if (!map.has(key)) errors.push(`${c.label(locale)}: missing ${key}`);
                else {
                    const problem = mismatch(english, map.get(key));
                    if (problem) errors.push(`${c.label(locale)}: ${key} ${problem}`);
                }
            }
            for (const key of map.keys()) if (!c.en.has(key)) errors.push(`${c.label(locale)}: unknown ${key}`);
        }
    }
    return errors;
}
