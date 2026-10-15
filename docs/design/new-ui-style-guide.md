# Querent new UI: style guide (charcoal)

Source of truth: the 89 frames in `docs/design/canvas-frames/` (canvas "New UI (Charcoal)", https://claude.ai/artifact/9JknKAyWrdWdjZpgvLAnHj). Values below were read from those frames. If this file and a frame disagree, the frame wins; fix this file. The earlier green palette (`#0F3B22` rail, `#D9E3DC` page, `#1F4A39` title bars) is retired.

## Viewport
Frames are drawn at 1440 x 900. The product is verified at **1920 x 1080**. So:
- Main content is fluid: the rail is fixed at 216px and the page area fills the rest. Do not pin the page to 1440px.
- Cards and tables grow with the width. Max-width containers are not in the frames; do not add one unless a frame has it.
- The rail is `position: sticky; top: 0; height: 100vh`, not the 900px the frames use.
- Frames show tall pages as a scrolled frame (`translateY`). The app scrolls normally.
- No phone or tablet layouts are built in this release.

## Tokens
Every token below is a CSS variable in `src/app/tokens.css` (`--q-<name>`). `e2e/frames-primitives.spec.ts` reads each one from the frame that draws it and compares it with the app.

| Token | Value | Use |
|---|---|---|
| rail | `#1F2422` | left rail background; dark header of the caution and bell dropdowns |
| rail-border | `#343A37` | divider above the user block |
| rail-text, rail-name | `#A9AEAB` (idle), `#E6E8E7` (supplier name), `#fff` (active) | nav labels |
| rail-button-border | `#4A514D` | Sign out |
| titlebar | `#2A302D`, text `#fff` | card, column and panel headers |
| titlebar-muted | `#C7CBC9` | subtitles inside title bars |
| titlebar-line | `#5A615D` | a control's line on a title bar (C_TRBase Filter) |
| row-picked | `#F7FAF8` | a picked row (C_TR5 selected team) |
| page | `#E9EBEA` | app background |
| card | `#FFFFFF` | cards, inputs, panels |
| card-border | `#DDDFDE` | the Quotes table card and board cards |
| table-header | `#E8EAE9`, text `#3A403D` | table and board column headers; the highlighted row in the customer picker |
| row-divider | `#E8EAE9` | between rows (most tables) |
| row-divider-soft | `#ECEEED` | between rows of the Quotes table (C_QOTable) |
| lane | `#F0F1F0` | board lanes, shown rows in the columns picker, the segmented control track |
| border | `#D6D9D7` | controls, fields, the white header buttons |
| rule | `#C4C7C5` | under tabs, popover and dropdown borders, scrollbar thumb |
| text | `#1B1F1D` | primary |
| text-2 | `#585F5B` | labels, descriptions, field values, "Clear all" |
| text-muted | `#767D79` | hints, "Always shown" |
| text-code | `#666C69` | account numbers and the hint line in the customer picker |
| icon-muted | `#9DA29F` | info "i" ring, `::` handles, dashed "Show more" border |
| more-text | `#343A37` | "Show N more" text |
| button-text | `#000000` | buttons the frames leave uncoloured (Filter) keep the browser's black |
| accent | `#14803C` | primary buttons, active nav and tab underline, links, toggles, chart bars, positive numbers, checked boxes, count badge |
| red | `#C92A1C` | Overdue, Aging, below floor, caution only |
| red-tint / red-border | `#FFEDEA` / `#E8A8A0` | caution button, error rows. The Quotes table frames (C_QOTable, C_QOT1 to C_QOT7, C_RQTable) draw the caution border `#F1BEB8`; every other frame draws `#E8A8A0`, which the token uses |
| note / note-text | `#FBE7A1` / `#5C4300` | "View note" |
| note-quote | `#3D2E00` | the customer's words in a note box (C_QOB5, C_QOB6) |
| toggle-off | `#BFC3C1` | a switch that is off |
| check-disabled | `#B0B4B2` | the square of a column that is always shown |
| close | `#EEF2F0` | the "x" close button of sheets and dialogs |
| count-bg | `rgba(0,0,0,0.08)` | board lane counts, the columns picker button |
| backdrop-sheet / backdrop-dialog | `rgba(15,35,25,0.22)` / `rgba(15,35,25,0.45)` | behind a side sheet / a centred dialog |
| shadow-popover | `0 20px 44px rgba(20,24,22,0.24)` | filter panel, columns picker, dropdowns |
| shadow-picker | `0 18px 40px rgba(20,24,22,0.22)` | customer picker list |
| shadow-sheet | `-16px 0 40px rgba(20,24,22,0.20)` | side sheet |
| shadow-lane-drag / shadow-header-drag | `0 24px 40px rgba(20,24,22,0.35)` / `0 14px 26px rgba(0,0,0,0.35)` | a board lane / table header while dragged |
| accent-hover | `#0F6A31` | no frame: hover per "States not drawn" |

## Type
- UI: **Albert Sans** 400, 500, 600, 700, 800. Numbers, SKUs and codes: **Geist Mono** 400, 500. Load both with `next/font`. Replace Archivo, IBM Plex Sans and IBM Plex Mono.
- Body 14.5px. Page title 32px / 800 / letter-spacing -0.035em. Section heading 24px / 800 / -0.02em. Card title 15.5px / 800. Table header 12.5px / 800. Table body 14.5px (the body size; the frames set none). Panels and dropdowns 14px. Secondary 13px. Field and group labels 12px / 700. Labels and badges 11.5 to 12.5px. Big stat numbers 38 to 44px / 800 / -0.03em.
- A new UI page sits inside `.ui-root` (`src/app/tokens.css`), which sets what the frames' root sets: Albert Sans 14.5px in `#1B1F1D`, line height `normal`, content-box sizing (buttons border-box) and the thin scrollbars.
- Buttons the frames give no font size (Filter, caution, bell, Show more, Sign out) use the browser's button size, 13.333px (`--q-text-button`). Every size and colour is otherwise set on the element; the frames' line height is `normal` throughout.
- Eyebrow badges (for example `ALL TIME`): 11.5px / 800 / letter-spacing 0.06em, white at 16% on the title bar.
- No em-dashes anywhere. Hyphens only.

## Shape and size
- Rail 216px wide, padding 20 14, nav item padding 10 12, radius 10, icon 20px, gap 12. Active item: bg `#14803C`, text `#fff`, weight 700. Logo 40px plus "Querent" 20px / 800, supplier name 13px / 800 below.
- Page padding 24 32 40. Card radius 14. Control radius 9 to 10; filter panel fields 8. Pills and toggles radius 999. Toggle 40 x 22 with a 16px knob 3px in.
- Card title bar padding 12 20. Panel and standard buttons 38px high; Filter, caution and bell 40px; customer picker 42px (320 wide, its list 360); Sign out 36px; "Done" in the columns picker 36px.
- Popovers: filter panel 390 to 420 wide, padding 18, radius 14; columns picker 320 wide, padding 14; caution and bell dropdowns 360 wide; side sheet 400 wide, padding 26 28.
- Table header row padding 10 20. Body row padding 14 20. Grid gap 16 (14 on Teams and Reps). Board column header padding 12 16.
- Item-row text and inputs share a 34px centre line.
- Thin rounded scrollbars: 8px, thumb `#C4C7C5`, transparent track.

## Behaviour rules
- Page header: title, then a page-local picker or search, then **Filter**, then caution and bell on the right. No global search. Caution and bell open dropdowns; they never redirect.
- Tables: `::` drag handle on each column header, columns icon at the end of the header row, about one screen of rows then "Show N more". Column order and visibility are per user.
- Status is plain text, one signal per row. Red only for Overdue, Aging or a problem. Notes show as the yellow "View note" button.
- No arrow buttons inside inputs. Descriptions only where a new user could misread a setting.
- Feature-flagged sections do not render while the flag is off.

## States not drawn (build quietly, same tokens)
- **Hover:** buttons and filled controls darken one step (accent `#14803C` to about `#0F6A31`; white controls get `#F0F1F0`; rows get `#F0F1F0`; nav items get `#2A302D`). Pointer cursor on anything clickable.
- **Focus:** 2px accent outline with 2px offset on every focusable element.
- **Loading:** skeleton blocks in `#E8EAE9` with a slow pulse, same size as the content. Buttons show a disabled state while a request runs. No spinners over page content.
- **Disabled:** 50% opacity, `not-allowed` cursor. Where a frame draws a disabled control it wins: C_RS3 draws a rep's disabled **Save margins** at full strength on `#C4C7C5`, which the rep's Settings saves use (U9).
- **Empty and error:** a single plain line in `#585F5B` inside the card; errors in `#C92A1C`.
