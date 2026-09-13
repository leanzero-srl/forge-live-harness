# Applying the brand to PowerPoint

This is what the design system was originally built for: taking an arbitrary deck and restyling it
into the diconium identity.

## Start from the template if you have it

The official diconium template (`27052025_Companyslides_2025_V005_.potx` at the time of writing) is
the correct starting point, because it carries the real slide masters and layouts. When the design
system was built, that file failed to upload, so its slide layouts are **reconstructed from the
company presentation PDF rather than matched to the masters**.

So: if the `.potx` is available, open it and apply these rules on top. Only rebuild from scratch when
it genuinely is not available, and say so in the handover.

## Colours as RGB

python-pptx wants `RGBColor(r, g, b)`.

| Name | Hex | RGB |
|---|---|---|
| orange | `#FF5000` | 255, 80, 0 |
| black | `#000000` | 0, 0, 0 |
| white | `#FFFFFF` | 255, 255, 255 |
| purple | `#581F9D` | 88, 31, 157 |
| orange 80 | `#FF7333` | 255, 115, 51 |
| orange 60 | `#FF9666` | 255, 150, 102 |
| orange 40 | `#FFB999` | 255, 185, 153 |
| orange 20 | `#FFDCCC` | 255, 220, 204 |
| purple 80 | `#794CB1` | 121, 76, 177 |
| purple 60 | `#9B79C4` | 155, 121, 196 |
| grey 80 | `#333333` | 51, 51, 51 |
| grey 60 | `#666666` | 102, 102, 102 |
| grey 20 | `#CCCCCC` | 204, 204, 204 |
| grey 05 | `#F2F2F2` | 242, 242, 242 |

Do not use the phase-2 blue `#003E96` — it is not in the launch palette.

## Fonts

Set the font **by name**: `Campton`, with `Tenorite` as the documented fallback.

The font files are not shipped with this skill on purpose — Campton is licensed, and a diconium
machine already has it installed, so naming it is enough for PowerPoint to render correctly. If the
deck will be opened somewhere Campton is not installed, say so rather than silently substituting.

Headlines are **Campton ExtraBold** (weight 800). Body is **Campton Book** (weight 400). Thin and
Black weights are for standalone key messages only.

## Slide geometry

16:9. Build on an 8px grid. White is the default background and should stay dominant — resist the
urge to fill slides with orange.

Square corners on every shape. Flat fills. No drop shadows, no glows, no decorative gradients.

## The casing pass — do this one explicitly

Restyling a deck is not only colours and fonts. Run a pass over every text frame:

1. Every occurrence of "Diconium" or "DICONIUM" in running copy becomes **"diconium"**.
2. Primary headlines of 30 characters or fewer may be CAPS. Longer ones become lowercase.
3. Secondary headlines and body copy become lowercase.
4. If the deck mixes long and short headlines, drop CAPS entirely and set all of them lowercase.
5. Remove any emoji.

This is the pass that makes a deck actually look like diconium, and it is the one most likely to be
skipped because it changes the words rather than the styling.

## Logos

`assets/brand/` holds the lockup and the symbol in orange, black and white. Pick the variant by
background: orange or black lockup on white, white lockup on a dark or photographic background.

The tagline "Updating industries" **never sits under the logo**. It is a message used on covers, not
part of the lock-up.

## Before handing it back

Check: is white still carrying most of the layout, or has it turned into an orange deck? Is
"diconium" lowercase everywhere? Are any headlines in CAPS above 30 characters? Are corners square?
Are there stray gradients or shadows? Did any emoji survive? Is the resonance filter on a car or a
client image, where it must not be?
