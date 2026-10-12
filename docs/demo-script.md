# Demo script

Five acts, about ten minutes, in the order of v3 decision 38. `e2e/demo-script.spec.ts` walks the same steps; if the two disagree, fix both.

## Before you start

- Reset the demo: `npm run db:reset` (or `POST /api/test/reset` when the server runs with `QUERENT_E2E_RESET=1`). Every reset gives the same mix: the aging quotes and Mara's and Eli's books are dated from the reset time, so the amber, red and fresh quotes and the pool always look the same.
- Run in scripted LLM mode (`QUERENT_SCRIPTED=1`, or no `ANTHROPIC_API_KEY`) so the chat and the pop-up suggestions are deterministic. `QUERENT_SEED_DATE=2026-09-23` reproduces the mockup's dates for Wasatch's history; it does not move the demo book.
- Use two browser windows: one for Dana (customer), one for Herrick.

What the seed holds, besides Wasatch's twelve months of history and the sample quote Q-24817:

| Who | What |
|---|---|
| Brandi Gallegos (manager) | Wasatch: Q-24789 sent 4 days ago (Aging), Q-24790 changes requested 30 hours ago (Overdue), Q-24791 sent yesterday (fresh). Three accepted Canyon Ridge quotes she covered for Mara. |
| Mara Jensen (rep, Inside Sales) | Canyon Ridge Builders: fresh, Aging and Overdue drafts and sent quotes, a change request, 8 accepted deliveries, declines (Price too high, Other with a note, Need it sooner) and an expired quote. Two of her quotes were moved to Eli. |
| Eli Porter (rep, Outside Sales) | Utah Valley Electric and Weber Basin Fabricators: the same spread, 11 accepted deliveries, declines (Found other source, Wrong items, no reason) and two expired quotes. |
| The pool | 22 accepted delivery quotes from the last 90 days that carried freight recovery during an earlier pilot, so Pricing & delivery shows a computed pool rate (about 1.6%) next to the 3.0% starting rate. Free delivery pricing itself is off. |

## Act 1: Dana asks in chat and requests a quote

1. Open `/`: with no session it is the visitor box (ask anything: the answer is *Sign in to continue.*). Press **Sign in**, then choose **Wasatch Mechanical Contractors** (Dana Ortiz) in the chooser at `/demo`.
2. Ask: *Please quote 10 boxes of the 1/2 in grade 8 hex bolts and 6 boxes of cut-off wheels. We'll pick up at SLC.*
3. Querent asks *Type 1 or Type 27 cut-off wheels?* Answer *Type 1*. The item pop-up opens.
4. Below the cart, **Frequently bought together** shows at least two suggestions (the matching Grade 8 nut and washer, flap discs), each with a reason and no price. Add the hex nut: it joins the cart at qty 1.
5. Press **Request quote**. Querent answers *Sent to Brandi for review* with the new quote number (Q-24818 on a fresh reset).

## Act 2: Brandi opens it, reads the chat, sees what needs attention, and sends it

1. In the other window, open `/demo` and choose **Herrick Industrial Supply** (Brandi, manager). The chooser also offers **Mara Jensen** and **Eli Porter**, each labelled Rep with their team.
2. Brandi is the manager, so her Quotes board shows every rep's quotes, one lane per status. Press the red caution button at the top right of the page: the **Needs attention** dropdown lists her Q-24790 and Q-24817 marked **Overdue** and Q-24789 marked **Aging**, with the other reps' overdue and aging quotes, red first. It opens in place. In **Filter**, tick **Overdue** and **Aging** under Only show and press **Apply filters**: the board shows the same quotes.
3. Press the bell beside it: **Notifications** lists *Q-24818 requested by Dana Ortiz*. Open Q-24818 from it (or from its card in the Draft ready lane, then **Open quote**). In the Customer request box press **View full chat**: the drawer shows Dana's messages in bold and Querent's turns on one line each. Close it.
4. The hex nut line is tagged **Chat suggestion**. Press **Approve & send**, then **Send quote**, then **Send**. The quote reads *Sent*.

## Act 3: Dana declines a different quote

1. Back in Dana's window, open the **notification bell** and press *Quote Q-24791 is ready to review* (sent yesterday). The quote opens with Decline, Request changes and Accept.
2. Press **Decline**. The dialog offers five reasons and no "no response". Pick **Price too high** and press **Decline**.
3. The quote reads **Declined**, and its notification in Dana's bell is read. Brandi's bell lists *Q-24791 declined by Dana Ortiz*, and the quote's header and Activity give the reason.

## Act 4: Brandi compares reps, reads decline reasons, and reassigns a quote

1. In Herrick's window open **Teams and Reps** in the rail (managers only). The 30-day preset is on.
2. Untick Brandi Gallegos and Nora Chen to compare **Mara Jensen** and **Eli Porter**: one row each and a totals row, with created, open quotes by aging, status counts, rates, times, values, freight recovered and suggestions taken.
3. **Decline reasons** lists every reason with each rep's share, and the Other note in the customer's words. Press the declined-quotes link to drill into exactly those quotes in the Quotes list.
4. Back on Teams and Reps, press Mara's **overdue** count. Press her overdue draft's card, then **Open quote**. On the read-only quote, press **Reassign…**, choose **Eli Porter** and **Reassign**. The quote now reads as Eli's, and its Activity says who moved it.

## Act 5: Pricing & delivery, impact preview, free delivery and the ramp

1. Open **Settings → Pricing & delivery** (manager-only cards).
2. **Recovery pool** shows the computed pool rate from 22 eligible quotes next to the 3.0% starting rate, the 8.0% cap, the 90-day modelled delivery cost and what was recovered. Free delivery pricing is **Off** and locked.
3. Press **View impact preview**: how many of the last 90 days' delivery quotes would carry recovery, and the average line price change per category at step 1 and at the full rate.
4. Turn **Free delivery pricing** on. The ramp-in schedule shows step 1 of 3 starting now, then steps 2 and 3 a month apart, and the pool's rate in force.

## After the demo

Reset again before the next run. Nothing in the demo sends email or SMS; reminders and outreach are deferred (see `docs/todo-registry.md`).
