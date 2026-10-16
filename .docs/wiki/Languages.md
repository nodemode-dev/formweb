# Languages

The editor interface speaks 26 languages, English by default. Choose one in Settings > Editor language; the whole window relabels live with no reload, and the choice is remembered in the browser (`formweb_language`). This is the editor's own language. Site content, layer names, page names and the project name are never translated, and site locales for visitors are a separate feature (see [[Engine]] and the locale commands).

| Code | Language | Code | Language |
| --- | --- | --- | --- |
| en | English | ru | Русский |
| es | Español | pl | Polski |
| es-MX | Español (México) | cs | Čeština |
| pt-BR | Português (Brasil) | hu | Magyar |
| fr | Français | uk | Українська |
| fr-CA | Français (Canada) | tr | Türkçe |
| de | Deutsch | zh-CN | 简体中文 |
| it | Italiano | zh-TW | 繁體中文 |
| nl | Nederlands | ja | 日本語 |
| da | Dansk | ko | 한국어 |
| fi | Suomi | id | Bahasa Indonesia |
| nb | Norsk bokmål | th | ไทย |
| sv | Svenska | vi | Tiếng Việt |

## How it works

- Source: `frontend/src/i18n/`. `keys.ts` is the ordered list of English strings, and each full language has a `locales/<code>.ts` array with one entry per key. es-MX and fr-CA keep only the words that differ and fall back to es and fr, then English.
- The formvis family tables in `i18n/family/` are copied unchanged and sit under FormWeb's own tables, which win.
- The translator matches text nodes and the title, aria-label and placeholder attributes by exact English text before paint, so English never flashes. It skips inputs' values, the canvas and preview iframes, code, the terminal, the chat log, layer and page lists and anything marked `data-no-i18n`.
- Each language loads lazily; English loads nothing.

## Adding or changing strings

Append new English strings to the end of `keys.ts` and add the matching entry to every locale. A locale shorter than the keys shows English for the tail. Run `./formweb i18n check` (add `--json` for machine output); it reports any language with a missing or extra entry. Translations were written by a model and have not had a native-speaker review, and strings built at run time from templates are not translated.
