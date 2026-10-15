import type {StrictnessLevel} from '@/features/settings/strictness';
import {HELDOUT_CASES} from './heldout';

// The matching evaluation set (BOXT task B3): hand-written customer lines in the style of another
// supplier's catalog (Uline-style wording: size first, inch marks, "200 lb test", "25/bundle"),
// each with what must happen against the real BOXT catalog (data/boxt-catalog.json).
//
//   - must match: the BOXT SKU that truly is the same product (size, spec, material and pack);
//   - must not match: a near-identical item BOXT sells with the wrong size, material, pack or spec,
//     or an item BOXT doesn't sell at all, or a line that names no product (a bare size). `level` is the loosest strictness level at which the
//     line must still not match (default 'strict'): clear contradictions must hold even at Lenient.
//
// The supplier SKUs ("S-4128") are illustrative, not a claim about another supplier's catalog; the
// parser removes them, and `description` is what reaches the matcher. Wrong items are the costly
// error, so the suite fails the build if any must-not-match line matches (src/eval/eval.test.ts).

/** `ambiguous`: the line names two items, two values of one attribute, a range, or a size relation ("for a 12x10x8 item"). */
export type NoMatchWhy='wrong_size'|'wrong_material'|'wrong_pack'|'wrong_spec'|'not_carried'|'no_product_type'|'ambiguous';
export const NO_MATCH_WHYS:readonly NoMatchWhy[]=['wrong_size','wrong_material','wrong_pack','wrong_spec','not_carried','no_product_type','ambiguous'];

export interface EvalCase {
  id:string;
  /** The customer's line as sent, with the other supplier's SKU. */
  original:string;
  /** What the parser passes to the matcher: the line without the supplier SKU. */
  description:string;
  expect:{sku:string}|'no_match';
  /** Why a must-not-match line must not match. */
  why?:NoMatchWhy;
  /** Must-not-match only: the loosest level at which it must still not match. */
  level?:StrictnessLevel;
  note:string;
  /** `heldout`: a verifier's probe line the matcher was not tuned on (heldout.ts); `b3b`: written to attack the total-accounting rules. */
  tags?:readonly string[];
}

/** The parser's job, as far as this suite needs it: drop a leading supplier SKU ("S-4128", "S-12458"). */
export const withoutSupplierSku=(line:string)=>line.replace(/^\s*[A-Z]{1,3}-\d{2,6}[A-Z]?\s+/,'').trim();

const match=(id:string,original:string,sku:string,note:string):EvalCase=>({id,original,description:withoutSupplierSku(original),expect:{sku},note});
const noMatch=(id:string,original:string,why:NoMatchWhy,level:StrictnessLevel,note:string):EvalCase=>({id,original,description:withoutSupplierSku(original),expect:'no_match',why,level,note});

