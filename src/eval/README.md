# Matching evaluation suite

Product rule 1 is to prefer false negatives over false positives: a wrong item on a quote is the costly
error. This suite checks that rule against the real BOXT catalog (`data/boxt-catalog.json`, 1,555 rows) and
is used to calibrate the strictness levels in `src/features/settings/strictness.ts`.

| File | What it holds |
|---|---|
| `cases.ts` | 93 hand-written customer lines in another supplier's style. 47 must match a named BOXT SKU. 46 must not match, and each carries a reason (`wrong_size`, `wrong_material`, `wrong_pack`, `wrong_spec`, `not_carried`) and the loosest level at which it must still not match. |
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
| Strict | 0.85 | 0.3 | recorded | 44/93 | 100% | 0 | 94% (44/47) | 53% |
| Strict | 0.85 | 0.3 | always-agree | 44/93 | 100% | 0 | 94% (44/47) | 53% |
| Balanced | 0.8 | 0.2 | recorded | 47/93 | 100% | 0 | 100% (47/47) | 49% |
| Balanced | 0.8 | 0.2 | always-agree | 49/93 | 96% | n42-bubble-mailer-unspecified -> B833, n46-poly-bags-plain -> PB3565 | 100% (47/47) | 47% |
| Lenient | 0.7 | 0.15 | recorded | 47/93 | 100% | 0 | 100% (47/47) | 49% |
| Lenient | 0.7 | 0.15 | always-agree | 50/93 | 94% | n42-bubble-mailer-unspecified -> B833, n32-flat-poly-bags -> PB3565, n46-poly-bags-plain -> PB3565 | 100% (47/47) | 46% |

Precision is the share of matched lines that got the right item. Recall is the share of must-match
lines that got their item. The no-match rate counts all 93 lines, and 46 of them should be No match.

## How the levels were set

- **Strict (the default): 0.85 / 0.30.** It has zero false positives with both judges. On this set
  it stays at zero for any minScore in (0.80, 0.87] and any minLead in (0.20, 0.30], and both
  values were chosen inside those ranges with margin:
  - **minScore above 0.80.** An item scores exactly 0.80 when it confirms everything the line says
    but has one defining feature the line doesn't mention. One example is plain `Poly Bags 4 x 6"
    2 Mil 1000/case` against BOXT's reclosable 4x6 2 mil bag (case n46): the other supplier's plain
    poly bags are flat open-top bags.
  - **minLead above 0.20.** When the line leaves one defining feature open, two different products
    can land exactly 0.20 apart. In `Bubble Mailers #2 8 1/2 x 12"` (case n42), the poly mailer
    scores 1.00 and the kraft one 0.80, only because the kraft one states its colour. Nothing in
    the line says poly.
- **What Strict leaves for the rep.** Strict leaves 3 of the 47 must-match lines unmatched:
  - two lines where a plain box and a bin box of the same size are 0.20 apart (m32, m42);
  - one where the line doesn't say "white" for labels that are always white (m37).
- **Balanced: 0.80 / 0.20.** It admits a best item with one unmentioned defining feature when it
  leads by 0.20. It matched all 47 lines. With the recorded judge it had no false positives. With
  the always-agree judge it had two (n42, n46), which shows that Balanced relies on the judge for
  those lines.
- **Lenient: 0.70 / 0.15.** It adds no recall on this set and lets a third line (n32) through the
  always-agree judge. It is offered as the loosest option, not as a recommendation.
- **The hard floor.** Every level's minScore is above `CONFLICT` (0.5). An item that contradicts
  anything the line states (size, ECT, mil, pack, colour, material, closure, ...) scores at most
  0.5, so no level can match it. All 42 must-not-match lines declared `lenient` hold at every level
  with both judges.

## Scoring in one paragraph

The scorer is `src/server/matching/score-packaging.ts`, and its comments give the full rules.
The dimensions are a positional tuple (12x10x8 is not 12x8x10, and 4x6 is not 6x4, because the
catalog sells both). The other typed attributes are ECT or a burst rating (200 lb = 32 ECT, 275 = 44,
350 = 55), mil, gauge, the mailer `#`, colour, material, wall, closure, adhesive, print method, film,
hand or machine length, paper grade and pack quantity. Any contradiction multiplies the score by 0.5.
Each defining feature the item has and the line doesn't mention multiplies it by 0.8. An item scores 0
unless a word, a feature or the size fits. The lead is measured against the best candidate of a
**different product group**, and a group is the description without its pricing tier. Bundle and
pallet pricing of one box are therefore one group, even where they count 10 and 25.

## Adding a case

Add it to `cases.ts`, run `npm run eval:report -- --cases` to see its outcome at every level, look at its candidate
list (`retrieve(description, CATALOG, matchConfig('strict')).candidates`), write its verdict into `judge-recording.json` as a careful judge would give it from the candidate list, and run
`npm run test:eval`. If a must-not-match line matches, fix the scorer or tighten the level. Do not
loosen the case.
