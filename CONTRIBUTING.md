# Contributing

To fix a translation, edit the value in `lang/**/<locale>.lang` or `web/<locale>.json` and open a pull request.
Your wording is kept until the English text changes.

1. Change only the part after `=` (or the JSON value). Never change keys.
2. Keep `{placeholders}`, `<tags>` and `§` codes exactly as in English.
3. Run `node scripts/check.mjs`.

English text comes from the products, so it is not edited here. To propose a new language, open an issue.

By contributing you agree that Tenacity may use your translation. Commits follow
[Conventional Commits](https://www.conventionalcommits.org/) (`fix(de): ...`), with no AI-attribution trailers.
You are responsible for every commit you submit.
