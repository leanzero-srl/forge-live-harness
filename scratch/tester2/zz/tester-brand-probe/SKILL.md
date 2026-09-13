---
name: tester-brand-probe
description: >-
  diconium brand rules for slides and documents: colours, Campton type, the CAPS and lowercase
  rules, tone of voice and imagery. Use when creating or restyling any diconium deck or document.
---

# diconium brand

Apply this whenever you produce something that carries the diconium name — a deck, a one-pager, a
document, a diagram. It was built to restyle PowerPoint into the corporate identity, and the same
rules apply to anything else visual.

Derived from the official **diconium Design Guide, October 2024** (73 pages) plus the current company
presentation, via a design system built in Claude Design in June 2026. Rules below cite the guide's
own page numbers where they exist, so anything here can be checked against the source.

## The five rules people get wrong

**"diconium" is always lowercase.** In running copy, in headlines, at the start of a sentence, always.
Never "Diconium". This is the single most visible mistake and it is the one people notice.

**CAPS only up to 30 characters.** Primary headlines may be set in CAPS when they are 30 characters
or shorter — `UPDATING INDUSTRIES`, `DESIRABLE FUTURES`. Longer than that, use lowercase. Secondary
headlines and all body copy are lowercase always. If a document mixes long and short headings, drop
CAPS entirely rather than mixing the two.

**White dominates.** Roughly 70% of a layout is white. Orange, black and purple are accents, not
fields. Orange `#FF5000` is the hero accent, black is mainly text, purple is reserved for short
highlights, quotes and calls to action. Balance is judged across a body of work, not on one slide.

**Square corners, flat surfaces.** The identity is geometric and sharp. Default corner radius is 0.
Prefer line and colour steps over shadows and glows. Avoid gradients as decoration — the one
exception is the signature warm-orange to cool-teal resonance wash.

**No emoji.** Not part of the brand voice, anywhere.

## Colours

Primary is orange `#FF5000`, white `#FFFFFF`, black `#000000`. Secondary is purple `#581F9D`. There
is a phase-2 blue `#003E96` that is **not** used yet — do not reach for it.

Each brand colour has a resonance ramp at 80/60/40/20%. Full values, greyscale and the semantic
aliases are in `references/colors.md`.

## Type

**Campton** (René Bieder) across the full weight range. Headlines are Extra Bold and tight, body is
Book. Official fallback is **Tenorite**, then a system sans.

Campton is a **commercially licensed typeface and its font files are deliberately not shipped with
this skill** — see the note at the bottom. On a diconium machine Campton is installed already, so
naming the font is enough for PowerPoint and Word to render it correctly. Casing rules, the weight
map and the type scale are in `references/typography-and-casing.md`.

## Voice

Confident, forward-looking, plain-spoken. Optimistic but precise. "we" for diconium, "you" for the
client. Numbers are used as proof points and set large — 2,500 experts, 30 years, 100% Volkswagen
Group subsidiary, since 1995. Avoid hype words; favour concrete value.

Tagline is **"Updating industries"** — it is a message, not a signature, and never sits under the
logo. The signature lines that should be quoted verbatim are in `references/voice-and-copy.md`.

## Resonance

The heart of the identity, and the part most often missed. Resonance means echo — empathy causing
things to vibrate in sympathy. It appears three ways: the symbol (the diconium D echoed into decaying
arcs), the resonance grid (vertical columns at ¼X · X · X · X · 2X), and the resonance image filter
(vertical striping with a warm-orange to cool-teal wash, used for data, digital and AI subjects).

Never apply the resonance filter to cars or to client imagery. Imagery rules, including the 80/20
black-and-white ratio for people photography, are in `references/imagery-and-layout.md`.

## Working on PowerPoint

This is what the design system was built for. `references/powerpoint.md` has the RGB values in the
form python-pptx wants, the font names to set, slide geometry, and the checks worth running before
handing a deck back.

One caveat carried over from the source: the official diconium template `.potx` failed to upload when
the design system was built, so the slide layouts were reconstructed from the company presentation
PDF rather than matched to the real masters. If you have the `.potx`, use it as the starting file and
apply these rules on top rather than rebuilding a deck from scratch.

## Reference files

- `references/colors.md` — every colour token, the resonance ramps, greyscale, semantic roles.
- `references/typography-and-casing.md` — the weight map, type scale, line height, tracking, and the
  casing rules in full.
- `references/voice-and-copy.md` — tone, person, the verbatim signature lines, the proof-point numbers.
- `references/imagery-and-layout.md` — imagery categories, the resonance system, spacing, the grid.
- `references/powerpoint.md` — applying all of it to a .pptx, with the values in usable form.
- `assets/brand/` — logo lockups and symbols in orange, black and white.

## About the fonts

The 18 Campton `.otf` files that came with the original design system are **not** included here, for
two reasons. Campton is a paid typeface licensed from its foundry, and redistributing the binaries to
everyone in the company through a cloud service is a licensing question that needs answering rather
than assuming. And for the actual job it is unnecessary — PowerPoint and Word use the copy of Campton
installed on the machine, so naming the font produces correct output without shipping it.

If a rendering job genuinely needs the font embedded, and licensing has been checked, the files can be
added under a `fonts/` folder in this skill. Until then, name the font and let the local install do the
work. Where neither Campton nor Tenorite is available, the fallback is a system sans — flag that the
output is off-brand rather than silently substituting something else.
