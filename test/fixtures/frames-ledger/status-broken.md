# Broken ledger fixture

A deliberately broken copy of the "Lane U frame ledger" in `docs/plans/status.md` for `src/frames-ledger.test.ts`: C_QOB4 and C_QOB9 are missing, C_ZZ1 is not a canvas.json board, C_QOB1 is listed twice, C_QOB2 is deferred with no reason, C_QOB5 has a state the ledger does not allow, C_QOB6 has no task and C_QOB7 no state.

### Lane U frame ledger
Every board in `canvas.json` (89). State is PASS (frame spec diff with zero unexplained differences), deferred (with reason) or no-frame. The rail on every page frame is proven in U2.

Rail (every page frame's left edge): PASS in U2 (`e2e/frames-shell.spec.ts`) against C_QOBoard as the manager and C_RQBoard as a rep, scoped to the `aside`: every element and computed style, both directions (nothing missing, nothing added), 216px wide, sticky at the top at 100vh after scrolling a long page, the page area taking the rest of the width; every rep route renders in the shell. The frames' user names (Brian G., Brandi G.) are placeholders.

| Frame | Task | State |
|---|---|---|
| C_ZZ1 | U3 | PASS (a frame canvas.json does not index) |
| C_QOB3 | U2 | PASS (`e2e/frames-shell.spec.ts`, header controls and dropdown; rows are real data, Appendix G, worded in the frame's sentence per status, each one row tall) |
| C_QOB1 | U3 | PASS (`e2e/frames-quotes.spec.ts`; the five visible rows both ways; component level in U0) |
| C_QOB1 | U3 | PASS (listed twice) |
| C_QOB2 | U3 | deferred |
| C_QOB5 | U3 | FAIL (two differences) |
| C_QOB6 |  | PASS |
| C_QOB7 | U3 |  |
| C_QOB8 | U3 | PASS (`e2e/frames-quotes.spec.ts`; lifted and drop-target lanes; the order is the user's own) |
| C_QOBoard | U3 | PASS (`e2e/frames-quotes.spec.ts`; toolbar, lanes and every card shape both ways; counts, quotes and customers are real data, Appendix G; lanes grow from 236px, decision 51) |
| C_QOT1 | U3 | PASS (`e2e/frames-quotes.spec.ts`; date fields as C_QOB2) |
| C_QOT2 | U3 | PASS (`e2e/frames-quotes.spec.ts`; component level in U0) |
| C_QOT3 | U3 | PASS (`e2e/frames-quotes.spec.ts`) |
| C_QOT4 | U3 | PASS (`e2e/frames-quotes.spec.ts`) |
| C_QOT5 | U3 | PASS (`e2e/frames-quotes.spec.ts`) |
| C_QOT6 | U3 | PASS (`e2e/frames-quotes.spec.ts`; component level in U0) |
| C_QOT7 | U3 | PASS (`e2e/frames-quotes.spec.ts`; the frame's typed text is the real input's value; two seeded customers match "Basin" as two placeholders match "Wasat") |
| C_QOTable | U3 | PASS (`e2e/frames-quotes.spec.ts`; caution border #E8A8A0 where the table frames draw #F1BEB8, decision 54; header cells are positioned for the drop line, U0) |
| C_RQB1 | U3 | PASS (`e2e/frames-quotes.spec.ts`; Mara has one customer where the frame's rep has three placeholders) |
| C_RQB2 | U3 | PASS (`e2e/frames-quotes.spec.ts`; date fields as C_QOB2) |
| C_RQBoard | U3 | PASS (`e2e/frames-quotes.spec.ts`; Mara's one-line customer where the frame's placeholder wraps to two lines) |
| C_RQTable | U3 | PASS (`e2e/frames-quotes.spec.ts`; decision 54 as C_QOTable) |
| C_QE1 | U4 | PASS (`e2e/frames-quote-editor.spec.ts`; dates in the message and summary are real data, Appendix G; Cancel, Send quote and Preview PDF are real controls where the frame draws spans) |
| C_QE10 | U4 | PASS (`e2e/frames-quote-editor.spec.ts`; the paid date is real data, Appendix G; the pointer rests on Customer as drawn) |
| C_QE11 | U4 | PASS (`e2e/frames-quote-editor.spec.ts`; the saved time is the real time) |
| C_QE2 | U4 | PASS (`e2e/frames-quote-editor.spec.ts`) |
| C_QE3 | U4 | PASS (`e2e/frames-quote-editor.spec.ts`) |
| C_QE4 | U4 | PASS (`e2e/frames-quote-editor.spec.ts`; dates, times and the win rate are real data, Appendix G; Copy, Set freight by hand and Add note are buttons where the frame draws spans) |
| C_QE5 | U4 | PASS (`e2e/frames-quote-editor.spec.ts`) |
| C_QE6 | U4 | PASS (`e2e/frames-quote-editor.spec.ts`; the chat is Q-24817's seeded conversation, so three messages are longer than the frame's samples and wrap to more lines, Appendix G) |
| C_QE7 | U4 | PASS (`e2e/frames-quote-editor.spec.ts`; fixed widths Qty 60, Available, Cost, Unit price 118, Margin 78, Total 82 equal the frame's) |
| C_QE8 | U4 | PASS (`e2e/frames-quote-editor.spec.ts`; the results are the catalog's real matches for "1/2", the frame's three are samples, Appendix G) |
| C_QE9 | U4 | PASS (`e2e/frames-quote-editor.spec.ts`; last-paid date is real data, Appendix G; Use and Current are buttons where the frame draws spans) |
| C_QEBase | U4 | PASS (`e2e/frames-quote-editor.spec.ts`, both directions, icons counted; dates are real data, Appendix G; the strap line's stock-short note is decision 44's inline note, approved in decision 64. The one explained addition, decision 64: a quote that carries freight recovery shows a "Freight recovery N%" chip in the header, in the CONTRACT tag's look; Q-24817 carries none, checked on Q-24763) |
| C_CU1 | U5 | PASS (`e2e/frames-records.spec.ts`; Brandi and Eli picked as drawn; the seed's four reps pair with the frame's three by name, Brandi's count 2 for the sample 3, Appendix G) |
| C_CU2 | U5 | PASS (`e2e/frames-records.spec.ts`; chip "Rep: Brandi Gallegos, Eli Porter" literal; the frame's Canyon Ridge row is drawn as Brandi's, Mara Jensen's in the seed, so 4 customers for the sample 5) |
| C_CU3 | U5 | PASS (`e2e/frames-records.spec.ts`; Canyon Ridge's rep is Mara Jensen in the seed (the frame draws Brandi); the open quotes' requested days follow the clock, compared by place) |
| C_CUBase | U5 | PASS (`e2e/frames-records.spec.ts`; Canyon Ridge's rep is Mara Jensen in the seed; search 320px) |
| C_OR1 | U5 | PASS (`e2e/frames-records.spec.ts`; Delivery and SLC picked as drawn; Ordered from and to are native date fields; a fourth rep, Mara Jensen, in the seed) |
| C_OR2 | U5 | PASS (`e2e/frames-records.spec.ts`; side column 340px) |
| C_ORBase | U5 | PASS (`e2e/frames-records.spec.ts`; ten orders then "Show 13 more orders"; the seed links SO-51214 to Q-24806, which the frame's sample omits; customer names fit on one line at 1920) |
| C_RCU1 | U5 | PASS (`e2e/frames-records.spec.ts`; Mara's one customer for the frame rep's three, so Terms offers Net 30 only and Open balance to reads $40,000.00) |
| C_RCUBase | U5 | PASS (`e2e/frames-records.spec.ts`; Mara's book is Canyon Ridge with 18 of its quotes, the frame's rep has three customers) |
| C_ST1 | U5 | PASS (`e2e/frames-records.spec.ts`; Fasteners picked as drawn; category names are catalog data ("&", "/" where the frame writes "and"); List price to $121.00 for the sample $500.00) |
| C_ST2 | U5 | PASS (`e2e/frames-records.spec.ts`; side column 340px) |
| C_ST3 | U5 | PASS (`e2e/frames-records.spec.ts`; Brandi's own drafts Q-24817 and Q-24790 (decision 22) for the frame's three; quantity starts at 1; 580px, 120px from the top, centred) |
| C_STBase | U5 | PASS (`e2e/frames-records.spec.ts`; nine items then "Show 53 more items"; search 340px, Add to quote 108px in the 124px track) |
| C_AN1 | U6 | PASS (`e2e/frames-analytics.spec.ts`, frame laid out at 1920x1080, whole `main` both directions; numbers, dates and names are real data compared as the frame's sentence patterns (Appendix G); the same long page scrolled, rail sticky; data-length lists cut to the shorter side: chart ticks, categories, items) |
| C_AN2 | U6 | PASS (`e2e/frames-analytics.spec.ts`, frame laid out at 1920x1080, whole `main` both directions; numbers, dates and names are real data compared as the frame's sentence patterns (Appendix G); the Assigned rep names are the data's) |
| C_AN3 | U6 | PASS (`e2e/frames-analytics.spec.ts`, frame laid out at 1920x1080, whole `main` both directions; numbers, dates and names are real data compared as the frame's sentence patterns (Appendix G); nine weeks then "Show 17 more weeks") |
| C_AN4 | U6 | PASS (`e2e/frames-analytics.spec.ts`, frame laid out at 1920x1080, whole `main` both directions; numbers, dates and names are real data compared as the frame's sentence patterns (Appendix G); panel driven to the frame's state, two reps ticked and Rep; the seed's four reps against the frame's three placeholders, the fourth row cut; the frame's spans and div are buttons here with the same computed styles) |
| C_AN5 | U6 | PASS (`e2e/frames-analytics.spec.ts`, frame laid out at 1920x1080, whole `main` both directions; numbers, dates and names are real data compared as the frame's sentence patterns (Appendix G); scrolled) |
| C_AN6 | U6 | PASS (`e2e/frames-analytics.spec.ts`, frame laid out at 1920x1080, whole `main` both directions; numbers, dates and names are real data compared as the frame's sentence patterns (Appendix G); fixed column tracks and the 2280px minimum compared; counts link to their quotes and are compared as the frame's spans; count colours follow the frame's rule: green, gray at zero, red overdue) |
| C_AN7 | U6 | PASS (`e2e/frames-analytics.spec.ts`, frame laid out at 1920x1080, whole `main` both directions; numbers, dates and names are real data compared as the frame's sentence patterns (Appendix G); per-rep columns are the seed's four reps; one Other note on each side) |
| C_AN8 | U6 | PASS (`e2e/frames-analytics.spec.ts`, frame laid out at 1920x1080, whole `main` both directions; numbers, dates and names are real data compared as the frame's sentence patterns (Appendix G)) |
| C_ANBase | U6 | PASS (`e2e/frames-analytics.spec.ts`, frame laid out at 1920x1080, whole `main` both directions; numbers, dates and names are real data compared as the frame's sentence patterns (Appendix G); chart geometry compared: plot, columns, segments, gridline, labels, top tick; data-length lists cut to the shorter side) |
| C_RAN1 | U6 | PASS (`e2e/frames-analytics.spec.ts`, frame laid out at 1920x1080, whole `main` both directions; numbers, dates and names are real data compared as the frame's sentence patterns (Appendix G); Mara's four categories against the frame's six; Extra GP is "$0.00" in the values' colour since she has none, the rule checked against the frame's green sample) |
| C_RAN2 | U6 | PASS (`e2e/frames-analytics.spec.ts`, frame laid out at 1920x1080, whole `main` both directions; numbers, dates and names are real data compared as the frame's sentence patterns (Appendix G); the frame's spans and div are buttons here with the same computed styles) |
| C_RAN3 | U6 | PASS (`e2e/frames-analytics.spec.ts`, frame laid out at 1920x1080, whole `main` both directions; numbers, dates and names are real data compared as the frame's sentence patterns (Appendix G); the note names the customer) |
| C_RAN4 | U6 | PASS (`e2e/frames-analytics.spec.ts`, frame laid out at 1920x1080, whole `main` both directions; numbers, dates and names are real data compared as the frame's sentence patterns (Appendix G)) |
| C_RAN5 | U6 | PASS (`e2e/frames-analytics.spec.ts`, frame laid out at 1920x1080, whole `main` both directions; numbers, dates and names are real data compared as the frame's sentence patterns (Appendix G); Mara's customer has no chat questions, so the card reads "0 of 0" and "0% answered without a rep" in the frame's layout) |
| C_TR1 | U7 | PASS (`e2e/frames-teams.spec.ts`, frame laid out at 1920x1080, `main` and the dialog both directions, whole sentences compared; data moved toward the sample through the app's routes (Great Basin and Wasatch to Mara, Outside Sales renamed Field Sales); the frame's Brandi row is dropped (she is the manager and the card lists no managers), "3 reps" for "4 reps" and Nora's title Account Manager for Counter Sales (Appendix G); the three Active switches are buttons where the frame draws spans; Mara holds the frame's three customers and stands in Brandi's expanded row) |
| C_TR2 | U7 | PASS (`e2e/frames-teams.spec.ts`, frame laid out at 1920x1080, `main` and the dialog both directions, whole sentences compared; data moved toward the sample through the app's routes (Great Basin and Wasatch to Mara, Outside Sales renamed Field Sales); the frame's Brandi row is dropped (she is the manager and the card lists no managers), "3 reps" for "4 reps" and Nora's title Account Manager for Counter Sales (Appendix G); the three Active switches are buttons where the frame draws spans; Mara stands in Brandi's row; the new rep picked is Brandi, with no customers, for the frame's Mara) |
| C_TR3 | U7 | PASS (`e2e/frames-teams.spec.ts`, frame laid out at 1920x1080, `main` and the dialog both directions, whole sentences compared; data moved toward the sample through the app's routes (Great Basin and Wasatch to Mara, Outside Sales renamed Field Sales); the frame's Brandi row is dropped (she is the manager and the card lists no managers), "3 reps" for "4 reps" and Nora's title Account Manager for Counter Sales (Appendix G); the three Active switches are buttons where the frame draws spans; Mara stands in Brandi's row; the list opens 48px under the button at its width) |
| C_TR4 | U7 | PASS (`e2e/frames-teams.spec.ts`, frame laid out at 1920x1080, `main` and the dialog both directions, whole sentences compared; data moved toward the sample through the app's routes (Great Basin and Wasatch to Mara, Outside Sales renamed Field Sales); the frame's Brandi row is dropped (she is the manager and the card lists no managers), "3 reps" for "4 reps" and Nora's title Account Manager for Counter Sales (Appendix G); the three Active switches are buttons where the frame draws spans; Mara is the rep connecting, for the frame's Brandi; Utah Valley Electric's real open quotes for the sample 12) |
| C_TR5 | U7 | PASS (`e2e/frames-teams.spec.ts`, frame laid out at 1920x1080, `main` and the dialog both directions, whole sentences compared; data moved toward the sample through the app's routes (Canyon Ridge to Brandi, Outside Sales renamed Field Sales); the frame's Brandi row is dropped (she is the manager and the card lists no managers), "3 reps" for "4 reps" and Nora's title Account Manager for Counter Sales (Appendix G); the three Active switches are buttons where the frame draws spans) |
| C_TR6 | U7 | PASS (`e2e/frames-teams.spec.ts`, frame laid out at 1920x1080, `main` and the dialog both directions, whole sentences compared; data moved toward the sample through the app's routes (Canyon Ridge to Brandi, Outside Sales renamed Field Sales); the frame's Brandi row is dropped (she is the manager and the card lists no managers), "3 reps" for "4 reps" and Nora's title Account Manager for Counter Sales (Appendix G); the three Active switches are buttons where the frame draws spans; "Counter and Yard" typed and Nora ticked as drawn) |
| C_TR7 | U7 | PASS (`e2e/frames-teams.spec.ts`, frame laid out at 1920x1080, `main` and the dialog both directions, whole sentences compared; data moved toward the sample through the app's routes (Canyon Ridge to Brandi, Outside Sales renamed Field Sales); the frame's Brandi row is dropped (she is the manager and the card lists no managers), "3 reps" for "4 reps" and Nora's title Account Manager for Counter Sales (Appendix G); the three Active switches are buttons where the frame draws spans; Inside Sales picked as drawn) |
| C_TRBase | U7 | PASS (`e2e/frames-teams.spec.ts`, frame laid out at 1920x1080, `main` and the dialog both directions, whole sentences compared; data moved toward the sample through the app's routes (Canyon Ridge to Brandi, Outside Sales renamed Field Sales); the frame's Brandi row is dropped (she is the manager and the card lists no managers), "3 reps" for "4 reps" and Nora's title Account Manager for Counter Sales (Appendix G); the three Active switches are buttons where the frame draws spans) |
| C_S1 | U8 | PASS (`e2e/frames-settings.spec.ts`, its own flags-off server; frame laid out at 1920x1080, `main` both directions, whole sentences; the four switches are buttons where the frame draws spans; since U9 every C_S frame's tab bar takes the manager's Profile tab last, a copy of the frame's inactive tab (decision 69)) |
| C_S1a | U8 | PASS (`e2e/frames-settings.spec.ts`; the filter panel with Pricing set to Not shared, as drawn) |
| C_S1b | U8 | PASS (`e2e/frames-settings.spec.ts`; data moved toward the sample through the app's routes: Great Basin and Uinta with Pricing not shared, the frame's two rows; "2 of 6 customers" from real data) |
| C_S2 | U8 | PASS (`e2e/frames-settings.spec.ts`; the frame's organization floors set through `PUT /api/rep/settings/org-floors` and Eli's own margins through Eli's `PUT /api/rep/settings/floors`; category names are catalog data, "&" and "/" where the frame writes "and") |
| C_S3 | U8 | PASS (`e2e/frames-settings.spec.ts`; as C_S2 with the rep list open, the seed's four reps as drawn) |
| C_S4 | U8 | PASS (`e2e/frames-settings.spec.ts`, the flags off: the frame's Free delivery pricing, Recovery pool and Delivery cost model sections and its "FEATURE FLAG: HIDDEN" badges are taken out and must be absent from the app, decision 48) |
| C_S5 | U8 | PASS (`e2e/frames-settings.spec.ts`, its own flags-on server; free delivery turned on through the routes after the preview; the badges are markers, never drawn; the ramp's dates are today, +30 and +60 days where the frame samples Oct 10, 2026) |
| C_S6 | U8 | PASS (`e2e/frames-settings.spec.ts`, flags on; seeded two days before today so the fuel price reads "2 days old" as drawn; the blank Manual fuel price field compared style by style with the frame's empty box) |
| C_S7 | U8 | PASS (`e2e/frames-settings.spec.ts`, flags on; the dialog's place and backdrop compared; the table is placeholder data (Appendix G): real counts and dollars compared as tokens, the categories the last 90 days do not touch taken out of the frame, "Based on the last N delivery quotes." without the frame's "Sample figures." note; one row is a line shorter because the catalog name is) |
| C_S8 | U8 | PASS (`e2e/frames-settings.spec.ts`; Sent's amber "3 days" inside its "h" unit and the red conversions in their own 13px line, as the frame draws them) |
| C_RS1 | U9 | PASS (`e2e/frames-rep-settings.spec.ts` as Mara; the frame's organization floors set through the manager's `PUT /api/rep/settings/org-floors` and Mara's own margins through her `PUT /api/rep/settings/floors`; `main` both directions, whole sentences, and every box without text (bars, ticks, legend ticks, rows) by colour, size and left edge; category names are catalog data, "&" and "/" where the frame writes "and") |
| C_RS2 | U9 | PASS (`e2e/frames-rep-settings.spec.ts`; Mara's name, initials, phone and email where the frame samples Brandi's (placeholders, Appendix G); the field grid keeps the frame's own 760px. Also as the manager (decision 69): the frame's tab bar redrawn as hers, her four tabs in the frame's inactive tab style, then its active Profile; her seeded phone and email where the frame samples others) |
| C_RS3 | U9 | PASS (`e2e/frames-rep-settings.spec.ts`; as C_RS1 with 28.0 typed into Safety and PPE under its 30.0% floor: the red row, "Below the 30.0% organization floor. Pick 30.0% or higher." from the real floor, Save margins disabled and drawn grey) |
| C_RS4 | U9 | PASS (`e2e/frames-rep-settings.spec.ts`; the eight switches are buttons (role switch) where the frame draws spans, compared box by box with their knobs) |
| C_CVE0 | U10 | PASS (`e2e/frames-customer.spec.ts`; placeholders per Appendix G listed in the U10 PR) |
| C_CVL1 | U10 | PASS (`e2e/frames-customer.spec.ts`; placeholders per Appendix G listed in the U10 PR) |
| C_CVL2 | U10 | PASS (`e2e/frames-customer.spec.ts`; placeholders per Appendix G listed in the U10 PR) |
| C_CVL3 | U10 | PASS (`e2e/frames-customer.spec.ts`; placeholders per Appendix G listed in the U10 PR) |
| C_CVL4 | U10 | PASS (`e2e/frames-customer.spec.ts`; placeholders per Appendix G listed in the U10 PR) |
| C_CVL5 | U10 | PASS (`e2e/frames-customer.spec.ts`; placeholders per Appendix G listed in the U10 PR) |


## After the ledger

| C_QOB4 | U2 | PASS (under another heading, so it does not count) |