const HANDWRITTEN:readonly EvalCase[]=[
  // ---- Must match ---------------------------------------------------------------------------------
  match('m01-box-12x10x8','S-4128 12 x 10 x 8" Corrugated Boxes 200 lb test 25/bundle','12108-BDL','200 lb test is sold as the 32 ECT equivalent; 25 per bundle as BOXT bundles it.'),
  match('m02-box-12x10x6','S-4125 12 x 10 x 6" Corrugated Boxes 200# 25/bdl','12106-BDL','Bare "200#" on a box line is the burst rating.'),
  match('m03-box-12x12x12','S-4166 12 x 12 x 12" Corrugated Boxes 32 ECT 25/bundle','121212-BDL','The heavy duty 12x12x12 is double wall; the line is plain.'),
  match('m04-box-kraft-10x8x6','S-4115 10 x 8 x 6" Kraft Corrugated Boxes, 200 lb test','1086-BDL','Kraft is plain corrugated; the white 10x8x6 contradicts it.'),
  match('m05-box-white-10x8x6','S-1823 White Corrugated Boxes 10 x 8 x 6" 32 ECT 25/bundle','1086W-BDL','White stated, so the white box, not the plain one.'),
  match('m06-box-16-cube','S-4180 Corrugated Boxes 16 x 16 x 16" 200 lb test 25/bundle','161616-BDL','Plain single wall 16" cube; the heavy duty 16" cube is double wall.'),
  match('m07-hd-16-cube','S-4183 16 x 16 x 16" Heavy Duty Double Wall Boxes','HD161616DW-BDL','Heavy duty double wall stated: BC flute is double wall.'),
  match('m08-gaylord-tw','S-14521 Triple Wall Gaylord Boxes 48 x 40 x 36"','GAYLORDTW-BDL','The judge may pick either pricing tier of this gaylord.'),
  match('m09-mailer-white-box','S-4247 White Corrugated Mailers 12 1/4 x 9 1/4 x 4" 50/bundle','M1294','Fractional sizes equal the catalog\'s decimals.'),
  match('m10-bag-4x6-2mil','S-1287 Reclosable Bags 4 x 6", 2 Mil, 1,000/case','PB3565','Reclosable, size in order, mil and case count all confirmed.'),
  match('m11-bag-6x9-4mil','S-1300 Reclosable Bags 6 x 9" 4 Mil 1000/cs','PB3740','"1000/cs" is the case count.'),
  match('m12-bag-2x3-2mil','S-1279 Reclosable Bags 2 x 3" 2 Mil 1000/case','PB3525','Smallest reclosable size.'),
  match('m13-kraft-bubble-2','S-3145 Kraft Bubble Mailers #2 8 1/2 x 12" 100/case','B855SS','Kraft (paper) bubble mailer, not the poly one of the same size.'),
  match('m14-kraft-bubble-5','S-3148 Kraft Bubble Mailers #5 10 1/2 x 16" 100/case','B858SS','#5 kraft.'),
  match('m15-poly-bubble-0','S-3216 Poly Bubble Mailers #0 6 1/2 x 10" 250/case','B831','#0 is not #00 or #000.'),
  match('m16-poly-mailer-4','S-7234 Flat Poly Mailers #4 10 x 13" 1000/case','B874','Flat poly mailer, not a reclosable bag of the same size.'),
  match('m17-tape-hotmelt','S-423 Uline Industrial Tape 2" x 110 yds 1.9 Mil Clear Hot Melt 36 rolls/case','T902700','The supplier\'s brand name is ignored; mil and adhesive pick the tape.'),
  match('m18-tape-acrylic','S-5367 Acrylic Tape 3" x 110 yds 2.0 Mil Clear 24 rolls/case','T905400','2.0 mil acrylic.'),
  match('m19-stretch-cast','S-2963 Cast Hand Stretch Film 18" x 1500\' 80 Gauge Clear 4 rolls/case','SF188CAST','Clear cast, not blown and not a coloured cast film.'),
  match('m20-kraft-roll','S-8513 Kraft Paper Roll 36" x 900\' 40 lb','KP3640','Width, length and basis weight confirmed.'),
  match('m21-kraft-sheets','S-8529 Kraft Paper Sheets 24 x 36" 40 lb','KPS243640','40 lb sheets; the "50 lb./Bundle" in the catalog is the bundle weight.'),
  match('m22-newsprint','S-3608 Newsprint Sheets 24 x 36" 50 lb','NP2430','Newsprint, not kraft paper of the same size and weight.'),
  match('m23-tissue-kraft','S-5236 Kraft Tissue Paper 20 x 30"','T2030I','Kraft tissue, not white tissue.'),
  match('m24-bubble-roll','S-1792 Bubble Wrap Roll 1/2" x 12" x 250\' Perforated','BW12S12P','Thickness-first roll size reads against "1/2" Bubble 12"x250\'".'),
  match('m25-foam-roll','S-1817 Foam Rolls 1/8" x 12" x 550\' Perforated','FW18S12P','Same reading for foam.'),
  match('m26-edge','S-1658 Edge Protectors 2 x 2 x 48" .160" 80/case','EP2248160BX','Size, thickness and case count.'),
  match('m27-labels-desktop','S-6900 Desktop Direct Thermal Labels 4 x 6" White 3,000/case','THD114','Desktop roll, not fanfold.'),
  match('m28-pallet-cover','S-1749 Clear Pallet Covers 48 x 42 x 48" 2 Mil 75/case','PC515','Pallet cover with mil and case count.'),
  match('m29-envelope','S-2205 Clear Face Packing List Envelopes 7 x 10" 1000/case','PL520','Clear face packing list envelopes are BOXT\'s document envelopes.'),
  match('m30-folding-carton','S-11651 Kraft Folding Cartons 4 x 4 x 4"','RTC61','Kraft carton, not the white one; cartons, not corrugated boxes.'),
  match('m31-peanuts','S-6551 Anti-Static Loose Fill Peanuts 14 cu. ft.','14NUTSAS','Cubic feet read as a volume.'),
  match('m32-box-12x12x8-bin','S-4202 Corrugated Boxes 12 x 12 x 8" 25/bundle','12128-BDL','A bin box of the same size exists; the plain line means the plain box.'),
  // Looser, everyday wording.
  match('m33-brown-shipping-boxes','S-4128 Brown Shipping Boxes 12x10x8 32ECT','12108-BDL','Brown is kraft; no inch marks; "32ECT" run together.'),
  match('m34-ziploc','S-1287 Ziploc Bags 4 x 6 2mil','PB3565','"Ziploc" is reclosable.'),
  match('m35-packing-tape','S-423 Clear Packing Tape 2 in x 110 yd 1.9 mil hot melt','T902700','"2 in", "yd" spelled out.'),
  match('m36-self-seal-kraft','S-3145 Self Seal Kraft Bubble Mailers #2 8.5 x 12','B855SS','The catalog doesn\'t state the closure, so the line confirms one thing less.'),
  match('m37-labels-per-case','S-6900 Direct Thermal Labels 4x6, 3000 per case','THD114','The case count tells desktop (3,000) from fanfold (4,000); white is not stated.'),
  match('m38-kraft-roll-pound-sign','S-8513 Kraft Paper Roll 36 in. x 900 ft. 40#','KP3640','"40#" on a paper line is the basis weight.'),
  match('m39-bubble-loose','S-1792 1/2 in bubble wrap 12 in x 250 ft perforated','BW12S12P','Bubble size as a separate measure.'),
  match('m40-bag-6x4','S-1284 Reclosable Bags 6 x 4" 2 Mil','PB3600','6x4 is its own item (the catalog also sells 4x6).'),
  match('m41-gaylord-dw','S-14522 Double Wall Gaylord Box 48 x 40 x 36"','GAYLORDDW-BDL','Double wall, not the single or triple wall gaylord.'),
  match('m42-bin-box','S-4203 Bin Boxes 12 x 12 x 8"','BINJ12128','The bin box, not the plain box of the same size.'),
  match('m43-kraft-bubble-000','S-3157 #000 Kraft Bubble Mailers 4 x 8", 500/cs','B851SS','#000 kept apart from #00 and #0.'),
  match('m44-machine-cast','S-2965 Machine Stretch Film 20" x 5000\' 80 Gauge Cast','MSF20805C','Cast machine film, not the black blown one.'),
  match('m45-top-sheets','S-1748 Pallet Top Sheets 60" x 60\' 1.5 Mil Clear','PC91','Clear 1.5 mil, not black and not 1.25 mil.'),
  match('m46-tissue-white','S-5240 White Tissue Paper Sheets 20 x 30"','T2030J','White tissue, not kraft tissue.'),
  match('m47-strapping-hand','S-4604 Black Poly Strapping Hand 1/2" 600 lb','PS1231','Hand length, said after the noun.'),

  // Pack counts, labelled and */- tuples, metric sizes, negations kept, flute letters (round 3).
  match('m48-box-25pk','S-4128 Corrugated Boxes 12 x 10 x 8" 25 pk','12108-BDL','"25 pk" is the bundle of 25.'),
  match('m49-bags-1000ct','S-1287 Reclosable Bags 4 x 6" 2 Mil 1000 ct','PB3565','"1000 ct" is the case count.'),
  match('m50-kraft-100pk','S-3145 Kraft Bubble Mailers #2 8 1/2 x 12" 100 pk','B855SS','"100 pk" is the case of 100.'),
  match('m51-edge-80pk','S-1658 Edge Protectors 2 x 2 x 48" .160" 80 pk','EP2248160BX','Case of 80; .160" read as inches against the catalog\'s unitless .160 (storage).'),
  match('m52-box-lwh','S-4128 Corrugated Boxes 12" L x 10" W x 8" H, 32 ECT','12108-BDL','Labelled in the catalog\'s order.'),
  match('m53-box-wld','S-4128 Corrugated Boxes 10 in. W x 12 in. L x 8 in. D','12108-BDL','Labels reorder W x L x D to 12x10x8.'),
  match('m54-mailer-lwh','S-4247 White Corrugated Mailers 12 1/4" L x 9 1/4" W x 4" H','M1294','Fractions with labels.'),
  match('m55-box-star','S-4128 Corrugated Boxes 12*10*8 32 ECT','12108-BDL','"*" separates a tuple.'),
  match('m56-box-hyphen','S-4128 Corrugated Boxes 12-10-8 200# test','12108-BDL','A three-part hyphen is a tuple.'),
  match('m57-kraft-roll-metric','S-8513 Kraft Paper Roll 914 mm x 274 m 40 lb','KP3640','914 mm is 36", 274 m is 899 ft (within 0.5%).'),
  match('m58-stretch-metric','S-2963 Cast Hand Stretch Film 457 mm x 457 m 80 Gauge Clear','SF188CAST','457 mm is 18", 457 m is 1,499 ft.'),
  match('m59-kraft-tape-mm','S-7700 Kraft Tape 70 mm x 450 ft','T9077000','Millimetres against the catalog\'s "70MM".'),
  match('m60-strapping-mm','S-4604 Black Poly Strapping Hand Length 12.7 mm 600 lb','PS1231','12.7 mm is the catalog\'s unitless 0.5 (inches for strapping).'),
  match('m61-bags-not-printed','S-1287 Reclosable Bags 4 x 6" 2 Mil, Not Printed','PB3565','A negation the item keeps adds nothing.'),
  match('m62-hd-c-flute','S-4190 Heavy Duty Boxes 24 x 18 x 12" C Flute','HD241812DW-BDL','The flute letter is read, not dropped.'),

  // ---- Must not match: wrong size -----------------------------------------------------------------
  noMatch('n01-box-permuted','S-4129 12 x 8 x 10" Corrugated Boxes 200 lb test 25/bundle','wrong_size','lenient','12x8x10 is not the 12x10x8 BOXT sells: dimensions are positional.'),
  noMatch('n02-box-12x10x7','S-4127 12 x 10 x 7" Corrugated Boxes 200 lb test','wrong_size','lenient','BOXT has 12x10x6 and 12x10x8, not 12x10x7.'),
  noMatch('n03-box-quarter','S-4136 12 1/4 x 9 1/4 x 8" Corrugated Boxes','wrong_size','lenient','12.25x9.25x9 and 12x10x8 exist; 12.25x9.25x8 does not.'),
  noMatch('n04-mailer-12x9x4','S-4246 White Corrugated Mailers 12 x 9 x 4"','wrong_size','lenient','BOXT\'s mailer is 12.25x9.25x4.'),
  noMatch('n05-kraft-bubble-2-short','S-3144 Kraft Bubble Mailers #2 8 1/2 x 11"','wrong_size','lenient','BOXT\'s kraft #2 is 8.5x12.'),
  noMatch('n06-tape-55yd','S-12458 Industrial Tape 2" x 55 yds 1.9 Mil Clear','wrong_size','lenient','BOXT hand tape is 110 yd.'),
  noMatch('n07-kraft-roll-30','S-8512 Kraft Paper Roll 30" x 1200\' 30 lb','wrong_size','lenient','BOXT rolls are 12, 24, 36 and 48" wide.'),
  noMatch('n08-edge-42','S-1657 Edge Protectors 2 x 2 x 42"','wrong_size','lenient','BOXT has 40" and 48", not 42".'),
  noMatch('n09-bag-4x5.5','S-1290 Reclosable Bags 4 x 5 1/2" 2 Mil','wrong_size','lenient','4x5 and 4x6 exist; 4x5.5 does not.'),

  // ---- Must not match: wrong material or colour ---------------------------------------------------
  noMatch('n10-box-white-12x10x8','S-1825 White Corrugated Boxes 12 x 10 x 8" 32 ECT','wrong_material','lenient','BOXT\'s 12x10x8 is kraft only.'),
  noMatch('n11-mailer-kraft','S-4248 Kraft Corrugated Mailers 12 1/4 x 9 1/4 x 4"','wrong_material','lenient','BOXT\'s mailer of that size is white.'),
  noMatch('n12-tape-tan','S-1779 Tan Carton Sealing Tape 2" x 110 yds 2.0 Mil','wrong_material','lenient','BOXT tape is clear.'),
  noMatch('n13-bag-open-top','S-1294 Open Top Poly Bags 4 x 6" 2 Mil 1000/case','wrong_material','lenient','Open-top bags are not reclosable bags.'),
  noMatch('n14-tyvek','S-1601 Tyvek Envelopes 10 x 13"','wrong_material','lenient','The 10x13 flat poly mailer is poly, not Tyvek.'),
  noMatch('n15-foam-pouch','S-5004 Foam Pouches 6 x 9"','wrong_material','lenient','BOXT\'s 6x9 pouch is a bubble pouch.'),
  noMatch('n16-tissue-kraft-18x24','S-5233 Kraft Tissue Paper 18 x 24"','wrong_material','lenient','BOXT\'s 18x24 tissue is white.'),

  noMatch('n42-bubble-mailer-unspecified','S-3147 Bubble Mailers #2 8 1/2 x 12"','wrong_material','strict','Kraft or poly #2: the line doesn\'t say, and both are sold in this size.'),
  noMatch('n43-bag-white-block','S-1288 Reclosable Bags 6 x 4" 2 Mil White Block 1000/case','wrong_material','lenient','White write-on block bags; BOXT\'s are clear.'),

  // ---- Must not match: wrong pack quantity --------------------------------------------------------
  noMatch('n17-bag-500','S-1287 Reclosable Bags 4 x 6" 2 Mil 500/case','wrong_pack','lenient','BOXT sells this bag in cases of 1,000: quantities would be off by 2x.'),
  noMatch('n18-box-20-bundle','S-4128 12 x 10 x 8" Corrugated Boxes 200 lb test 20/bundle','wrong_pack','lenient','BOXT bundles 25.'),
  noMatch('n19-kraft-bubble-25','S-3145 Kraft Bubble Mailers #2 8 1/2 x 12" 25/case','wrong_pack','lenient','BOXT case is 100.'),
  noMatch('n20-tape-6-rolls','S-423 Industrial Tape 2" x 110 yds 1.9 Mil Clear Hot Melt 6 rolls/case','wrong_pack','lenient','BOXT case is 36 rolls.'),
  noMatch('n21-poly-mailer-500','S-7234 Flat Poly Mailers #4 10 x 13" 500/case','wrong_pack','lenient','BOXT case is 1,000.'),

  // ---- Must not match: wrong spec ------------------------------------------------------------------
  noMatch('n22-box-44ect','S-4128 12 x 10 x 8" Corrugated Boxes 44 ECT','wrong_spec','lenient','BOXT\'s is 32 ECT.'),
  noMatch('n23-box-275','S-4130 12 x 10 x 8" Corrugated Boxes 275 lb test','wrong_spec','lenient','275 lb test is the 44 ECT class, not 32 ECT.'),
  noMatch('n24-box-double-wall','S-4131 12 x 10 x 8" Double Wall Corrugated Boxes','wrong_spec','lenient','BOXT\'s 12x10x8 is single wall.'),
  noMatch('n25-bag-5mil','S-1310 Reclosable Bags 4 x 6" 5 Mil','wrong_spec','lenient','4x6 comes in 2, 3, 4, 6 and 8 mil.'),
  noMatch('n26-tape-2mil-hotmelt','S-424 Uline Industrial Tape 2" x 110 yds 2.0 Mil Clear Hot Melt','wrong_spec','lenient','Hot melt comes in 1.9 and 2.5 mil; the 2.0 mil tape is acrylic.'),
  noMatch('n27-stretch-60ga','S-2961 Cast Hand Stretch Film 18" x 1500\' 60 Gauge','wrong_spec','lenient','Cast 18x1500 comes in 70 and 80 gauge.'),
  noMatch('n28-kraft-roll-50lb','S-8514 Kraft Paper Roll 36" x 900\' 50 lb','wrong_spec','lenient','The 36x900 roll is 40 lb.'),
  noMatch('n29-labels-tt','S-6901 Thermal Transfer Labels 4 x 6" White','wrong_spec','lenient','BOXT labels are direct thermal.'),
  noMatch('n30-bubble-3-16','S-1790 Bubble Wrap Roll 3/16" x 12" x 250\' Perforated','wrong_spec','lenient','BOXT\'s 12x250 roll is 1/2" bubble.'),
  noMatch('n31-newsprint-30lb','S-3609 Newsprint Sheets 24 x 36" 30 lb','wrong_spec','lenient','24x36 newsprint is 10, 20, 25 or 50 lb; the 30 lb sheet is kraft.'),

  noMatch('n40-labels-unspecified','S-6902 Direct Thermal Labels 4 x 6"','wrong_spec','lenient','Desktop roll or fanfold: the line doesn\'t state the spec that tells them apart, so either could be wrong.'),
  noMatch('n41-strapping-unspecified','S-4600 Black Poly Strapping 1/2" 600 lb','wrong_spec','lenient','Hand or machine length: the line doesn\'t say, so either could be wrong.'),

  noMatch('n44-hd-275','S-4175 Heavy Duty Boxes 12 x 12 x 12" 275 lb test','wrong_spec','balanced','BOXT doesn\'t state the heavy duty box\'s rating, so 275 lb test can\'t be confirmed (two unconfirmed details: Lenient admits it).'),
  noMatch('n45-stretch-unspecified','S-2960 Stretch Film 18" x 1500\' 80 Gauge','wrong_spec','lenient','Cast or blown: the line doesn\'t say, and both are sold in this size and gauge.'),

  // ---- Must not match: not carried -----------------------------------------------------------------
  noMatch('n32-flat-poly-bags','S-12364 Industrial Poly Bags 4 x 6" 2 Mil 1000/case','not_carried','balanced','Flat open-top bags; BOXT\'s 4x6 2 mil bag is reclosable, which the line doesn\'t say.'),
  noMatch('n46-poly-bags-plain','S-1695 Poly Bags 4 x 6" 2 Mil 1000/case','not_carried','strict','Plain "poly bags" are flat open-top bags; the reclosable 4x6 confirms everything else the line says, so only the unconfirmed closure keeps it out.'),
  noMatch('n33-tubes','S-2577 Mailing Tubes 2 x 24"','not_carried','lenient','BOXT sells no tubes.'),
  noMatch('n34-packing-list-printed','S-3426 Packing List Envelopes "Packing List Enclosed" 4 1/2 x 5 1/2"','not_carried','balanced','Printed-face envelopes; BOXT\'s are clear face.'),
  noMatch('n35-hazmat-labels','S-2210 Hazmat Labels 4 x 4"','not_carried','lenient','BOXT\'s 4x4 labels are blank thermal labels.'),
  noMatch('n36-static-shielding','S-1630 Static Shielding Bags 4 x 6"','not_carried','lenient','No static shielding bags.'),
  noMatch('n37-dunnage','S-15226 Inflatable Dunnage Bags 36 x 72"','not_carried','lenient','No dunnage bags.'),
  noMatch('n38-plastic-pallets','S-7470 Plastic Pallets 48 x 40"','not_carried','lenient','BOXT pallets are wood.'),
  noMatch('n39-gloves','S-9393 Nitrile Gloves Large 100/box','not_carried','lenient','Not packaging.'),

  // ---- Must not match: qualifiers the item doesn't account for (verifier probes and variants) ----
  noMatch('n47-hd-box-12x10x8','S-4300 Heavy Duty Corrugated Boxes 12 x 10 x 8"','wrong_spec','strict','BOXT has no heavy duty 12x10x8; the plain box doesn\'t account for "heavy duty".'),
  noMatch('n48-hd-box-32ect','S-4301 Heavy Duty Corrugated Boxes 12 x 10 x 8" 32 ECT','wrong_spec','strict','"Heavy duty" is unaccounted for even when the ECT matches.'),
  noMatch('n49-insulated-box','S-4302 Insulated Corrugated Boxes 12 x 10 x 8"','not_carried','strict','No insulated shippers.'),
  noMatch('n50-insulated-mailer','S-3160 Insulated Bubble Mailers #2 8 1/2 x 12" Kraft','not_carried','strict','The kraft #2 bubble mailer is not insulated.'),
  noMatch('n51-antistatic-bubble','S-1795 Anti-Static Bubble Roll 1/2" x 12" x 250\' Perforated','wrong_material','strict','BOXT\'s 1/2" bubble roll is not anti-static.'),
  noMatch('n52-antistatic-bags','S-1291 Anti-Static Reclosable Bags 4 x 6" 2 Mil','wrong_material','strict','BOXT\'s reclosable bags are not anti-static.'),
  noMatch('n53-hd-bags','S-1292 Heavy Duty Reclosable Bags 4 x 6" 2 Mil','wrong_spec','strict','"Heavy duty" bags at 2 mil: the item doesn\'t account for it.'),
  noMatch('n54-hd-poly-mailer','S-7240 Flat Poly Mailers #4 10 x 13" Heavy Duty','wrong_spec','strict','BOXT\'s #4 mailer is not sold as heavy duty.'),
  noMatch('n55-printed-box','S-4303 Printed Corrugated Boxes 12 x 10 x 8" 32 ECT','not_carried','strict','No printed boxes.'),
  noMatch('n56-telescoping','S-4304 Telescoping Boxes 12 x 10 x 8" 32 ECT','not_carried','strict','Telescoping boxes are a different style from RSC.'),
  noMatch('n57-used-box','S-4305 Corrugated Boxes 12x10x8 Used','wrong_spec','strict','Used boxes; BOXT sells new.'),
  noMatch('n58-waterproof-box','S-4306 Waterproof Corrugated Boxes 12 x 10 x 8"','wrong_material','strict','No waterproof boxes.'),
  noMatch('n59-octagon-gaylord','S-14530 Single Wall Gaylord 48 x 40 x 48" Octagon','not_carried','strict','BOXT\'s gaylords are rectangular.'),
  noMatch('n60-pallets-new','S-7471 Heat Treated Pallets 48 x 40" New','wrong_spec','lenient','New pallets; BOXT\'s are recycled or used.'),
  noMatch('n61-pallets-new-wood','S-7472 New Heat Treated Wood Pallets 48 x 40"','wrong_spec','lenient','New pallets; BOXT\'s are recycled or used.'),
  noMatch('n62-white-mailer-self-seal','S-3161 White Bubble Mailers #2 8 1/2 x 12" Self-Seal','wrong_material','strict','White self-seal: neither listed #2 mailer says white or self-seal.'),
  noMatch('n63-tamper-evident','S-3162 Kraft Bubble Mailers #2 8 1/2 x 12" Tamper-Evident','not_carried','strict','No tamper-evident mailers.'),
  noMatch('n64-biodegradable','S-7241 Biodegradable Poly Mailers #4 10 x 13"','wrong_material','strict','BOXT\'s poly mailers are not biodegradable.'),
  noMatch('n65-compostable','S-7242 Compostable Mailers 10 x 13"','wrong_material','strict','No compostable mailers.'),
  noMatch('n66-recycled-content','S-8515 Kraft Paper Roll 36" x 900\' 40 lb Recycled Content','wrong_spec','strict','The catalog doesn\'t state recycled content for this roll.'),
  noMatch('n67-fda-bags','S-1293 FDA Approved Reclosable Bags 4 x 6" 2 Mil','wrong_spec','strict','The catalog doesn\'t state FDA compliance.'),
  noMatch('n68-food-grade','S-1296 Food Grade Poly Bags 4 x 6" 2 Mil','wrong_spec','strict','Not stated as food grade; also not stated reclosable.'),
  noMatch('n69-conductive','S-1631 Conductive Bags 4 x 6"','not_carried','strict','No conductive bags.'),
  noMatch('n70-vci','S-1632 VCI Poly Bags 6 x 9" 4 Mil','not_carried','strict','No VCI (corrosion inhibiting) bags.'),
  noMatch('n71-un-rated','S-4307 UN Rated Corrugated Boxes 12 x 10 x 8"','not_carried','strict','No UN rated (hazmat) boxes.'),
  noMatch('n72-hazmat-box','S-4308 Hazmat Boxes 12 x 12 x 12" 32 ECT','not_carried','strict','No hazmat boxes.'),
  noMatch('n73-custom-printed','S-7243 Custom Printed Poly Mailers #4 10 x 13"','not_carried','strict','No custom printing.'),
  noMatch('n74-wax-coated','S-4309 Wax Coated Corrugated Boxes 12 x 10 x 8"','wrong_material','strict','No wax coated boxes.'),
  noMatch('n75-moisture-resistant','S-8516 Moisture Resistant Kraft Paper Roll 36" x 900\' 40 lb','wrong_material','strict','Not stated as moisture resistant.'),
  noMatch('n76-economy-box','S-4310 Economy Corrugated Boxes 12 x 10 x 8"','wrong_spec','strict','Economy grade is a different (lighter) board.'),

  // ---- Must not match: round 3 classes (verifier probes and variants) ----
  noMatch('p01-box-10pk','S-4128 Corrugated Boxes 12 x 10 x 8" (10 pk)','wrong_pack','lenient','BOXT bundles 25; "10" is a pack count, never a dimension.'),
  noMatch('p02-box-ect-10pk','S-4128 Corrugated Boxes 12 x 10 x 8" 32 ECT 10 pk','wrong_pack','lenient','Bundle of 25, not 10.'),
  noMatch('p03-bags-6pk','S-1300 Reclosable Bags 6 x 9" 4 Mil 6 pk','wrong_pack','lenient','Case of 1,000, not 6.'),
  noMatch('p04-kraft-12pk','S-3145 Kraft Bubble Mailers #2 8 1/2 x 12" 12 pk','wrong_pack','lenient','Case of 100, not 12.'),
  noMatch('p05-edge-2pk','S-1658 Edge Protectors 2 x 2 x 48" .160" 2 pk','wrong_pack','lenient','Case of 80, not 2.'),
  noMatch('p06-poly-bubble-50pack','S-3216 Poly Bubble Mailers #0 6 1/2 x 10" 50-pack','wrong_pack','lenient','Case of 250, not 50.'),
  noMatch('p07-bags-pk-of-100','S-1287 Reclosable Bags 4 x 6" 2 Mil pk of 100','wrong_pack','lenient','Case of 1,000, not 100.'),
  noMatch('p08-kraft-roll-2pk','S-8513 Kraft Paper Roll 36" x 900\' 40 lb 2 pk','wrong_pack','lenient','Sold by the roll, not in twos.'),
  noMatch('d01-box-lwh-order','S-4129 Corrugated Boxes 12 in. L x 8 in. W x 10 in. H, 32 ECT','wrong_size','lenient','12 L x 8 W x 10 H is 12x8x10, not the 12x10x8 BOXT sells.'),
  noMatch('d02-box-star-order','S-4129 Corrugated Boxes 12*8*10 32 ECT','wrong_size','lenient','12x8x10 written with "*".'),
  noMatch('d03-box-hyphen-order','S-4129 Corrugated Boxes 12-8-10 200# test','wrong_size','lenient','12x8x10 written with hyphens.'),
  noMatch('d04-box-wlh-order','S-4129 Corrugated Boxes 8" W x 12" L x 10" H','wrong_size','lenient','Labels make it 12x8x10.'),
  noMatch('d05-box-words-order','S-4129 Corrugated Boxes 12" long x 8" wide x 10" high','wrong_size','lenient','Word labels make it 12x8x10.'),
  noMatch('d06-mailer-swapped','S-4249 White Corrugated Mailers 9 1/4 x 12 1/4 x 4"','wrong_size','lenient','9.25x12.25x4 is not the 12.25x9.25x4 mailer.'),
  noMatch('s01-hd-b-flute','S-4190 Heavy Duty Boxes 24 x 18 x 12" B Flute','wrong_spec','balanced','BOXT\'s 24x18x12 heavy duty box is C flute (the plain 24x18x12 has two details unconfirmed: Lenient admits it).'),
  noMatch('s02-hd-e-flute','S-4191 Heavy Duty Boxes 24 x 18 x 12" E Flute','wrong_spec','balanced','C flute, not E (the plain box has two details unconfirmed: Lenient admits it).'),
  noMatch('s03-box-b-flute','S-4128 Corrugated Boxes 12 x 10 x 8" B Flute','wrong_spec','strict','The plain box doesn\'t state its flute.'),
  noMatch('s04-box-grade-b','S-4128 Corrugated Boxes 12 x 10 x 8" Grade B','not_carried','strict','"Grade B" (seconds) is not a BOXT item; the single letter is kept.'),
  noMatch('c01-slider','S-1295 Slider Bags 4 x 6" 2 Mil','wrong_material','lenient','Slider closure, not press-to-close.'),
  noMatch('c02-slider-zipper','S-1297 Slider Zipper Bags 6 x 9" 4 Mil','wrong_material','balanced','Slider, not press-to-close (the 6x9 flat poly mailer has two details unconfirmed: Lenient admits it).'),
  noMatch('c03-tuck-flap','S-3163 Kraft Bubble Mailers #2 8 1/2 x 12" Tuck Flap','wrong_material','strict','The catalog doesn\'t state a tuck flap.'),
  noMatch('c04-string-button','S-7244 String and Button Envelopes 10 x 13"','not_carried','strict','No string-and-button envelopes.'),
  noMatch('g01-no-zipper','S-1695 Poly Bags 4 x 6" 2 Mil, No Zipper','wrong_material','lenient','BOXT\'s 4x6 2 mil bag has a zipper.'),
  noMatch('g02-wo-zipper','S-1695 Poly Bags 4 x 6" 2 Mil w/o Zipper','wrong_material','lenient','"w/o" is without.'),
  noMatch('g03-kraft-no-bubble','S-3170 Kraft Mailers #2 8 1/2 x 12" No Bubble','wrong_material','lenient','The kraft #2 mailer is a bubble mailer.'),
  noMatch('g04-kraft-5-no-bubble','S-3171 Kraft Mailers #5 10 1/2 x 16" No Bubble','wrong_material','lenient','Bubble mailer.'),
  noMatch('g05-poly-no-bubble','S-3172 Poly Mailers #2 8 1/2 x 12" No Bubble','wrong_material','lenient','Bubble mailer.'),
  noMatch('g06-no-warning','S-1640 Bags 10 x 12" 1.5 Mil, No Suffocation Warning','wrong_material','lenient','BOXT\'s 10x12 1.5 mil bag carries the warning.'),
  noMatch('g07-without-warning','S-1641 Bags 4 x 6" 1.5 Mil without warning','wrong_material','lenient','Warning print.'),
  noMatch('g08-non-clear-cover','S-1749 Pallet Covers 48 x 42 x 48" 2 Mil, Non-Clear','wrong_material','lenient','BOXT\'s cover is clear.'),
  noMatch('g09-non-hot-melt','S-424 Tape 2" x 110 yds 1.9 Mil, Non-Hot Melt','wrong_material','lenient','The 1.9 mil 2" tape is hot melt.'),
  noMatch('u01-strap-cm','S-4605 Poly Strapping Hand Length 0.5 cm 600 lb Black','wrong_size','lenient','0.5 cm is not 0.5".'),
  noMatch('u02-kraft-roll-cm','S-8517 Kraft Paper Roll 36 cm x 900 ft 40 lb','wrong_size','lenient','36 cm is about 14", not 36".'),
  noMatch('u03-edge-mm','S-1659 Edge Protectors 2 x 2 x 48" .160 mm','wrong_size','lenient','.160 mm is not .160".'),
  noMatch('u04-strap-half-cm','S-4606 Black Poly Strapping Hand Length 1/2 cm 600 lb','wrong_size','lenient','1/2 cm is not 1/2".'),
  noMatch('b01-bare-19x24','S-9001 19x24','no_product_type','lenient','A bare size names no product.'),
  noMatch('b02-bare-7.5x10.5','S-9002 7.5x10.5','no_product_type','lenient','A bare size names no product.'),
  noMatch('b03-bare-20x6500','S-9003 20x6500','no_product_type','lenient','A bare size names no product.'),
  noMatch('b04-bare-48x250','S-9004 48x250','no_product_type','lenient','A bare size names no product.'),
  noMatch('b05-bare-24x18','S-9005 24x18','no_product_type','lenient','A bare size names no product.'),
  noMatch('b06-bare-12x10x8','S-9006 12 x 10 x 8"','no_product_type','lenient','A bare size names no product, however well it fits a box.'),
  noMatch('b07-bare-4x6-mil','S-9007 4x6 2 mil 1000/case','no_product_type','lenient','Size, mil and case count, but no product.'),
  noMatch('b08-bare-number-size','S-9008 #2 8 1/2 x 12"','no_product_type','lenient','A mailer number and size, but no product.'),
];

