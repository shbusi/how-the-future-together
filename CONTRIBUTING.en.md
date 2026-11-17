# Adding future pieces

English · [한국어](CONTRIBUTING.md)

**How the Future Together** shows how every field of society has changed since 1900 and could change by 2100, made of *pieces* that anyone can write.
There are two kinds of piece:

- **History pieces**: something that actually happened. "In 1948 the UN adopted the Universal Declaration of Human Rights." A source is required.
- **Future pieces**: imagination that says "under these conditions, this would happen".

When you choose a year and conditions on the site, the matching pieces come together into that year's picture and stories. The past is the same whatever the conditions; the future branches with them.

The site is available in 한국어, English, 日本語, 简体中文 and Español, and **you can write a piece in any of them.**
You don't need to know how to code.

## Ways to take part

| Way | How |
| --- | --- |
| **1. Write a piece on the site** | Use **Write a piece** on the site, choose history or future, and press **Send to GitHub**. A GitHub page opens with the file filled in; press **Propose changes**, then **Create pull request**. You need a GitHub account. |
| **2. Just share an idea** | Press **Just share the idea** on the site, or open a [future piece issue](../../issues/new?template=future-idea.yml). When a maintainer adds the `채택` (accepted) label, a pull request is created automatically. |
| **Fill an empty cell** | In the site's **Chronicle by field**, press **+** in an empty cell to open the form pre-filled with that field and era. |
| **3. Translate** | If a piece shows **Translate**, it has no text in your language yet. The link opens that file for editing. See [Translating](#translating) below. |
| **4. Comment or edit** | Use **Comment** or **Edit** on any piece. |
| **5. Extend the drawing, engine or languages** | Edit `assets/engine.js` (the model), `assets/scene.js` (the drawing), `config/` (conditions, tags, languages) or `locales/` (interface text) and open a pull request. |

## What a piece looks like

Pieces live in JSON files in the `futures/` folder. One file can hold several pieces.
Name the file `your-github-id-piece-name.json`, so it never clashes with anyone else's file.

A history piece:

```json
{
  "author": "my-github-id",
  "lang": "en",
  "futures": [
    {
      "id": "rights-1948-udhr",
      "type": "history",
      "title": { "en": "The Universal Declaration of Human Rights" },
      "story": { "en": "In 1948 the UN General Assembly adopted the Universal Declaration of Human Rights, making equal dignity and rights a shared promise of the world." },
      "when": { "year": [1948, 1948] },
      "tone": "bright",
      "domains": ["rights", "politics"],
      "sources": ["https://en.wikipedia.org/wiki/Universal_Declaration_of_Human_Rights"]
    }
  ]
}
```

A future piece:

```json
{
  "author": "my-github-id",
  "lang": "en",
  "futures": [
    {
      "id": "night-markets",
      "title": { "en": "Night markets", "es": "Mercados nocturnos" },
      "story": {
        "en": "Markets open after sunset to escape the heat. Children do their homework under the stall lights.",
        "es": "Los mercados abren al caer el sol para huir del calor. Los niños hacen los deberes bajo las luces de los puestos."
      },
      "when": { "climate": [0, 40], "year": [2050, 2100] },
      "tone": "mixed",
      "domains": ["daily", "environment"],
      "scene": { "heat": 0.1, "community": 0.05 },
      "sources": ["https://example.org/heatwave-report"]
    }
  ]
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `author` | ✔ | Your GitHub username |
| `lang` | ✔ | The language you first wrote it in: `ko` `en` `ja` `zh` `es` |
| `id` | ✔ | Lowercase letters, numbers and hyphens. Must be unique across the repository. |
| `type` |  | `"history"` for a history piece. Leave it out for a future piece. |
| `title` | ✔ | Title per language, 2–40 characters each. If you write in one language only, plain text works too: `"title": "Night markets"` (read as the `lang` language). |
| `story` | ✔ | Story per language, 20–400 characters each. Show **one concrete scene** from that future. |
| `when` | ✔ | History: only `{ "year": [start, end] }` (1900–2026). Future: a year range (2026–2100) and conditions. Conditions you leave out mean "any". |
| `tone` | ✔ | `bright` · `mixed` · `dark` |
| `domains` | ✔ | 1–3 fields. The first is the main field and decides the row in the chronicle. See below. |
| `region` |  | Where the story takes place. Defaults to the whole world (`world`). See below. |
| `scene` |  | How much the piece changes the drawing when it appears. Each value −0.5 to 0.5 |
| `sources` | history ✔ | Links to supporting material. At least one is required for history pieces. |

### Fields (`domains`)

`politics` · `economy` · `work` · `rights` · `technology` · `science` · `media` · `mobility` · `environment` · `energy` · `food` · `health` · `care` (welfare & care) · `education` · `family` · `population` (incl. migration) · `cities` (incl. housing) · `culture` · `peace` (security & peace) · `daily` (everyday life & values)

### Regions (`region`)

`world` · `asia` · `east-asia` · `korea` · `japan` · `china` · `south-asia` · `southeast-asia` · `middle-east` · `europe` · `spain` · `north-america` · `latin-america` · `africa` · `oceania`

Choosing a region on the site shows pieces from that region, the regions above it (e.g. Korea → East Asia → Asia → World) and the regions below it.

### Conditions for future pieces (`when`)

Every condition is a `[min, max]` range. A piece appears when the slider value is inside the range. History pieces have no conditions.

| Name | Meaning | At 0 | At 100 |
| --- | --- | --- | --- |
| `year` | Year (future pieces: 2026–2100) | | |
| `climate` | Climate action | Look away | All-out effort |
| `tech` | Technology | Stalled | Runaway |
| `solidarity` | Solidarity | Everyone for themselves | Deciding together |
| `equality` | Wealth | Extreme gaps | Shared evenly |
| `population` | Population | Shrinking fast | Growing |
| `peace` | International relations | Conflict | Cooperation |
| `growth` | Economic growth | Stagnation | High growth |

### Drawing (`scene`)

`sea` (sea level) · `heat` · `smog` · `green` (forests, roof gardens) · `solar` (solar panels, wind turbines) · `tech` (aircraft, maglev) · `density` · `decay` (empty buildings, vines) · `divide` (the wall, towers vs. shacks) · `community` (shared gardens, tables, people) · `dome` · `industry` (factories and chimney smoke).
Small values around 0.05–0.2 work best, so no single piece takes over the picture.

## Translating

A piece can be written in a single language. Anyone can add translations.

- **Translating a piece**: add another language code to the piece's `title` and `story`. The title and story must come **in pairs**, in the same language.
  ```json
  "title": { "en": "Night markets", "ja": "夜に開く市場" },
  "story": { "en": "…", "ja": "…" }
  ```
  **Who drew it → Translation progress** on the site shows which languages are missing.
- **Translating the interface**: edit `locales/<code>.json`. Keep placeholders like `{year}` as they are. `{n|piece|pieces}` picks the singular or plural form. `**bold**` is the only formatting allowed.
- **Adding a language**: add one line to `config/languages.json`, copy `locales/ko.json` to `locales/<code>.json` and translate it. Missing strings fall back to English, so you can fill it in gradually. `npm test` checks keys and placeholders.
- **Adding a field or region**: add the id to `config/domains.json` or `config/regions.json`, and a `"domain.<id>"` or `"region.<id>"` translation to every `locales/*.json`.

## Writing a good piece

- **Get history right.** Leave out dates or numbers you are not sure of. Cite sources anyone can check (Wikipedia, public bodies, news articles).
- **Tell history through ordinary lives.** What changed, and how did people's days change because of it?

- **Show a scene.** "Inequality gets worse" says less than "people on the street below only see the park inside the sky-bridged complex in photos."
- **Be honest about the conditions.** Would it really only happen under those conditions? Narrower ranges make a more specific future.
- **Fill the gaps.** On the site's **Map of the imagined**, `?` cells are futures no one has drawn yet.
- **Translate meaning, not words.** Make it read naturally in the target language.
- **Bright and dark futures are both welcome.** Stories that demean people or groups, or make false claims about real people, are not.

## Review and merge

1. Opening a pull request runs the **future piece check**. If it fails, the Actions summary lists what to fix in Korean and English.
2. Other contributors comment and react with 👍.
3. Once a maintainer merges it, the site updates within minutes.

## Running locally

Node.js 20 or later. Nothing to install.

```bash
npm run dev     # check + build, then http://localhost:4173
npm run check   # check future piece files only
npm test        # engine, validator and translation tests
```
