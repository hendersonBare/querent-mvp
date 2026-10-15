# Matching evaluation suite

Product rule 1 is to prefer false negatives over false positives: a wrong item on a quote is the costly
error. This suite checks that rule against the real BOXT catalog (`data/boxt-catalog.json`, 1,555 rows) and
is used to calibrate the strictness levels in `src/features/settings/strictness.ts`.

| File | What it holds |
|---|---|
| `cases.ts` | 181 hand-written customer lines in another supplier's style. 62 must match a named BOXT SKU. 119 must not match, and each carries a reason (`wrong_size`, `wrong_material`, `wrong_pack`, `wrong_spec`, `not_carried`, `no_product_type`) and the loosest level at which it must still not match. |
| `judge-recording.json` | One verdict per case, in B4's `JudgeVerdict` shape (`{sku \| null, reason}`), plus `recordedBy`. **The current verdicts are `hand-written`**: they were written in the build session, not recorded from a model, because no API key was available. Each one imitates a careful judge that sees only the line and the candidate list, and follows B4's rule of picking the first pricing tier. `npm run eval:record` replaces them with the live judge's (`recordedBy: 'live'`, with the model and time). |
| `run.ts` | Runs each case through the pipeline's own steps after parsing: `retrieve` (the real scorer and catalog), then the judge, then `decide`. The judge gets the candidates as B4's `JudgeCandidate` (SKU, description, pack label, category), and its answer passes B4's `withinCandidates` guard. It runs at every level with two judges: the recorded one, and an **always-agree** judge that picks the top candidate, so that no level's safety depends on the judge. |
| `eval.test.ts` | Part of `npm test`; `npm run test:eval` runs it alone. It **fails the build** in any of these cases: a must-not-match line matches at Strict with either judge; it matches at its declared level (or any stricter one) with either judge; a must-match line gets the wrong item at Strict; Strict recall with the recorded judge drops below 90%. It also checks that every case has a recording and that every expected SKU is in the catalog. |
| `../../scripts/eval-report.ts` | `npm run eval:report` prints the table below and the cases that drive the calibration. Add `--markdown` for the table only, or `--cases` for every outcome. |

The supplier SKUs in `cases.ts` (`S-4128`, ...) are illustrative. The parser removes them, and
`description` is what the matcher sees. The matcher ignores SKUs: a BOXT SKU typed into a line is plain text.

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

## Results (`npm run eval:report`)

| Level | minScore | minLead | Judge | Matched | Precision | False positives | Must-match recall | No-match rate |
|---|---|---|---|---|---|---|---|---|
| Strict | 0.9 | 0.35 | recorded | 58/181 | 100% | 0 | 94% (58/62) | 68% |
| Strict | 0.9 | 0.35 | always-agree | 58/181 | 100% | 0 | 94% (58/62) | 68% |
| Balanced | 0.7 | 0.2 | recorded | 62/181 | 100% | 0 | 100% (62/62) | 66% |
| Balanced | 0.7 | 0.2 | always-agree | 84/181 | 74% | 22 (see below) | 100% (62/62) | 54% |
| Lenient | 0.55 | 0.15 | recorded | 62/181 | 100% | 0 | 100% (62/62) | 66% |
| Lenient | 0.55 | 0.15 | always-agree | 99/181 | 63% | 37 (see below) | 100% (62/62) | 45% |

Precision is the share of matched lines that got the right item. Recall is the share of must-match
lines that got their item. The no-match rate counts all 181 lines, and 119 of them should be No match.
`npm run eval:report` lists every false positive. With the always-agree judge:
- **Balanced** lets through the one-detail lines: n42, n46, n47 to n59, n64, n65, n72, n76, s03
  ("B flute" on a box that states no flute), c03 (tuck flap) and c04 (string and button).
- **Lenient** adds the two-detail lines: n32, n34, n44, n62, n63, n66, n67, n71, n73 to n75, s01,
  s02, s04 and c02.

## How lines are read (the classes the verifier probed)

Every token of a line is either read by a rule or left as a word the item must account for. Nothing
is dropped for being short.
- **Numbers.** Each number is classified:
  - a member of the dims tuple;
  - a pack count: `25/bundle`, `case of 500`, `10 pk`, `10-pack`, `pk of 10`, `10/pk`, `1000 ct`, `500 pcs`;
  - an ECT or burst rating;
  - mil, or microns read as mil;
  - gauge;
  - a `#2` size number;
  - a measure with a unit (in, ft, yd, mm, cm, m, lb, oz, cu ft).

  A number with no unit outside a tuple is a **stray**. It costs 0.75 and is never confirmed by an
  equal dimension: "(10 pk)" is a pack, and a bare "10" is a stray, never the 10" of 12x10x8.
- **Tuples.** Members are separated by `x`, `X`, `×`, `*`, `by`, or hyphens in a three-part chain
  (`12-8-10`). They are compared position by position only. L/W/H/D labels reorder them into the
  catalog's L x W x D order. The labels can come before the number (`L 12`), after it (`12 in. L`,
  `12" long`), or as a legend (`(W x L x H)`). So "12 in. L x 8 in. W x 10 in. H" is 12x8x10, not
  BOXT's 12x10x8.