/** Tags a case written for B3b to attack the total-accounting rules (or to check they keep realistic lines). */
const mine=(c:EvalCase):EvalCase=>({...c,tags:['b3b']});

/**
 * B3b: lines written against the total-accounting design itself, in classes the verifiers' probes
 * did not cover: claims only a product family's keywords make, "with" adding a second product, pack
 * phrases counting another product, trade shorthand (1M), two walls, flutes, colours, materials or
 * cores, approximate and minimum ratings, prices, separators, units before or without numbers,
 * four-number sizes, sizes in words, inside dimensions and tolerances; and realistic lines that must
 * still match (pack counts, W x L bags, L x W x H boxes, en dashes and full-width marks).
 */
const B3B:readonly EvalCase[]=[
  mine(noMatch("b01-attack","Eco Padded Paper Mailers 12.5 x 18.25\"","wrong_spec","strict","\"Eco\" is only in the padded mailer family's keywords, not the item's description.")),
  mine(noMatch("b02-attack","Security Black Blown Stretch Wrap Hand Length 18\" x 1500' 80 Gauge","wrong_spec","strict","\"Security\" is only in the black wrap family's keywords.")),
  mine(noMatch("b03-attack","Custom Clear Poly Tubing 8\" x 1075' 4 Mil","wrong_spec","lenient","\"Custom\" is only in the tubing family's keywords.")),
  mine(noMatch("b04-attack","Premium White Corrugated Boxes 11.25 x 8.75 x 4\" 32 ECT","wrong_spec","strict","\"Premium\" is only in the white box family's keywords.")),
  mine(noMatch("b05-attack","Reinforced Heavy Duty Boxes 24 x 18 x 12\" C Flute","wrong_spec","strict","\"Reinforced\" is only in the heavy duty family's keywords.")),
  mine(noMatch("b06-attack","Packing Tape 2\" with Dispenser","ambiguous","lenient","\"with Dispenser\" adds a second product (the 2\" dispenser's description says both tape and dispenser).")),
  mine(noMatch("b07-attack","Corrugated Boxes 12 x 10 x 8\" with Lids","ambiguous","strict","\"with Lids\" adds a second product.")),
  mine(noMatch("b08-attack","Kraft Tape 72mm x 450' with a Dispenser","ambiguous","balanced","\"with a Dispenser\" adds a second product.")),
  mine(noMatch("b09-attack","Reclosable Bags 4 x 6\" 2 Mil 1000 labels/case","wrong_pack","strict","A pack of labels on a line about bags.")),
  mine(noMatch("b10-attack","Kraft Bubble Mailers #2 8 1/2 x 12\" 100 bags/case","wrong_pack","strict","A pack of bags on a line about mailers.")),
  mine(noMatch("b11-attack","Reclosable Bags 4 x 6\" 2 Mil 1M/case","wrong_pack","lenient","\"1M/case\" is trade shorthand for 1,000; read as 1 metre it must not match.")),
  mine(noMatch("b12-attack","Reclosable Bags 4 x 6\" 2 Mil 1000/cs 2 cs","wrong_pack","balanced","\"2 cs\" is an order quantity the matcher cannot read.")),
  mine(noMatch("b13-attack","Corrugated Boxes 12 x 10 x 8\" Single Wall Double Wall","ambiguous","lenient","Two walls.")),
  mine(noMatch("b14-attack","Heavy Duty Boxes 24 x 18 x 12\" C Flute B Flute","ambiguous","lenient","Two flutes.")),
  mine(noMatch("b15-attack","Reclosable Bags 4 x 6\" 2 Mil Clear Blue","ambiguous","lenient","Two colours.")),
  mine(noMatch("b16-attack","Paper Poly Bubble Mailers #2 8 1/2 x 12\"","ambiguous","lenient","Two materials (paper and poly).")),
  mine(noMatch("b17-attack","Black Poly Strapping Machine Length 1/2\" x 9000' 300 lb 8x8 Core 9x8 Core","ambiguous","lenient","Two cores.")),
  mine(noMatch("b18-attack","Corrugated Boxes 12 x 10 x 8\" ~32 ECT","wrong_spec","strict","\"~32 ECT\": approximately.")),
  mine(noMatch("b19-attack","Corrugated Boxes 12 x 10 x 8\" 32 ECT @ $1.20","wrong_spec","strict","A price on the line (\"@ $1.20\").")),
  mine(noMatch("b20-attack","Corrugated Boxes 12 x 10 x 8\" min. 32 ECT","wrong_spec","strict","\"min. 32 ECT\": a minimum, not a rating.")),
  mine(noMatch("b21-attack","Corrugated Boxes 12 x 10 x 8\" 32 ECT (or equivalent)","wrong_spec","balanced","\"or equivalent\".")),
  mine(noMatch("b22-attack","Kraft Paper Roll 36\" x 900' 40-50 lb","ambiguous","lenient","A weight range.")),
  mine(noMatch("b23-attack","Reclosable Bags 4 x 6\" 2 Mil | Clear","wrong_spec","strict","A \"|\" separator nothing reads.")),
  mine(noMatch("b24-attack","Corrugated Boxes 12 x 10 x 8\" ECT","wrong_spec","strict","\"ECT\" with no number.")),
  mine(noMatch("b25-attack","Reclosable Bags 4 x 6\" Mil 2","wrong_spec","lenient","\"Mil 2\": the unit before its number is not read.")),
  mine(noMatch("b26-attack","Corrugated Boxes 12 x 10 x 8 x 25","wrong_size","lenient","A four-number size.")),
  mine(noMatch("b27-attack","Corrugated Boxes Twelve by Ten by Eight","wrong_size","lenient","Sizes in words.")),
  mine(noMatch("b28-attack","Corrugated Boxes 12 x 10 x 8\" Tape","ambiguous","strict","Two products (boxes, tape) with no joining word.")),
  mine(noMatch("b29-attack","Kraft Bubble Mailer Envelopes #2 8 1/2 x 12\"","ambiguous","strict","\"Envelopes\" is not in the mailer's description or keywords.")),
  mine(noMatch("b30-attack","Corrugated Boxes 12 x 10 x 8\" ID","wrong_size","strict","\"ID\": inside dimensions.")),
  mine(noMatch("b31-attack","Reclosable Bags 4 x 6\" Less Than 2 Mil","wrong_spec","balanced","\"Less than 2 mil\".")),
  mine(noMatch("b32-attack","Corrugated Boxes 12\" L x 10\" L x 8\" H","wrong_size","strict","The L label used twice.")),
  mine(noMatch("b33-attack","Corrugated Boxes 12 x 10 x 8\" +/- 1/8\"","wrong_size","lenient","A tolerance (\"+/- 1/8\\\"\").")),
  mine(noMatch("b34-attack","Kraft Paper Roll 36\" x 900' 40 lb 2 rolls","wrong_pack","strict","\"2 rolls\" is an order quantity.")),
  mine(noMatch("b35-attack","Corrugated Boxes 12 x 10 x 8\" 32 ECT 50 lb","wrong_spec","strict","A weight on a box line.")),
  mine(match("a01-must","Corrugated Shipping Boxes 10 x 10 x 10\" 32 ECT, 25 per bundle","101010-BDL","Realistic line; every part read and confirmed.")),
  mine(match("a02-must","Reclosable Poly Bags 5 x 8\" 4 mil, 1,000/case","PB3720","Realistic line; every part read and confirmed.")),
  mine(match("a03-must","Clear Hot Melt Packing Tape 2\" x 110 yd 1.9 mil, 36 rolls per case","T902700","Realistic line; every part read and confirmed.")),
  mine(match("a04-must","#6 Kraft Bubble Mailers 12 1/2 x 19\", 50/case","B859SS","Realistic line; every part read and confirmed.")),
  mine(match("a05-must","Kraft Paper Roll 12\" x 1200' 30 lb","KP1230","Realistic line; every part read and confirmed.")),
  mine(match("a06-must","Direct Thermal Desktop Labels 2 x 2\" White, 8,820/case","THD202","Realistic line; every part read and confirmed.")),
  mine(match("a07-must","Kraft Tape 70 mm x 450', 10 rolls/case","T9077000","Realistic line; every part read and confirmed.")),
  mine(match("a08-must","Clear Cast Stretch Wrap 18\" x 1500' 80 Gauge Hand Length, 4 rolls/case","SF188CAST","Clear stated: the red cast wrap of the same size is another item.")),
  mine(match("a09-must","Edge Protectors 2\" x 2\" x 24\" .160\", 160/case","EP2224160BX","Realistic line; every part read and confirmed.")),
  mine(match("a10-must","Corrugated Boxes 24\" L x 14\" W x 10\" H, 32 ECT","241410-BDL","Realistic line; every part read and confirmed.")),
  mine(match("a11-must","Reclosable Bags 9\" W x 6\" L 2 Mil","PB3604","Bags are listed W x L: 9\" wide x 6\" long is the 9x6 bag.")),
  mine(match("a12-must","Clear Face Document Envelopes 12 x 15\", 500/case","PL527","Realistic line; every part read and confirmed.")),
  mine(match("a13-must","Newsprint Sheets 18 x 24\" 50 lb, 1,600/case","NP1830","Realistic line; every part read and confirmed.")),
  mine(match("a14-must","Black Poly Strapping Hand Length 1/2\" 500 lb","PS1226","Realistic line; every part read and confirmed.")),
  mine(match("a15-must","Blown Stretch Wrap Machine Length 20\" x 6000' 80 Gauge","MSF2080B","Realistic line; every part read and confirmed.")),
  mine(match("a16-must","Heavy Duty Double Wall Boxes 16 x 16 x 16\" BC Flute","HD161616DW-BDL","Realistic line; every part read and confirmed.")),
  mine(match("a17-must","Corrugated Boxes – 12 × 10 × 8″ – 32 ECT","12108-BDL","En dashes as separators, × and ″.")),
  mine(match("a18-must","Reclosable Bags 4\" x 6\" x 2 mil","PB3565","The \"x\" before a film thickness joins it to the size.")),
  // Fix round 1 variants: the item's head noun and description words, exact sizes, fractions, input bounds.
  mine(noMatch("v01-attack","Double Wall Gaylord 48x40\"","wrong_spec","strict","A 48x40 gaylord line with no height is not the Gaylord Lid.")),
  mine(noMatch("v02-attack","Workhorse Hand Tape 3\"","wrong_spec","strict","Names tape, not the Workhorse dispenser.")),
  mine(noMatch("v03-attack","Bubble Dispenser 24\" x 100'","wrong_spec","strict","The item is a dispenser pack; \"Packs\" is unaccounted.")),
  mine(noMatch("v04-attack","Flat Paper 9 x 11.5\" White","wrong_spec","strict","Names paper, not the flat paper mailers.")),
  mine(noMatch("v05-attack","Heat Treated 48 x 40\" #1 Recycled","no_product_type","lenient","Names no product: the pallet is not said.")),
  mine(noMatch("v06-attack","Corrugated Bin 12 x 12 x 8\"","wrong_spec","strict","Names a bin, not the bin box.")),
  mine(noMatch("v07-attack","Kraft Paper 36\" x 900' 40 lb","wrong_spec","strict","Kraft paper: rolls or sheets, the line doesn't name which (the item is a roll).")),
  mine(noMatch("v08-attack","Wardrobe Box 24 x 24 x 40\"","not_carried","strict","The item is a wardrobe box combo pack.")),
  mine(noMatch("v09-attack","Corrugated Boxes 12 x 10 x 7.98\"","wrong_size","lenient","7.98\" is not 8\".")),
  mine(noMatch("v10-attack","Kraft Paper Roll 36\" x 901' 40 lb","wrong_size","lenient","901' is not 900'.")),
  mine(noMatch("v11-attack","Reclosable Poly Bags 4.01 x 6\" 2 Mil","wrong_size","lenient","4.01\" is not 4\".")),
  mine(noMatch("v12-attack","Cast Stretch Wrap Hand Length 18\" x 1505' 80 Gauge Clear","wrong_size","lenient","1505' is not 1500'.")),
  mine(noMatch("v13-attack","Reclosable Poly Bags 4\" x 6\" 51 micron","wrong_spec","lenient","51 micron is 2.008 mil, not 2 mil (0.4% off).")),
  mine(noMatch("v14-attack","Reclosable Bags 8/2 x 6\" 2 Mil","wrong_size","strict","8/2 is an improper fraction.")),
  mine(noMatch("v15-attack","Kraft Bubble Mailers #2 17/2 x 12\"","wrong_size","strict","17/2 is an improper fraction.")),
  mine(noMatch("v16-attack","Corrugated Boxes 12 x 10 x 8\" 0/0","wrong_size","strict","0/0 is not a number.")),
  mine(noMatch("v17-attack","Corrugated Boxes 1234567890123 12 x 10 x 8\"","wrong_spec","strict","A 13-digit number is not read.")),
  mine(noMatch("v18-attack",`Corrugated Boxes 12 x 10 x 8" 32 ECT ${'kraft '.repeat(80)}`,"wrong_spec","strict","Over 500 characters: not read.")),
  mine(match("v19-must","Expandable Foam Bags Extra Thick 18 x 24\"","IQRT60","Extra Thick stated, Bulk Pack not: the single-case item.")),
  mine(match("v20-must","Expandable Foam Bags 22 x 27\"","IQRT80","Neither Extra Thick nor Bulk Pack: the plain item.")),
  mine(match("v21-must","Clear Top Sheeting 60\" x 60' 1.25 mil","PC99","\"Central Folded\" is on every top sheeting: not defining.")),
  mine(match("v22-must","Corrugated Boxes 30.5 x 25.4 x 20.3 cm","12108-BDL","Centimetres round 12x10x8\" within 0.2%.")),
  mine(match("v23-must","Kraft Paper Roll 915 mm x 274 m 40 lb","KP3640","915 mm and 274 m are 36\" and 900' within 0.2%.")),
];

export const CASES:readonly EvalCase[]=[...HANDWRITTEN,...HELDOUT_CASES,...B3B];
