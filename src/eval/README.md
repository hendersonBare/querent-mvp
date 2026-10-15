# Matching evaluation suite

Product rule 1 is to prefer false negatives over false positives: a wrong item on a quote is the costly
error. This suite checks that rule against the real BOXT catalog (`data/boxt-catalog.json`, 1,555 rows) and
is used to calibrate the strictness levels in `src/features/settings/strictness.ts`.

| File | What it holds |
|---|---|
| `cases.ts` | 429 customer lines in another supplier's style. 152 must match a named BOXT SKU. 277 must not match, and each carries a reason (`wrong_size`, `wrong_material`, `wrong_pack`, `wrong_spec`, `not_carried`, `no_product_type`, `ambiguous`) and the loosest level at which it must still not match. Three sources: 181 hand-written lines (untagged), 196 held-out verifier probes (`heldout.ts`, tag `heldout`), and 52 lines written against the total-accounting design (tag `b3b`). |
| `heldout.ts` | The B3 verifiers' probe lines from rounds 2 and 3 that `cases.ts` did not already hold, with their ground truth, and round 2's 710 bare sizes (`HELDOUT_BARE_SIZES`, checked apart: they name no product). Round 1's probes were added to `cases.ts` earlier (n47 to n76). |
| `judge-recording.json` | One verdict per case, in B4's `JudgeVerdict` shape (`{sku \| null, reason}`), plus `recordedBy`. **The current verdicts are `hand-written`**: they were written in the build session, not recorded from a model, because no API key was available. Each one imitates a careful judge that sees only the line and the candidate list, and follows B4's rule of picking the first pricing tier. For the held-out and B3b lines the verdict is simply the expected SKU (must match) or none (must not match), so the recorded columns measure the scorer's recall there; safety is measured with the always-agree judge. `npm run eval:record` replaces them all with the live judge's (`recordedBy: 'live'`, with the model and time). |
| `run.ts` | Runs each case through the pipeline's own steps after parsing: `retrieve` (the real scorer and catalog), then the judge, then `decide`. The judge gets the candidates as B4's `JudgeCandidate` (SKU, description, pack label, category), and its answer passes B4's `withinCandidates` guard. It runs at every level with two judges: the recorded one, and an **always-agree** judge that picks the top candidate, so that no level's safety depends on the judge. Retrievals are memoized per line and level. |
| `eval.test.ts` | Part of `npm test`; `npm run test:eval` runs it alone. It **fails the build** in any of these cases: a must-not-match line matches at Strict with either judge; it matches at its declared level (or any stricter one) with either judge; a must-match line gets the wrong item at Strict; one of the 710 bare sizes matches at any level; a held-out or B3b must-not-match line clears Strict; Strict recall with the recorded judge drops below 90%. It also checks that every case has a recording and that every expected SKU is in the catalog. |
| `../../scripts/eval-report.ts` | `npm run eval:report` prints the table below, the lines that drive the calibration, results by source (hand-written, held-out, B3b, each verifier round's realistic must-match lines) and the bare sizes. Add `--markdown` for the table only, or `--cases` for every outcome. |

The supplier SKUs in `cases.ts` (`S-4128`, ...) are illustrative. The parser removes them, and
`description` is what the matcher sees. The matcher ignores SKUs: a BOXT SKU typed into a line is plain text.

## Total accounting (B3b): how Strict is made structurally safe

Three verifier rounds found Strict false positives with an always-agreeing judge (12, then 22, then
35 of 58 new lines). They shared one cause: the scorer dropped or merged what it did not fully
understand (stop words, a second size, a second mil or closure, a label, an unstated claim) and then
treated the rest as a perfect match. Strict now requires **total accounting**:

1. **Every token is read by exactly one recognised field, or the line is not Strict-eligible.**
   The fields are the product noun, one size tuple, one value per attribute (ECT, burst rating, mil,
   gauge, mailer `#`, core, wall, flute, closure, adhesive, print, film, hand/machine, paper grade,
   condition, colour, material), measures with units, the pack count, features, and words the item
   confirms. What is left is either:
   - `FILLER`, a closed list of words that say nothing about the item: `an the of with please pls our
     we need qty quantity size sz thickness uline brand` (and "thick" right after a size). "a" is not
     filler: it is a grade, a style or a flute letter as often as an article;
   - a word the item must confirm (charged `UNCONFIRMED` at every level); or
   - a **blocker**: a joining or relational word (`for to fit item style a or and approx each also
     plus inside outside id od min max per total similar equivalent assorted variety kit set ...`), a
     unit or pack word with no number ("half **inch**", "**ECT**", "**case**", a stray "x"), a number,
     number word or single letter nothing read, a symbol (`+ & / ~ # % $ @ | =`, an accented letter),
     a range ("4-6", "12" - 14""), a labelled size outside the tuple ("12" deep"), a partly or doubly
     labelled tuple, two legends, "with" before a product ("tape with dispenser"), or a pack phrase that
     counts another product ("1000 labels/case" on a bag line).
2. **One value per field.** Every rule keeps every value it reads instead of the first. Two values of
   any field (two tuples, `#2 and #5`, `2 Mil or 4 Mil`, `32 ECT or 44 ECT`, reclosable and open top,
   hot melt or acrylic, hand and machine grade, cast and blown, two colours, two materials, two cores,
   two pack counts, or an ECT and a burst rating that are not the standard equivalents) is a blocker.
   The scorer also compares every value, so the item contradicts at least one of them and no level can
   match the line.
3. **Positional dimensions in the catalog's order for the category.** A fully labelled tuple
   (L/W/H/D, long/wide/deep, length/width/height, or a legend such as "(W x L)") is put in the item's
   convention before comparing: boxes, cartons, corrugated mailers, gaylords and pallets are L x W x H;
   bags, bubble and poly mailers, envelopes, labels, rolls (tape, stretch wrap, paper, bubble, foam) and
   sheets are W x L. For bins (listed 10x12x8), edge protectors, covers and gusseted bags the order is
   unknown, so a labelled line can't be Strict-eligible against them. A size outside the tuple is
   confirmed only by one of the item's own measures (each confirms one), or, when labelled, by the
   dimension at that position; never by "any dimension". With no tuple at all, a lone length may be
   the width of a width-first item (1/2" strapping, 72 mm kraft tape).
4. **Claims are confirmed, never assumed.** A negation ("no zipper", "BPA-free", "non-toxic", "not
   printed") is confirmed only when the item states something else in its place (a flush-cut pouch
   confirms "no zipper"); the catalog never states what an item lacks, so the rest are unconfirmed.
   No category list of trivially-true claims is used. A stated pack count must equal the item's count;
   a bare "Case" is not a confirmation.
5. **The product noun comes from the description.** At least one product noun the line names must be in
   the item's description, or be one of the documented stand-ins (`NOUN_SYNONYMS`: bubble/foam *wrap*
   is sold as *Rolls*, stretch *film* as *Stretch Wrap*, pallet top *sheets* as *Sheeting*, an *RSC* is
   a *box*; a carton is not a box, an envelope is not a mailer, a pouch is not a bag). Other words may
   be confirmed by a product family's keywords only when they are plain synonyms or uses
   (`KEYWORD_WORDS`: shipping, packing, cardboard, plastic, poly, corrugated, industrial, carton,
   sealing, corner, list, wrapping, barcode, ...) or further product nouns ("Pallet Wrap", "Carton
   Sealing Tape", "Gaylord Box"). Keywords also hold the family's claims (eco, premium, reinforced,
   recyclable, custom, security, economy, export), which Strict never takes as confirmed. Balanced and
   Lenient still take every keyword.

The result is explicit. `scorePackaging` gives every candidate an `eligibility`
`{strictEligible, blockers}`; `retrieve` exposes the top candidate's as `retrieval.eligibility` (with no
candidate, the line's own blockers); `MatchRule.requireTotalAccounting` (true for Strict in
`strictness.ts`, false for Balanced and Lenient) makes `clears` require it, and `decide` then says
`not_accounted`. The blockers are written for the rep: `the line says "or"`, `two mil values: 2 and 4`,
`a size outside the dimensions: 12" deep`, `not confirmed by the item: not: bpa`,
`product: the item's description does not say "paper"`.

## Results (`npm run eval:report`)

| Level | minScore | minLead | Judge | Matched | Precision | False positives | Must-match recall | No-match rate |
|---|---|---|---|---|---|---|---|---|
| Strict | 0.9 | 0.35 | recorded | 144/429 | 100% | 0 | 95% (144/152) | 66% |
| Strict | 0.9 | 0.35 | always-agree | 144/429 | 100% | 0 | 95% (144/152) | 66% |
| Balanced | 0.7 | 0.2 | recorded | 151/429 | 100% | 0 | 99% (151/152) | 65% |
| Balanced | 0.7 | 0.2 | always-agree | 219/429 | 69% | 68 (see below) | 99% (151/152) | 49% |
| Lenient | 0.55 | 0.15 | recorded | 152/429 | 100% | 0 | 100% (152/152) | 65% |
| Lenient | 0.55 | 0.15 | always-agree | 256/429 | 59% | 104 (see below) | 100% (152/152) | 40% |

Precision is the share of matched lines that got the right item. Recall is the share of must-match
lines that got their item. `npm run eval:report` lists every false positive.

**Balanced and Lenient rely on the judge.** With the always-agree judge they let through what they are
documented to allow: one (Balanced) or two (Lenient) unconfirmed details. Balanced's 68 are one-detail
lines: unstated features and claims (heavy duty, insulated, printed, telescoping, used, waterproof,
economy, acid-free, BPA-free, non-toxic, lead-free, ...), a pack count the item doesn't state (h3-P01
to P03), a noun only keywords confirm (h3-W01 "Kraft Paper 72mm x 450 ft" picks Kraft Tape), keyword-only
claims (b01 to b05), a closure the item doesn't state (c03, c04), one unread qualifier (h3-S02 "12108",
h3-S05 "assorted", b18 "~", b19 a price, b20 "min.", b23 "|", b24 "ECT", b30 "ID", b32 a repeated
label), or a second product (b07, b09, b10, b28, b29, b34). Lenient adds the two-detail lines (among
them h3-F01, F02, F05 "for ... items", h3-M07 "and Tape", h3-W02 "Style A", h3-S03 "2 ply", b08, b12,
b21, b31, and the hand-written n32, n34, n44, n62, n63, n66, n67, n71, n73 to n75, s01, s02, s04, c02).
Total accounting removed 36 of Balanced's and 27 of Lenient's always-agree false positives among the
held-out and B3b lines (table below), mostly because two values of one field now contradict.

