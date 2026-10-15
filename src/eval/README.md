# Matching evaluation suite

Product rule 1 is to prefer false negatives over false positives: a wrong item on a quote is the costly
error. This suite checks that rule against the real BOXT catalog (`data/boxt-catalog.json`, 1,555 rows) and
is used to calibrate the strictness levels in `src/features/settings/strictness.ts`.

| File | What it holds |
|---|---|
| `cases.ts` | 1,017 customer lines in another supplier's style. 337 must match a named BOXT SKU. 680 must not match, and each carries a reason (`wrong_size`, `wrong_material`, `wrong_pack`, `wrong_spec`, `not_carried`, `no_product_type`, `ambiguous`) and the loosest level at which it must still not match. Three sources: 181 hand-written lines (untagged), 760 held-out verifier probes (`heldout.ts`, tag `heldout`: rounds 2 to 6), and 76 lines written against the total-accounting design (tag `b3b`: 53 must not match, 23 must match). |
| `heldout.ts` | The B3 verifiers' probe lines from rounds 2 to 5 (fix round 1: `final.txt`, `sku.txt`, `recall.txt`; fix round 2: the 34 named lines and `a1`, `a2`, `t1`, `sku`, `m1`; final round: `final.tsv`, `border.tsv` and the lines named in the request) that `cases.ts` did not already hold, with their ground truth, and round 2's 710 bare sizes (`HELDOUT_BARE_SIZES`, checked apart: they name no product). Round 1's probes were added to `cases.ts` earlier (n47 to n76). |
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

