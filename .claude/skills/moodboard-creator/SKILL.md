---
name: moodboard-creator
description: Generate a Minotti-style interior-design material mood board (3:4 editorial flat-lay — layered material swatches, auto color palette, material strip, branded typography) and export a high-res PNG. Use when the user wants to turn interior render(s) into a material/finish mood board, a "材质情绪板", a finishes board, or a Minotti/quiet-luxury style presentation board.
---

# Mood Board Creator — SAIL 溪岸

A self-contained, zero-dependency generator that turns interior render(s)
into a **Minotti-style material mood board** and exports a 1500×2000 (3:4)
PNG. The tool lives at **`public/moodboard/index.html`** (served on the root
Vercel deploy at `/moodboard/`, or just opened locally in a browser).

## When to use this skill

The user wants a material / finishes mood board from interior renders:
"材质情绪板", "finishes board", "mood board like Minotti", "quiet-luxury
presentation board", or wants to customize/extend the generator.

## What the board contains (design system)

Fixed design canvas **750×1000 (3:4)**, scaled by `S`. One render engine,
`renderBoard(ctx, S)`, drives both the on-screen preview and the export
canvas — it is **WYSIWYG**. Sections:

- **Header** — brand lockup (`sAil 溪岸 · BY RICCIONE REKA`), project name,
  space type.
- **Collage (left ~⅔)** — overlapping material close-ups auto-cropped from
  the uploads, depth-layered back-to-front (hero stone slab behind), with a
  delicate line-art olive sprig accent. Alt mode: a single full-image base.
- **Right column** — `MATERIAL PALETTE` editorial caption, `COLOR PALETTE`
  (6 labeled circles), `MATERIALITY` mood line + style keywords.
- **Bottom** — a 7-swatch material/finish strip + brand tagline + footer.

## Look-and-feel rules (keep it "top designer")

- **Typography:** `Fraunces` (serif display/captions) + `DM Sans` (tracked
  labels). Fonts MUST be loaded before any canvas draw/export (`ensureFonts()`
  + `await document.fonts.ready`) or the PNG falls back to default glyphs.
- **Lighting:** soft top-left daylight wash + bottom-right vignette + soft,
  diffuse sample shadows — reads as a photographed flat-lay, not clip-art.
- **Palette:** extracted with 5-bit bins, rejecting the paper backdrop and
  blown highlights, dedup by color distance, sorted by luminance.
- **Restraint:** calm rotations, generous negative space, neutral natural
  palette (ivory / sand / taupe / oak / walnut / charcoal + one accent).

## How to drive it

1. Open `public/moodboard/index.html` (locally or via the deployed
   `/moodboard/` URL).
2. Upload render(s) — multi-select, drag-drop, or `Ctrl+V` paste.
3. Pick a layout: **叠层拼贴** (auto collage) or **整图底图** (full-image base).
4. (Optional) **✦ AI 生成文案** — needs an Anthropic API key (stored only in
   `localStorage`, browser-direct is local-use only). Uses Claude Vision to
   fill narrative, mood line, keywords, 6 color names, 7 material labels.
5. Tweak palette / labels / copy inline, then **⤓ 导出高清 PNG**.

## When editing the generator

- Keep the single-engine invariant: never draw preview and export
  differently — change only `renderBoard()` so both stay in sync.
- The collage layout is the `SWATCHES` array (array order = back→front
  z-order); `li` indexes into `materials` for the caption under a swatch.
- Re-run a quick `node --check` on the embedded `<script>` after edits.
- It must stay a single dependency-free file so it works opened directly
  from disk and as a static asset under `public/`.
