# Interactive walkthrough — standing rules

**Status:** locked 2026-10-23 (Facts voice). Applies to **every** interactive walkthrough: Practice 7.1 #1, Kaplan p348 #1, and all future pages.

**Canonical (this file):** `ged/framework/INTERACTIVE_WALKTHROUGH_STANDING_RULES.md`  
**Repo copy (ships with player):** `materials-for-students/math/INTERACTIVE_WALKTHROUGH_STANDING_RULES.md`  
**Also summarized in:** `ged/DESIGN_DECISIONS.md` (Interactive walkthroughs).

Shared shell: `interactive-player.js` + `interactive-player.css`.

---

## 1. Sticky problem + choices

Always show a sticky **Problem** box (top-left rail) with the **original problem** and **answer choices** the student can select. Choices live in the problem panel (mount `choices`), not only inside a later slide.

## 2. Choose-first gate

The student picks an answer **before** engaging the walkthrough. Both MC and multi-form use a **Check** button to submit.

- **While choosing (before Check):** click only **selects** (or toggles, for multi). Do **not** evaluate on bare click. Do **not** reveal which choices are correct.
- **After Check — wrong:** say **Not quite** (no long explanation of *why*), **and** mark **each** choice chip so the student sees which were correct vs wrong (see §13). Never a blanket “all wrong” with no per-chip marks.
- **After Check — right:** short confirmation + option to **continue** into the walkthrough **or stop**, with the same per-chip marks.

MC → A/B/C/D (`choiceMode: 'single'` + Check). FIB / multi-form → chips with distractors (`choiceMode: 'multi'` + Check).

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

## 13. Per-chip reveal only after Check

After the student hits **Check** (submit), mark **every** choice chip to show whether that choice is a correct answer or not — not a blanket “all wrong.”

Chip states after Check:

| State | Meaning | Visual |
|-------|---------|--------|
| selected-correct | student picked a correct form | green + ✓ |
| selected-wrong | student picked a distractor | red + ✗ |
| missed | correct form **not** selected | dashed green + ✓ (“missed”) |
| distractor-ok | distractor not selected | dimmed, no mark |

- **Before Check / during choosing:** wrong or incomplete picks must **not** reveal which answers are correct. Single MC: click selects only; Check submits (same as multi).
- Full per-chip correct vs incorrect reveal happens **only** after Check/submit.
- Implemented in `interactive-player.js` (`_checkAnswers` + `_applyRevealMarks`).


## 14. Stacked fractions (on-screen)

On-screen fractions in **body**, **why**, **Work so far**, **problem**, **build notes**, and **choice chips** must render as **stacked** fractions (numerator over denominator) via MathJax `\(\frac{a}{b}\)` / `\(\dfrac{a}{b}\)` (or display math) — matching the answer-choice chips.

- **Do not** show inline slash text like `2/5` or spelled-out "two fifths" as the visible fraction in HTML.
- **Voice/TTS** may still say "two fifths" / "twenty over fifty"; `speakMath()` already normalizes spoken fractions. Keep `voice:` strings natural for speech.

## 15. Fraction operation layout

When showing work with fraction **operations**:

- **Addition or subtraction** of fractions: work flows **top to bottom** (use `.iw-frac-work-col`).
- **Multiplication or division** of fractions (and equality / rewrite chains of stacked fractions): fractions stay stacked individually, but the work flows **left to right** (use `.iw-frac-work-row`).

Helpers live in `interactive-player.css`.

## 16. Collapse try-first when walkthrough opens

When the student opens the walkthrough (`Show walkthrough` or **Continue to walkthrough** after a correct Check; `gateState → open`), **hide/collapse the try-first pane** (answer-choice selection, Check, and gate feedback) so **Work so far** gets more vertical room. Before the walkthrough starts, try-first stays visible. Implemented in `_applyGate` + `#iw-app.iw-open #iw-choice-mount` CSS.


## 17. Flat non-button surfaces

Non-button UI must **not** look raised: **no drop shadows**, no black underside shadow, no fake 3D / scale-up on chips or numbers. Keep colors; flatten (`box-shadow: none`).

Applies to: step number circles (`.iw-num`, `.iw-work-n`), answer/value chips (`.iw-chip`), term highlights (`.iw-term`), shaded panels behind numbers, problem/work/stage cards.

**Real buttons** (Back, Next, Replay, Check, Show walkthrough, choice buttons) may keep a light interactive affordance if needed. Chips that are not buttons stay flat.

## Checklist for every new interactive page

1. Sticky problem + `choices` + choose-first gate (Check for single **and** multi)
2. Show walkthrough pill; work + main hidden until open; try-first collapses when open (§16)
3. Student-only `why`; `buildNotes` below nav
4. Bold + color-matched terms across problem / body / work / diagrams
5. Distribute step uses `distributeArrows` when teaching distribute
6. Voice strings pass `speakMath` (letters + math); spot-check Replay
7. Header: `Lesson [n] [topic], page [p], problems [nums], walkthrough`
8. No em/en dashes as separators (use parentheses / colon / “to”)
9. Work so far rows are clickable (jump to that step)
10. After Check: per-chip correct/wrong/missed marks (§13); no reveal before Check
11. Choice button labels: MC shows A–D only; multi-form chips show math values only (never `f1`/`d1`/`p1`)
12. On-screen fractions stacked via MathJax (§14); add/sub col, mul/div row (§15)
13. Non-button chips/numbers/panels flat — no drop shadows (§17)
14. `audit.sh` → commit → push → confirm Pages 200