6. **The item is accounted for too (fix round 1).** The line must name the item's **head noun**, the
   last product noun of its product name ("Gaylord Lid" is a *lid*, "White Flat Paper Mailers"
   *mailers*, "Seal Safe Hand Tape Dispensers" *dispensers*), or a documented stand-in
   (`NOUN_SYNONYMS`, keyed by the item's noun: *wrap* for rolls, *film* for wrap, *sheet* for sheeting,
   *RSC* for box, *tissue* for sheets, *strap* for strapping). And every other word of the item's
   description must be accounted for by the line ("Extra Thick", "Bulk Pack", "Flat", "Top",
   "Bottoms", "Packs", "Edge"), except a material the line leaves unsaid ("Corrugated", "Poly",
   "Paper") and `NON_DEFINING_WORDS` (cased, perforated, central, folded, loose, fill, document, hand),
   which a catalog test (`eval.test.ts`) proves never tell two items of one product apart. A missing
   head or word is unstated: 0.75 at every level, and a Strict blocker. A labelled size on a mailer
   listed wider than long (Thermal Mailers 22x18") can't be placed: the order is unknown.
7. **Exact numbers.** Sizes in one unit compare exactly (12.05" is not 12", 6630' is not 6600');
   only a unit conversion gets a tolerance, `UNIT_TOLERANCE` = 0.2%, the most a whole-millimetre or
   whole-metre rounding of a standard imperial size needs (274 m for 900' is 0.12%). Mil compares
   exactly unless it came from microns (50.8 µm is 2 mil, 51 µm is a second value). Only proper
   fractions are numbers (1/2, 8 1/2, 8-1/2); "16/2" or "1/0" is a blocker and is not read.
8. **Bounded and stateless.** A line over 500 characters is not read (a blocker, no candidates), and a
   run of more than 12 digits is removed before any rule runs (a blocker). Nothing about a line is
   cached: every call returns fresh candidates. Parsed catalog rows are cached per row object and
   parsed again when the row's fields change. The evaluation suite scores each line once and applies
   each level with `retrieveScored()`.

9. **What the item states, the line must state (fix round 2).** When unsure, No match: an item's
   defining attributes are charged when the line leaves them unsaid (0.75 each at every level, and a
   Strict blocker), so Strict does not rest on the lead merely because BOXT happens to carry one variant:
   - its choices (`DEFINING_CHOICE`): closure, adhesive, print method, film (cast/blown), hand or
     machine length, flute, paper grade always; a double or triple wall and a used or recycled
     condition. A BC/EB flute is said by "double wall"; a tape's or stretch wrap's hand or machine
     length is its roll length, so a line giving the full size with the roll length (2" x 110 yd) has
     said it (strapping lists no hand length, so it must say "hand");
   - its full size: an item with dims needs the line's dims; each of its own sizes, weights and
     volumes (.160" thickness, 40 lb paper, 600 lb strapping, 14 cu ft) needs the line's; "Perforated
     12"" is the spacing every roll has and is read as "perforated" on both sides;
   - its mil, gauge, `#` (mailer size number, kraft tape model #7200, pallet grade #1/#2/#1B: #7500 and
     #7700 are both 3" x 450') and core; its ECT unless it is the standard 32 ECT board (single wall
     is the default too: every BOXT box that isn't says so);
   - a mailer's or a sheet's material (kraft or poly bubble, paper or poly flat, corrugated sheets).
   A shade is its own colour ("Deep Lavender" is not "Lavender"). Conversions within the imperial
   system are exact (2995' is not 1000 yd); only metric to imperial gets `UNIT_TOLERANCE`.

10. **Materials and defaults (final round).**
    - **Material, for every product.** The material an item's description states (foam, poly, paper,
      kraft-as-paper, corrugated, ...) must be stated by the line, or implied by the line's own words
      (`MATERIAL_IMPLIED_BY`): an ECT, burst rating, flute or wall is a rating or construction of
      corrugated board only; a thickness in mil, gauge or microns is a plastic film's. ("Newsprint" and
      "tissue" are paper and "kraft" off a box line is paper, as the parser already reads them.) A
      catalog test checks both implications: no item with an ECT, burst, flute or wall states another
      material than corrugated, and none with a mil or gauge another than poly. The implication is
      symmetric: a 48-ECT double wall sheet confirms a line's "corrugated".
    - **Defaults only where nothing says otherwise.** A default (single wall, 32 ECT, the kraft of plain
      corrugated, the clear of poly bags and stretch wrap, any choice an item leaves unstated) is taken
      as said only when no **variant** of the item states otherwise. Variants are the catalog items
      with the same head noun, description words, features, dims and measures that the line still
      allows (a variant the line contradicts, such as a blown wrap for a "cast" line, doesn't count). So
      "Gaylord 48 x 40 x 48"" must say single wall (a double wall gaylord of that size exists), plain
      11.25 x 8.75 x 4" corrugated boxes must say kraft (a white one exists), and a "Colored Bubble
      Mailer" whose colour the catalog doesn't name can't be confirmed at all. 12x10x8 needs no
      "kraft": BOXT sells no other 12x10x8.
    - **Whole numbers before a unit.** Mil, gauge and microns read a decimal, a proper fraction or a mixed
      number whole ("1/2 mil" is 0.5, "1-1/2 mil" 1.5, never 2); ECT, burst and pack counts can't start
      inside a fraction.
    - **Recall fixes.** A product name is read past the numbers in it ("Heavyweight 48-ECT Double Wall
      Sheets" is sheets); "Colors" in a wrap's name is said by the colour the line states; a line noun
      that stands for the item's head ("Foam Wrap" for Foam Rolls) is confirmed by it.

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
| Strict | 0.9 | 0.35 | recorded | 320/1017 | 100% | 0 | 95% (320/337) | 69% |
| Strict | 0.9 | 0.35 | always-agree | 320/1017 | 100% | 0 | 95% (320/337) | 69% |
| Balanced | 0.7 | 0.2 | recorded | 332/1017 | 100% | 0 | 99% (332/337) | 67% |
| Balanced | 0.7 | 0.2 | always-agree | 578/1017 | 57% | 246 (see below) | 99% (332/337) | 43% |
| Lenient | 0.55 | 0.15 | recorded | 336/1017 | 100% | 0 | 100% (336/337) | 67% |
| Lenient | 0.55 | 0.15 | always-agree | 657/1017 | 51% | 321 (see below) | 100% (336/337) | 35% |

Precision is the share of matched lines that got the right item. Recall is the share of must-match
lines that got their item. `npm run eval:report` lists every false positive.

**Balanced and Lenient rely on the judge.** With the always-agree judge they let through what they are
documented to allow: one (Balanced) or two (Lenient) unconfirmed details. Balanced's 246 are one-detail
lines (fix round 2 made every unsaid choice, size and spec one such detail, so it admits more of them; the list below is from before fix round 1 and `npm run eval:report` prints the current one), such as unstated features and claims (heavy duty, insulated, printed, telescoping, used, waterproof,
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
| B3b (35 must-not, 18 must-match) | Strict | **11** | **0** | 17/18 | 18/18 |
| B3b | Balanced | 22 | 18 | 17/18 | 18/18 |
| B3b | Lenient | 24 | 22 | 17/18 | 18/18 |
| round 2 realistic must-match (b3v-must.txt, 39) | Strict | | | 35/39 | 37/39 |
| round 3 realistic must-match (mm.json, 29 + R18) | Strict | | | 28/29 | 28/29 |
| all 430 lines | Strict | **47** | **0** | 138/153 | 145/153 |

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

### Final fix round (verifier round 6): before and after

"Before" is `3a23f0d` (fix round 2 plus an integration merge); Strict, always-agree for wrong matches:

| Source | Wrong matches before | after | Must-match recall before | after |
|---|---|---|---|---|
| round 6 must-not (`final.tsv`, `border.tsv`, the named lines: 277) | **13** | **0** | | |
| round 6 must-match (`final.tsv`, 97) | | | 90/97 | 94/97 |
| all 1,017 lines | **13** | **0** | 315/337 | 320/337 |

- The 13: the ten foam-roll and expandable-bag lines with no "foam", the three hand strapping lines
  with no "poly". The half-mil lines ("1/2 Mil" → the 2 mil bag) were wrong at Balanced and Lenient;
  now they contradict the 2 mil bag at every level.
- **Lead reliance, honestly.** In this evaluation set no must-not line is Strict-eligible against its
  top item (0 of 680). At `3a23f0d` 18 of these lines were: 13 matched (the false positives above) and
  5 were held only by the lead (h6n001, h6n002 colour-less colored mailers; h6n003, h6n121, h6n278
  gaylords with single wall unsaid); the variant rule now blocks those 5, so none rests on the lead
  alone. Strict still keeps the lead
  (0.35) as a second gate: a new line that is fully accounted for against two items of different
  groups would rest on it, and is then No match.
- One `final.tsv` NO line is encoded as must-match with the reason in its note: "Clear Top Sheeting
  60" x 60' 1-1/2 Mil" is PC91 (1-1/2 mil is exactly its 1.5 mil).
- Must-match lines lost by this round's rules (the verifier's or mine), and why: m42, h6m042 "Bin
  Boxes ..." and h6m043 "Racking Bin, Palletized" (the item is *corrugated*, unsaid); h3-R28
  "Shipping Boxes 12 x 10 x 8, 25 per bundle" (corrugated unsaid; "shipping" is no material);
  h6m097 "Corrugated Boxes 11 1/4 x 8 3/4 x 4"" (a white box of that size exists, so kraft must be
  said; the verifier listed it must-match, the decided rule says No match). Regained: the half-mil
  parse fix and the variant filter recovered the cast/blown wrap lines that the first cut of the
  variant rule lost.

### Fix round 2 (verifier round 5): before and after

"Before" is `c0f7271` (fix round 1 plus an integration merge); Strict, always-agree for wrong matches:

| Source | Wrong matches before | after | Must-match recall before | after |
|---|---|---|---|---|
| round 5 must-not (84 lines: the coordinator's 34 and the rest of a1, a2, t1, sku) | **42** | **0** | 3/3 | 3/3 |
| round 5 must-match (`m1.txt`, 36 new) | | | 36/36 | 36/36 |
| all 642 lines | **42** | **0** | 230/239 | 225/239 |

- **Lead-only must-not lines: 0** (was 7 before this round, 1 midway: "#5 Lavender" against "Deep
  Lavender", fixed by reading shades as their own colour). All 403 must-not lines are blocked by total
  accounting at Strict; none rests on the score or lead alone.
- Three verifier lines are encoded as must-match, with the reason in the case note: "Double Cushion
  Pillow Air Cushion Film Rolls" (h5n22, one of the 34): MINP67 has no size in the catalog, the line
  says every word the item says, and "Double Cushion Pillow" tells it from the two Bubble Quilt rolls;
  "Black Top Sheeting 60" x 60' 1.5 Mil" (h5n71, a2.txt) is PC85 word for word; "Plastic Reclosable
  Bags 4 x 6" 2 Mil, Clear" is listed NO in a1.txt and must-match in m1.txt (plastic is poly, clear is
  the bags' colour). Each is a one-line change if the decision goes the other way.
- n41 ("Black Poly Strapping 1/2" 600 lb") is now declared `strict`: Balanced and Lenient held it only
  because the hand and machine coils tied; the hand coil now leads with one unconfirmed detail (hand
  length), which Balanced admits by design. Strict blocks it.
- Lost at Strict this round (5): m59, h2m15, a07 ("Kraft Tape 70/72 mm x 450'": the item's #7000 or
  #7200 is unsaid; the width alone is unique among kraft tapes, but the model number is what tells
  #7500 from #7700 at 3" x 450', so it is required), h2m27 ("Edge Protectors 2 x 2 x 36"": the .160"
  thickness is unsaid; all 21 BOXT edge protectors are .160", but the verifier's own probes treat the
  thickness as required), h2m31 ("Recycled Heat Treated Pallets 48 x 40"": the #1 grade is unsaid;
  recycled and heat treated is unique). The first and last could be argued to match (the rest of the
  line is unique), but that is the lead reasoning this round removes.

### Fix round 1 (verifier round 4): before and after

"Before" is the head the verifier failed (`612506c`); "after" is this head. Strict, always-agree judge
for wrong matches, recorded judge for recall:

| Source | Wrong matches before | after | Must-match recall before | after |
|---|---|---|---|---|
| round 4 must-not (24 lines, plus 2 corrected to must-match) | **18** | **0** | 2/2 | 2/2 |
| fix-round variants (18 must-not, 5 must-match) | **11** | **0** | 3/5 | 5/5 |
| round 4 realistic must-match (`recall.txt`, 40) | | | 36/40 | 38/40 |
| all 519 lines | **29** | **0** | 186/200 | 191/200 |

- The 18 are the verifier's 14 (four "Gaylord ... 48x40" lines and "Gaylord Lids"' siblings → the
  Gaylord Lid; "White Paper", "White Flat Paper", "Padded Paper" → paper mailers; "Seal Safe Hand Tape"
  → the dispenser; 12.05", 24.1", 48.2", 6630', 6.03" within the old 0.5%; "16/2" read as 8) and four
  more lines of `final.txt` from the same item-side gap: "Pallet Protectors" (Edge Protectors),
  "Bubble Wrap Dispenser" (Bubble Dispenser Packs), "Thermal Mailers 18" L x 22" W" (a mailer listed
  22x18), "Black Pallet Sheeting" (Top Sheeting).
- Two `final.txt`/`sku.txt` lines are encoded as must-match, with the reason in the case note: "Insulated
  Mailers 12 x 17" is BOXT's Thermal Mailers 12x17" (thermal mailers are insulated mailers; every
  word and the size are read), and "Gaylord Lids 48x40"" is the Gaylord Lid.
- The verifier's attack lists `a3.txt`/`a4.txt` still "match" 25 lines marked NO (8 and 17); those are readings I
  believe are right and the verifier reported as held: equivalent ECT and burst ("32 ECT 200#"), one
  value said twice ("25/bundle 25/bdl", "2 Mil 2.0 Mil"), "non-white" on a kraft box, whole-millimetre
  metric sizes, and plainly correct bag and mailer lines. "2 Mil 51 micron" was a real leak (two
  thicknesses merged at 0.5%) and is now a blocker.
- Recall: the item-side charge separates siblings that used to tie, so "Expandable Foam Bags 18 x 24""
  now matches the plain bags and the 4x4 desktop labels lines match; m08 "Triple Wall Gaylord Boxes" is
  newly left for the rep (the item is "Gaylord **Bottoms**").
- Memory and time: no line cache (heap growth 0 MB over 5,000 distinct lines, was ~1 MB per cached
  line); the verifier's 5,000 to 20,000-character inputs take 0 to 10 ms after the catalog is parsed
  once (was up to 3.9 s).

### What total accounting costs in recall (Strict, realistic must-match lines)

Strict recall is 95% (320/337) overall: 35/39 on round 2's realistic lines, 28/29 on round 3's, 39/40
on round 4's, 36/36 on round 5's and 94/97 on round 6's. `npm run eval:report` lists the 17 lines
Strict leaves for the rep; the rules that cost them are named in the round sections above and here:
- **Total accounting (new):** m61 `Reclosable Bags 4 x 6" 2 Mil, Not Printed` (a negation is never
  confirmed by silence) and h2m08 `Corrugated Boxes 6 x 6 x 6" 25/bundle 500 total` ("500 total" is the
  order quantity, an unread number). m36 (self seal, which the catalog doesn't state) and m37 (no
  "white") were already below the score.
- **Item-side accounting (fix round 1):** m08 `Triple Wall Gaylord Boxes 48 x 40 x 36"` (the item is
  Gaylord Bottoms).
- **Unread number:** h4m32 `Edge Protectors 2 x 2 x 12" .160` (".160" with no unit outside the tuple is
  a stray; strays are never confirmed).
- **Lead (unchanged rule):** m32 and m42 (a plain box and a bin box of the same size), h4m11 `#0 Teal
  Colored Bubble Mailers` (another #0 colour one detail away).

Realistic recall went up, not down: total accounting also fixed misses ("RSC" read as a box noun, the
"8x8 Core" of machine strapping read as a core instead of a second size, W x L bags, and "4" x 6" x 2
mil", where the "x" before a film thickness joins it to the size), and the rules
that cost recall cost it only where the line says something the catalog doesn't confirm.

### Margins (Strict, on the scorer alone)

All 680 must-not lines either name no product the top item confirms or are not Strict-eligible, so they
cannot clear Strict whatever their score and lead. None of them is Strict-eligible against its top item,
so in this set none rests on the lead alone (7 after fix round 1; on this set 5 at `3a23f0d`; 0 now); for a new
line, the lead remains a real second gate. The lead and minScore
remain as a second line of defence: minScore 0.90 admits only a full score (1.00), since anything
unconfirmed is both 0.75 and a blocker.

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
Nothing about a line is cached; parsed catalog rows are cached per row object and re-parsed when edited.

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
