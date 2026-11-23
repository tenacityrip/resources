# resources

Translations for [Tenacity](https://tenacity.rip). The client and the website read their text from here, so a
translation only has to change in one place.

## Layout

| Path | Contents |
|---|---|
| `lang/tenacity/stable/<version>/<locale>.lang` | Client text, one `key=value` per line |
| `web/<locale>.json` | Website text |
| `legal/<locale>/*.mdx` | Terms and privacy policy. The English text is the binding one |
| `manifest.json` | Languages, and the client version whose catalogs are live |
| `translations.lock.json` | Which English text each translation was made from (generated) |

Languages: English, German, French, Italian, Polish, Russian, Turkish, Chinese (Simplified), Japanese, Arabic.

Most translations started as machine translations from [LTEngine](https://github.com/LibreTranslate/LTEngine).
Corrections from native speakers are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md).

## Rules

- English is the source. Every language has exactly the same keys.
- Keep `{placeholders}`, `<tags>` and `§` color codes exactly as they are.
- Module names are translated by hand in Chinese, Japanese, Arabic and partly French, and stay in English elsewhere.

## Commands

Node 22 or newer, no dependencies.

```sh
node --test                               # tests for the tooling
node scripts/check.mjs                    # every language matches English (the CI gate)
node scripts/translate.mjs --locales de   # fill gaps with a local LTEngine
node scripts/translate-legal.mjs          # the same for legal pages
```

`scripts/glossary.json` fixes the translation of short ambiguous words. `scripts/keep.txt` lists labels that are
never translated.

## For AI agents

Read [CLAUDE.md](CLAUDE.md). [llms.txt](llms.txt) indexes the files.