- **Units.** A measure with a unit is only compared with a catalog size that has a unit of the same
  kind, after conversion within 0.5%. For example, 914 mm is 36", and 0.5 cm is not 0.5". A
  catalog's unitless number counts as inches only in the `tape` and `storage` categories, which hold
  strapping widths and edge-protector thickness. Anywhere else a unitless catalog number can't
  confirm anything.
- **Negation.** `no X`, `w/o X`, `without X`, `not X`, `non-X` and `X-free` negate X: one word, or two
  when together they name one thing ("no suffocation warning").
  - If the item has X, the line contradicts it.
  - If the item doesn't state a negated choice or colour (a closure, flute, adhesive...), that is
    unknown and costs 0.75.
  - If the item lacks a negated feature or word ("no bubble", "not printed"), the negation is kept.
- **Closures** are distinct values: slider, press-to-close (zip, reclosable), self-seal (peel and
  seal), tuck, string and button, and open top.
- **Flute letters** (A, B, C, E, F, BC, EB with "flute") are a choice. BC and EB mean double wall.
- **Product type.** A match needs the line to name a product noun (box, bag, mailer, tape, roll,
  sheet, paper, ...) that the item confirms. A bare size like "19x24" can score 1.00 by coincidence,
  but it never clears at any level: the reason is `no_product_type`. It still gets near-misses.

## How the scores fall, and how the levels were set

A score is a product of factors (`src/server/matching/score-packaging.ts`):
- **1.00:** the item accounts for everything the line says, and the line for everything defining
  about the item.
- **0.75:** one thing on either side is unaccounted for (`UNCONFIRMED`). It can be an unexplained
  word, qualifier, stray number or unknown negation, or an unmentioned defining item feature.
- **0.56:** two such things.
- **0.50 or less:** any contradiction (`CONFLICT`). That covers size, pack, rating, mil, colour,
  material, closure, flute, condition, unit, or a negation the item breaks. Every level's minScore
  is above it.
- **0.25:** the gap between a full match and a rival product that differs from it by one unmentioned
  detail.

The round-3 changes didn't move this structure, so the levels stayed the same. The evaluation
supports them:

- **Strict (the default): 0.90 / 0.35.** It has zero false positives with both judges across all 119
  must-not-match lines. The margins are printed by `eval:report`, and 10 lines that name no product
  type are left out of them because they can't clear:
  - **Score:** the best false line with a passing lead tops out at **0.75**, 0.15 below minScore.
    That line is n46 (`Poly Bags 4 x 6" 2 Mil` against the reclosable bag); every one-detail line is
    at 0.75 too. A full match is 1.00.
  - **Lead:** the best false lead among lines with a passing score is **0.25**, 0.10 below minLead.
    That line is n42 (`Bubble Mailers #2 8 1/2 x 12"`): poly or kraft, the line doesn't say.
- **Recall at Strict: 58 of 62 must-match lines.** That includes all 15 new ones: pack counts that
  match, L/W/H-labelled lines, `*` and hyphen tuples, metric sizes, a negation the item keeps, and a
  flute letter. It leaves 4 lines for the rep:
  - plain box vs bin box of the same size (m32, m42);
  - the labels line that doesn't say "white" (m37);
  - the "self seal" kraft mailer, whose closure BOXT doesn't state (m36).
- **Balanced: 0.70 / 0.20** allows one unconfirmed detail and a rival one detail away. **Lenient:
  0.55 / 0.15** allows two. With the recorded judge both had no false positives; with the
  always-agree judge they let through the lines listed above.
- **Declared levels.** 79 must-not-match lines are declared `lenient`: the contradictions and the
  bare sizes, which hold at every level with both judges. 6 are declared `balanced`: n32, n34, n44,
  s01, s02 and c02, where another item has exactly two unconfirmed details, which Lenient admits. 34
  are declared `strict`.

## Scoring in one paragraph

The scorer is `src/server/matching/score-packaging.ts`, and its comments give the full rules.
- **Typed attributes:** the positional dims tuple, the measures, pack, ECT or burst rating (200 lb =
  32 ECT, 275 = 44, 350 = 55), mil, gauge, mailer `#`, colour, material, wall, flute, closure,
  adhesive, print method, film, hand or machine length, paper grade, condition and negations.
- **Words:** every word the line uses must appear in the item's description or keywords. The only
  exceptions are the documented noise words in `packaging.ts`: grammar, unit and pack words left
  after their numbers are read, the leftover "x", and the other supplier's own name.
- **Factors:** a contradiction multiplies the score by 0.5, and anything unaccounted for on either
  side multiplies it by 0.75. An item scores 0 unless a word, a feature or the size fits, and an item
  with no size contradicts a line that names one.
- **Lead and groups:** the lead is measured against the best candidate of a **different product
  group**. A group is the description without its pricing tier, so bundle and pallet pricing of one
  box are one group, even where they count 10 and 25.

## Adding a case

Add it to `cases.ts`, run `npm run eval:report -- --cases` to see its outcome at every level, look at its candidate
list (`retrieve(description, CATALOG, matchConfig('strict')).candidates`), write its verdict into `judge-recording.json` as a careful judge would give it from the candidate list, and run
`npm run test:eval`. If a must-not-match line matches, fix the scorer or tighten the level. Do not
loosen the case.
