# Open assumptions

Choices the decision log does not settle, made by the unattended build. Each has one line of reasoning. The product owner can overturn any of them; the code and `spec.md` reference them as OA-n.

| ID | Assumption | Reasoning |
|---|---|---|
| OA-1 | `.agents/` and `.codex/` do not exist in the clone, so T0 has nothing to delete there; it adds both to `.gitignore` instead. | Decision 5 targets untracked folders from another machine; ignoring them prevents them being committed later. |
| OA-2 | The `docs/todo-registry.md` file and its Vitest guard land in F1 as the log says; earlier slices may already add `TODO(R-n)` markers for IDs in the log's registry table. | Keeps the log's slice assignment; the guard validates every earlier marker when it lands. |
| OA-3 | "Quotes under the existing free-delivery threshold carry no recovery" is read literally: a delivery quote whose goods value is below `free_threshold` gets $0.00 freight and no recovery while free delivery pricing is on; at or above it, recovery applies. The threshold is otherwise ignored (decision 35). | Literal reading of decision 32; it also limits price changes to larger orders, the lower-risk rollout. Flag for the product owner. |
| OA-4 | Cost-model defaults: 10 MPG, gasoline, $0.20/mi wear, $0.15/mi depreciation, $25/h driver, 35 mph, 0 min stop; starting rate 3.0%; seeded UT gasoline $3.40/gal. | The log requires manual inputs but the demo needs working numbers out of the box. |
| OA-5 | Recovery above the per-line cap is dropped, not redistributed to other lines. | Redistribution could push other lines over their caps and loop; dropping is simplest and never over-charges. |
| OA-6 | `quote_lines.freight_recovery` stores integer cents **per unit**; a line's allocated share is divided by qty and rounded to whole cents, so the recovered line total can differ from the share by under qty/2 cents. | Unit prices must be whole cents for the customer PDF; the decision-log example (qty 1) is reproduced exactly. |
| OA-7 | With free delivery pricing on, beyond-radius, no ship-to and no-distance deliveries are still "call for freight". | Free delivery pricing replaces the price of a delivery Herrick can make; it does not extend the radius. |
| OA-8 | The new header badge (red count) sits beside the existing unread Quotes badge; it does not replace it. | Decision 15 still needs an unread badge for declines, and decision 18 defines a red-only badge. |
| OA-9 | The red-then-amber-then-total sort and its "oldest first" toggle apply to the Needs-attention view; other list filters keep today's sort. | Changing every list's order would break existing behaviour and E2E specs that the log does not ask to change. |
| OA-10 | Margin, GP and floor figures stay computed from the pre-recovery `unit_price`; recovery is reported separately as "freight recovered". | Decision 32: margin floors and suggestion logic are unchanged and freight is covered on top. |
| OA-11 | Enabling free delivery requires the impact preview to have been viewed within the last 24 hours. | "Has viewed" needs a bound so a stale preview from months ago does not count. |
| OA-12 | Every supplier persona keeps `Principal.role='supplier_admin'`; manager rights come from a new `rep_role` checked against `reps.role`. | Smallest change to the existing `repRoute` checks; demo-cookie auth stays as is (R-4). |
| OA-13 | Upsell acceptance rate covers the customer pop-up suggestions (`added_by='suggestion'` ÷ offered); rep-added chip lines are shown as a count, because rep chips shown are not recorded today. | A rate needs a recorded denominator; adding chip-impression logging is outside the log. |
| OA-14 | Manager-only settings that land before roles exist (aging thresholds) get their edit UI and route in D1; C3 is blocked by D1 so its controls are manager-only from the start. | Avoids shipping settings any rep could change and then re-gating them. |
| OA-15 | "Why quotes went untouched" reasons 1–5 count only quotes currently amber or red; reason 6 counts all expired cohort quotes. | A fresh draft is not "untouched"; aging already defines when a quote is late. |
| OA-16 | Pool goods value and the allocation target use non-contract priced lines only. | Contract lines are exempt from recovery, so their value should not raise the target charged to other lines. |
| OA-17 | The trailing 90-day pool window is measured on the acceptance time (`responded_at`). | Acceptance is when a quote becomes eligible; creation time could exclude recently won quotes. |
| OA-18 | Rep personas Mara and Eli are added to the server session in D1 (needed for role tests); the workspace chooser buttons are added in F1. | The log puts personas in F1, but D1's role checks need them to exist. |
| OA-19 | The Team dashboard window is sent as two ISO instants the browser computes at local midnight; the server does no time-zone math. | Decision 10/23 bucket by the browser's time zone; the browser already knows it. |
| OA-20 | Each slice adds the minimal seed rows its own tests need; F1 completes the demo set (aging mix, >20 eligible accepted delivery quotes, every status). | Slices must be testable on their own before F1. |
| OA-21 | The ramp is linear: rate in force = capped rate × step ÷ steps, with equal steps of `ramp_days ÷ steps` days (30 days by default). | Simplest reading of "applies the rate in steps". |
| OA-22 | Clearing a rep's freight override re-freezes the rate in force at that moment and reallocates. | The quote rejoins the pool on the same terms as a new quote. |
| OA-23 | The pop-up shows at most 3 suggestions. | The log sets a minimum of 2; 3 keeps the pop-up compact. |
| OA-24 | A rounding remainder tie between equal-margin lines goes to the lowest `line_no`. | Deterministic and stable. |
| OA-25 | "Engine price before the freight uplift" is the line's `unit_price`, which may be the rep's chosen price; the pool denominator and the per-line cap use it. | Recovery sits on top of whatever price the rep approved; the engine's pick is only a suggestion. |
| OA-26 | Until a fuel price exists (API or manual), the fuel component is 0 and a warning shows. | The log requires a manual price but quotes must still price. |
| OA-27 | Inactive reps are hidden from the workspace chooser and from reassignment targets, and stay in Team history. | Deactivation should stop new work without losing reporting. |
| OA-28 | The Other decline note is trimmed and stripped of control characters before storage. | Plain text only (decision 14). |
| OA-29 | A PR gets at most 3 fix-and-validate rounds, then is labelled `blocked` and recorded in `status.md`. | From the build instructions; keeps the run moving. |
| OA-30 | D3 is blocked by C1 (freight recovered metric) and E1 (suggestion acceptance) as well as D2. | Its metrics read columns those slices add. |
| OA-31 | A merged task's branch is deleted after merge, so the claim check also skips tasks `status.md` lists as merged. | Build instructions require deleting merged branches; decision 2 relies on names, so status.md fills the gap. |
| OA-32 | Remote branches cannot be deleted from this cloud session (the git proxy answers 403 on branch deletion), so merged `task/*` branches stay on GitHub; worktrees and local branches are removed, and `status.md` marks the task merged so the claim check skips it. | The build instructions require removal; this is the closest possible without changing repository settings. |
| OA-33 | `001_baseline.sql` also writes `meta.schema_version='4'` so pre-T1 code can still open a post-T1 database after a revert. | Keeps the revert path in the T1 rollback plan working. |
| OA-34 | Settings > Data sources shows "Schema migration <latest id>" instead of the schema version number. | `SCHEMA_VERSION` no longer exists (decision 8). |
| OA-35 | `cents` in `snapshot.ts` stays as an alias of the shared helper to avoid touching ~10 callers. | Minimal diff; one implementation. |
