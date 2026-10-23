# Interactive walkthrough — standing rules

**Status:** locked 2026-10-23 (Facts voice). Applies to **every** interactive walkthrough: Practice 7.1 #1, Kaplan p348 #1, and all future pages.

**This file** (next to `interactive-player.js`) is the durable source of truth in the public repo.  
Private project mirror: `ged/framework/INTERACTIVE_WALKTHROUGH_STANDING_RULES.md`.  
Summary also in project `DESIGN_DECISIONS.md` (Interactive walkthroughs).

Shared shell: `interactive-player.js` + `interactive-player.css`.

---

## 1. Sticky problem + choices

Always show a sticky **Problem** box (top-left rail) with the **original problem** and **answer choices** the student can select. Choices live in the problem panel (mount `choices`), not only inside a later slide.

## 2. Choose-first gate

The student picks an answer **before** engaging the walkthrough.

- **Wrong:** flag as wrong only — do **not** explain why, and do **not** highlight or reveal the correct answer.
- **Right:** short confirmation + option to **continue** into the walkthrough **or stop**.

MC → A/B/C/D (`choiceMode: 'single'`). FIB / multi-form → chips with distractors (`choiceMode: 'multi'` + Check).

## 3. Show walkthrough pill

The interactive walkthrough (main explanation) **and** **Work so far** stay **blank/hidden** until the student clicks **Show walkthrough** (nav pill) or **Continue to walkthrough** after a correct pick. Same page — no separate URL.

Gate states: `choosing` → `wrong` | `correct` → `open`.

## 4. Why it works = student-facing only

Per-slide `why` is **only** student explanation. **Never** put build/dev notes, author asides, or pipeline chatter in Why it works.

## 5. Build notes at the bottom

Mount `buildNotes` renders in a section labeled **Build notes** at the **very bottom** of the page, **beneath** Back / Replay voice / Next. Not inside the step card.

## 6. Color-matched terms

Anything mentioned in the explanation/instruction text must be **color-coded** in that explanation, and the **same colors** used wherever those elements appear in:

- the sticky problem box
- the Work so far strip
- any diagrams / distribute arrows

The student must be able to track which term is being talked about across the whole page.

Use shared classes: `.iw-term` + `.iw-term-a`…`f` / `.iw-term-fav` / `.iw-term-tot` / `.iw-term-dec` / `.iw-term-pct`.

### Color roles — Kaplan p348 #1 (algebra / distribute)

| Class | Color | Meaning |
|-------|-------|---------|
| `iw-term-a` | purple `#7a3fb3` | factor **−4** |
| `iw-term-b` | blue `#1d4ed8` | **x** (inside parentheses) |
| `iw-term-c` | green `#0f7a3d` | **3** (inside parentheses) |
| `iw-term-d` | teal `#0e6e7a` | outside **6** |
| `iw-term-e` | amber `#a35a00` | product **−4x** |
| `iw-term-f` | red `#b42318` | product **−12** / final constant **−6** |

### Color roles — Practice 7.1 #1 (probability)

| Class | Color | Meaning |
|-------|-------|---------|
| `iw-term-fav` | green `#0f7a3d` | **20** / favorable / numerator / **2** in 2/5 |
| `iw-term-tot` | blue `#1d4ed8` | **50** / total / denominator / **5** in 2/5 |
| `iw-term-dec` | amber `#a35a00` | **0.4** decimal form |
| `iw-term-pct` | pink `#9b1c5a` | **40%** percent form |

## 7. Bold + color together

Color-matching alone is **not** enough. Any term mentioned in the explanation that also appears in the problem must be **bolded AND color-matched** everywhere it appears (explanation, sticky problem, Work so far, diagrams). Use `<strong class="iw-term iw-term-…">`.

## 8. Distribution arrows (standard visual)

For **any** distribution step, show **branching arrows** from the front factor to **each** term inside the parentheses, **color-coded per target term**. Default helper: `InteractiveWalkthrough.distributeArrows({ factorHtml, factorClass, terms: [{ html, termClass }] })`.

## 9. Voiceover — letter names

TTS must pronounce letters as **letter names**. Capital **A** = **"ay"**, never schwa **"uh"**. Applies to **choice A**, **answer A**, and variable/letter **A**. Audit all choice letters: B→bee, C→see, D→dee. Do **not** rewrite the English article “a” or letters inside words. Implemented in `speakMath()`; also fix hand-written `voice:` strings when they say “A through D”, etc.

## 10. Voiceover — math pronunciation

- Coefficient×variable: **`4x` → "four x"** (not “x times”, not “four times x” for the term).
- Normalize via `speakMath()`: glued `Nx` / `-Nx`, decimals (`0.4` → “zero point four”), percents, fractions (`2/5` → “two over five”), remaining integers to words, `(…)` → open/close parenthesis.
- Keep on-screen MathJax/HTML unchanged; only the spoken string is rewritten.

---


## 11. No long dashes as separators

Ban **all** long dashes used as separators in interactive walkthrough content: em dash (—) and en dash (–). They look like minus signs and confuse students.

- **Do not** write: `A. 4x + 3 — wrong signs`
- **Do** write: `A. 4x + 3 (wrong signs)`
- Prefer parentheses for asides/reasons; use a colon for labels (`Read: …`, `Step 7 (check and answer)`); use “to” for ranges (`A to D` not `A–D`).
- **Keep** real minus signs in math (ASCII `-` or Unicode minus `−` in expressions like `−4x`).
- Applies to explanations, choice lists, Work so far, Build notes, kickers, and voice-adjacent on-screen text.


## 12. Clickable Work so far

Each entry in the **Work so far** strip is **clickable**. Clicking a step (for example step 2) jumps the main explanation panel to that same step and plays its voice if auto-voice is on. Back and Next stay unchanged. Visited steps remain listed (and clickable) even after jumping backward. Implemented in the shared player (`button.iw-work-line` → `_show(index)`).

## Checklist for every new interactive page

1. Sticky problem + `choices` + choose-first gate
2. Show walkthrough pill; work + main hidden until open
3. Student-only `why`; `buildNotes` below nav
4. Bold + color-matched terms across problem / body / work / diagrams
5. Distribute step uses `distributeArrows` when teaching distribute
6. Voice strings pass `speakMath` (letters + math); spot-check Replay
7. Header: `Lesson [n] [topic], page [p], problems [nums], walkthrough`
8. No em/en dashes as separators (use parentheses / colon / “to”)
9. Work so far rows are clickable (jump to that step)
10. `audit.sh` → commit → push → confirm Pages 200
