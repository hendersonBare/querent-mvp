# Matching evaluation suite

Product rule 1 is to prefer false negatives over false positives: a wrong item on a quote is the costly
error. This suite checks that rule against the real BOXT catalog (`data/boxt-catalog.json`, 1,555 rows) and
is used to calibrate the strictness levels in `src/features/settings/strictness.ts`.

| File | What it holds |
|---|---|
| `cases.ts` | 123 hand-written customer lines in another supplier's style. 47 must match a named BOXT SKU. 76 must not match, and each carries a reason (`wrong_size`, `wrong_material`, `wrong_pack`, `wrong_spec`, `not_carried`) and the loosest level at which it must still not match. |
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
| Strict | 0.9 | 0.35 | recorded | 43/123 | 100% | 0 | 91% (43/47) | 65% |
| Strict | 0.9 | 0.35 | always-agree | 43/123 | 100% | 0 | 91% (43/47) | 65% |
| Balanced | 0.7 | 0.2 | recorded | 47/123 | 100% | 0 | 100% (47/47) | 62% |
| Balanced | 0.7 | 0.2 | always-agree | 66/123 | 71% | 19 (see below) | 100% (47/47) | 46% |
| Lenient | 0.55 | 0.15 | recorded | 47/123 | 100% | 0 | 100% (47/47) | 62% |
| Lenient | 0.55 | 0.15 | always-agree | 77/123 | 61% | 30 (see below) | 100% (47/47) | 37% |

Precision is the share of matched lines that got the right item. Recall is the share of must-match
lines that got their item. The no-match rate counts all 123 lines, and 76 of them should be No match.
`npm run eval:report` lists every false positive. With the always-agree judge:
- **Balanced** lets through n42 and n46 plus the one-qualifier lines n47 to n59, n64, n65, n72 and
  n76. Examples are heavy duty, insulated, anti-static, printed, telescoping, used, waterproof,
  octagon, biodegradable, hazmat and economy items matched to the plain item.
- **Lenient** adds the two-detail lines (n32, n34, n44, n62, n63, n66, n67, n71, n73 to n75).

## How the scores fall, and how the levels were set

A score is a product of factors (`src/server/matching/score-packaging.ts`):
- **1.00:** the item accounts for everything the line says, and the line for everything defining
  about the item.
- **0.75:** one thing on either side is unaccounted for (`UNCONFIRMED`). It can be a line word or
  qualifier the item doesn't confirm, such as "heavy duty", "telescoping" or a word never seen
  before, or a defining item feature the line doesn't mention, such as reclosable, a bin box, a
  stated white, or "recycled".
- **0.56:** two such things.
- **0.50 or less:** any contradiction (`CONFLICT`). Every level's minScore is above it, so no level
  can match an item that contradicts the line.
- **0.25:** the gap between a full match and a rival product that differs from it only by one
  unmentioned detail.

Because the factors are fixed, a line with no contradiction scores 1.00, 0.75, 0.60 (off-noun) or
less, never in between. The levels sit in those gaps:

- **Strict (the default): 0.90 / 0.35.** It requires that nothing is left unaccounted for, and that
  no other product comes within one detail. It has zero false positives with both judges. The
  margins are printed by `eval:report`:
  - **Score:** the best must-not-match line with a passing lead tops out at **0.75**, 0.15 below
    minScore. That line is n46, `Poly Bags 4 x 6" 2 Mil` against the reclosable bag, and every
    one-qualifier line is at 0.75 too. A full match is 1.00, 0.10 above minScore.
  - **Lead:** the best must-not-match lead among lines with a passing score is **0.25**, 0.10 below
    minLead. That is n42, `Bubble Mailers #2 8 1/2 x 12"`, where poly and kraft are both sold and
    the line doesn't say which. The weakest true Strict match leads by 0.44 (m11), 0.09 above minLead.
- **What Strict leaves for the rep.** Strict leaves 4 of the 47 must-match lines unmatched:
  - plain box vs bin box of the same size, lead 0.25 (m32, m42);
  - the labels line that doesn't say "white" (m37);
  - the "self seal" kraft mailer, whose closure BOXT doesn't state (m36).

  Recall went from 44/47 to 43/47 when the symmetric rule came in. m36 was the line that dropped:
  the rule now charges an unconfirmed "self seal" like any other unconfirmed detail.
- **Balanced: 0.70 / 0.20.** It allows one unconfirmed detail and a rival one detail away. It
  matched all 47 lines, and the recorded judge refused every false candidate. With the always-agree
  judge, every one-qualifier line gets through, so at Balanced the judge is what catches "heavy duty"
  vs plain.
- **Lenient: 0.55 / 0.15.** It allows two unconfirmed details. It adds no recall over Balanced on
  this set and is offered as the loosest option only.
- **Declared levels.** 43 must-not-match lines are declared `lenient`: these are the contradictions,
  and they hold at every level with both judges. 3 are declared `balanced` and 30 `strict`: these are
  the lines whose only fault is one or two unconfirmed details. n44 (heavy duty 12x12x12, "275 lb
  test") moved from `lenient` to `balanced` with the symmetric rule. BOXT doesn't state that box's
  rating, and the line doesn't say double wall: that is two unconfirmed details, which is exactly
  what Lenient admits.

## Scoring in one paragraph

The scorer is `src/server/matching/score-packaging.ts`, and its comments give the full rules.
- **Dimensions** are a positional tuple: 12x10x8 is not 12x8x10, and 4x6 is not 6x4, because the
  catalog sells both.
- **Other typed attributes:** ECT or a burst rating (200 lb = 32 ECT, 275 = 44, 350 = 55), mil,
  gauge, the mailer `#`, colour, material, wall, closure, adhesive, print method, film, hand or
  machine length, paper grade, condition (new, used, recycled) and pack quantity.
- **Words:** every word the line uses must appear in the item's description or keywords. The only
  exceptions are the documented noise words in `packaging.ts`: grammar, unit and pack words left
  after their numbers are read, and the other supplier's own name.
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