### Held-out lines: before and after (always-agree judge for wrong matches, recorded judge for recall)

"Before" is the scorer at `cd43017` (the round-3 head this task started from), run on the same lines.

| Source | Level | Wrong matches before | after | Must-match recall before | after |
|---|---|---|---|---|---|
| hand-written (119 must-not, 62 must-match) | Strict | 0 | 0 | 58/62 | 57/62 |
| held-out (123 must-not, 73 must-match) | Strict | **36** | **0** | 63/73 | 70/73 |
| held-out | Balanced | 60 | 28 | 65/73 | 72/73 |
| held-out | Lenient | 70 | 45 | 67/73 | 73/73 |
| B3b (35 must-not, 17 must-match) | Strict | **11** | **0** | 16/17 | 17/17 |
| B3b | Balanced | 22 | 18 | 16/17 | 17/17 |
| B3b | Lenient | 24 | 22 | 16/17 | 17/17 |
| round 2 realistic must-match (b3v-must.txt, 39) | Strict | | | 35/39 | 37/39 |
| round 3 realistic must-match (mm.json, 29 + R18) | Strict | | | 28/29 | 28/29 |
| all 429 lines | Strict | **47** | **0** | 137/152 | 144/152 |

- **Held-out baseline at Strict (before):** 36 wrong matches with the always-agree judge. 31 must-not
  lines matched: h3-F01, F02, F03, F05 ("for ... item"), M01 to M06 and M08 to M11 (second size, range,
  either-or, "12" deep", "13" wide", `#2 and #5`, two mils, two ECTs, ECT with a disagreeing burst
  rating), C01 to C05 (open top, self seal, flush cut, "or Acrylic", machine grade dropped), X01 to X07
  ("-free"/"non-" claims), P01 to P03 (a pack count against a bare "Case"), W01 (keyword noun), W02
  ("Style A"). And 5 labelled bag lines picked the other orientation: h3-L01 to L04 and h2n87 (the
  verifier's "9" W x 6" L" must-not line, which is in fact BOXT's 9x6 4 mil bag, PB4177, once W x L is
  read the way bags are listed; it is encoded as must-match). The 710 bare sizes matched nothing at any
  level, before or after.
