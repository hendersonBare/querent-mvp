# Querent new UI: style guide and locked decisions

Source of truth for the redesign canvas (the "New UI" page). Every new page is built from this list, so pages stay consistent. Change a rule here first, then rebuild.

## Look
- Manager (admin) view only. No "My quotes / All reps", no "Switch to Rep". The user block at the bottom left shows name and role, with **Sign out**.
- Left rail, 216px, dark green `#0F3B22`. Icons plus labels. Logo mark in mint `#7FDBA0`, supplier name ("Herrick Industrial Supply") bold under "Querent".
- Nav labels: Quotes, Customers, Orders, Stock (was Items), Analytics, Teams and Reps, Settings.
- Accent green `#14803C`. Page background `#D9E3DC`. Cards white, radius 14. Solid dark-green header bars `#1F4A39` on cards and columns.
- Font: Albert Sans, numbers and codes in Geist Mono. No em-dashes anywhere.
- Thin rounded scrollbars.

## Page header
- Page title, then a search or customer picker (no top search bar), then the **Filter** button, then caution icon and bell on the right.
- Caution icon and bell open short dropdowns. They do not redirect.
- No arrow buttons inside input fields.

## Lists and tables
- Column headers show `::` drag handles. A columns icon sits at the end of the header row.
- Show about a screen of rows, then a "Show N more" button.
- Status is plain text or the column it sits in. One status signal per row. Red text only for Overdue, Aging, or a problem.
- Notes show as a yellow "View note" button, not the full text.

## Quote pages
- Board and Table views share one toolbar (picker, Filter, Board/Table toggle).
- Quote editor: header shows only customer, quote number, status, purchasing agent, requested date, valid until.
- "Approve and send" sits in the total box. Save draft, Export, Chat and More are icons below it.
- Quote details are one dropdown. "Show cost and stock" toggle. "+ Add item" row. No totals under the lines.

## Settings and teams
- Rep assignments and Reps live in **Teams and Reps**. Teams and Reps has no analytics.
- Margin floors are organization hard stops, plus a read-only rep review. Managers do not set their own.
- Descriptions only where a new user could misread a setting.

## Canvas rules
- Frames are 1440 x 900. Long pages show a scrolled frame instead of a tall one.
- Each page is a section on "New UI": title on the left, one row of frames, one frame per opened button.
- The build scripts overwrite files and the canvas index. Always re-read the canvas before publishing so hand edits survive.
