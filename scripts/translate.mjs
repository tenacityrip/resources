#!/usr/bin/env node
/**
 * Translates new and changed English strings with a local LTEngine (LibreTranslate API).
 *
 *   node scripts/translate.mjs [--locales de,fr] [--only web|lang]
 *
 * LTENGINE_URL defaults to http://127.0.0.1:5050. translations.lock.json records the English each string was
 * translated from, so hand edits are kept until the English changes.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { catalogs, hash, LOCALES, mismatch, ROOT } from "./lib.mjs";
import { translate, translateLabels } from "./mt.mjs";

const option = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const locales = option("--locales")?.split(",") ?? LOCALES;
const only = option("--only");

/** Labels with no useful translation: module names, and modes named after servers, anticheats or clients. */
const KEEP = new Set(readFileSync(join(import.meta.dirname, "keep.txt"), "utf8").split(/\r?\n/).filter(Boolean));
const verbatim = (key, english) => key.startsWith("module.") || KEEP.has(english) || !/[A-Za-z]{2}/.test(english);

const CONTEXT = {
    web: "Buttons, headings and labels on the website of a Minecraft client (software accounts, sign-in, downloads)",
    setting: "Short setting labels in a Minecraft PvP mod menu",
    mode: "Short option values in a Minecraft PvP mod menu",
    ui: "Short buttons and messages in a Minecraft mod",
    category: "Module categories in a Minecraft mod menu",
};

const lockPath = join(ROOT, "translations.lock.json");
const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, "utf8")) : {};
let done = 0;
const failed = [];

for (const c of catalogs()) {
    if (only && !c.label("en").startsWith(only)) continue;
    for (const locale of locales) {
        const label = c.label(locale);
        const map = c.read(locale);
        const seen = lock[label] ?? {};
        const next = {};
        const wanted = [...c.en].filter(
            ([key, english]) =>
                english.split(" ").length <= 4 &&
                !verbatim(key, english) &&
                (!map.has(key) || seen[key] !== hash(english)),
        );
        const labels = new Map();
        for (const [kind, context] of Object.entries(CONTEXT)) {
            const group = wanted.filter(([key]) => (c.label(locale).startsWith("web") ? "web" : key.split(".")[0]) === kind);
            const unique = [...new Set(group.map(([, english]) => english))];
            for (const [english, text] of await translateLabels(unique, context, locale)) labels.set(`${kind} ${english}`, text);
        }
        for (const [key, english] of c.en) {
            next[key] = hash(english);
            const current = map.get(key);
            const changed = key in seen && seen[key] !== next[key];
            const untried = !(key in seen) && current === english && !verbatim(key, english);
            if (current !== undefined && !changed && !untried && !mismatch(english, current)) continue;
            if (verbatim(key, english)) {
                map.set(key, english);
                continue;
            }
            try {
                const kind = c.label(locale).startsWith("web") ? "web" : key.split(".")[0];
                map.set(key, labels.get(`${kind} ${english}`) ?? (await translate(english, locale)));
                done++;
            } catch (error) {
                map.set(key, english);
                delete next[key];
                failed.push(`${label} ${key}: ${error.message}`);
            }
        }
        c.write(locale, map);
        lock[label] = next;
        writeFileSync(lockPath, `${JSON.stringify(lock, null, 1)}\n`);
        console.log(`${label}: ${done} translated so far, ${failed.length} left in English`);
    }
}
for (const line of failed) console.error(line);