- **B3b baseline at Strict (before):** 10 of the 35 attack lines matched a wrong item (b01, b02, b04,
  b05 keyword claims; b09, b10 a pack of another product; b18 "~32 ECT"; b23 "|"; b24 "ECT" with no
  number; b32 a repeated label), and a11 ("9" W x 6" L") picked the 6x9 bag.
- **After:** 0 wrong matches at Strict with either judge, across all 277 must-not lines and the 710
  bare sizes.

### What total accounting costs in recall (Strict, realistic must-match lines)

Strict recall is 95% (144/152) overall, 37/39 on round 2's realistic lines and 28/29 on round 3's
(29/30 counting R18, which is the same line as round 2's h2m35 and matches). The 8 lines Strict leaves
for the rep, and the rule that costs each:
- **Total accounting (new):** m61 `Reclosable Bags 4 x 6" 2 Mil, Not Printed` (a negation is never
  confirmed by silence) and h2m08 `Corrugated Boxes 6 x 6 x 6" 25/bundle 500 total` ("500 total" is the
  order quantity, an unread number). m36 (self seal, which the catalog doesn't state) and m37 (no
  "white") were already below the score.
- **Lead (unchanged):** m32 and m42 (a plain box and a bin box of the same size), h2m20 and h3-R14
  (4x4 desktop labels, where the fanfold 4x4 is one unconfirmed word away).

Realistic recall went up, not down: total accounting also fixed misses ("RSC" read as a box noun, the
"8x8 Core" of machine strapping read as a core instead of a second size, W x L bags), and the rules
that cost recall cost it only where the line says something the catalog doesn't confirm.

### Margins (Strict, on the scorer alone)

270 of the 277 must-not lines either name no product the top item confirms or are not Strict-eligible,
so they cannot clear Strict whatever their score and lead. The other 7 are Strict-eligible against
their top item, and Strict rests on the lead for them: n41, n45, h2n76, h2n78, h2n79 (lead 0: two items
fit equally), n42 and h2n74 (lead 0.25: a rival one unconfirmed detail away). The best lead among them
is **0.25**, 0.10 below minLead; none of them has a passing lead. minScore 0.90 now admits only a full
score (1.00), since anything unconfirmed is both 0.75 and a blocker.

## How the scores fall, and how the levels were set

A score is a product of factors (`src/server/matching/score-packaging.ts`):
- **1.00:** the item accounts for everything the line says, and the line for everything defining
  about the item.
- **0.75:** one thing on either side is unaccounted for (`UNCONFIRMED`): an unexplained word or
  qualifier, a stray number, an unconfirmed negation or pack count, a measure that is only one of the
  item's dimensions, or an unmentioned defining item feature.
- **0.56:** two such things.
- **0.50 or less:** any contradiction (`CONFLICT`): size, second size, pack, rating, mil, colour,
  material, closure, flute, condition, unit, any second value of a field, or a negation the item breaks.
  Every level's minScore is above it.

Levels (`strictness.ts`): **Strict 0.90 / 0.35 + total accounting** (the default); **Balanced 0.70 /
0.20** (one unconfirmed detail, a rival one detail away); **Lenient 0.55 / 0.15** (two). The thresholds
did not move in B3b: total accounting is a structural requirement, not a tighter number.

## Scoring in one paragraph

The parser (`src/server/matching/packaging.ts`) takes a line apart rule by rule, removing what each
rule reads and keeping every value; what is left is filler, words, or blockers. The scorer compares the
positional dims tuple (in the item's category order when labelled), every further tuple, the measures,
pack counts, ECT and burst ratings (200 lb = 32 ECT, 275 = 44, 350 = 55), mil, gauge, mailer `#`, core,
colour, material, wall, flute, closure, adhesive, print method, film, hand or machine length, paper grade,
condition and negations; every word the line uses must appear in the item's description or keywords. An
item scores 0 unless a word, a feature or the size fits, and an item with no size contradicts a line
that names one. The lead is measured against the best candidate of a **different product group** (the
description without its pricing tier, so bundle and pallet pricing of one box are one group).
`scorePackaging` caches its result per catalog array and line (bounded), since it does not depend on the
level; callers must not mutate the candidates.

## Re-recording with the live judge (`npm run eval:record`)

`scripts/eval-record.ts` runs every case's `retrieve` candidates through B4's live judge
(`getJudge()` from `src/server/llm`, the same judge as the quote tool, with concurrency 4 and B4's
timeout), then rewrites `judge-recording.json` with `recordedBy: 'live'`, the model and the time. It
prints which verdicts changed.

- It needs `ANTHROPIC_API_KEY`, and `ANTHROPIC_MODEL` is optional. Without a key, or with
  `QUERENT_SCRIPTED=1`, it exits 1 and does not touch the file.
- If any call fails (`judge_error`), it writes nothing and exits 1. A network problem never becomes
  a recorded "none".
- `src/server/llm` imports `server-only`, which only Next resolves. The script therefore runs with
  `tsx --import ./scripts/server-only-shim.mjs`, which maps that import to Next's empty module.
- After recording, run `npm run eval:report` and `npm run test:eval`. A live judge that picks a wrong
  item still cannot cause a match at Strict, because Strict also has zero false positives with the
  always-agree judge. Recall with the recorded judge may change, and the 90% floor in
  `eval.test.ts` will say so.

## Adding a case

Add it to `cases.ts`, run `npm run eval:report -- --cases` to see its outcome at every level, look at its
candidate list and eligibility (`retrieve(description, CATALOG, matchConfig('strict'))`: `candidates`,
`eligibility.blockers`), write its verdict into `judge-recording.json` as a careful judge would give it
from the candidate list, and run `npm run test:eval`. If a must-not-match line matches, fix the scorer
(make the meaning it drops a field or a blocker) or tighten the level. Do not loosen the case.
