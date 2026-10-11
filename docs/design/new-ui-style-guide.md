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
| Token | Value | Use |
|---|---|---|
| rail | `#1F2422` | left rail background |
| rail border | `#343A37` | divider above the user block |
| rail text | `#A9AEAB` (idle), `#E6E8E7` (supplier name), `#fff` (active) | nav labels |
| rail button border | `#4A514D` | Sign out |
| card title bar | `#2A302D`, text `#fff` | card, column and panel headers |
| title bar muted text | `#C7CBC9` | subtitles inside title bars |
| page | `#E9EBEA` | app background |
| card | `#FFFFFF` | cards, inputs |
| table header | `#E8EAE9`, text `#3A403D` | table and board column headers |
| row divider | `#E8EAE9` | between rows |
| border | `#D6D9D7` | controls and cards |
| tab rule | `#C4C7C5` | under tabs, scrollbar thumb |
| text | `#1B1F1D` | primary |
| text secondary | `#585F5B` | labels, descriptions |
| text muted | `#767D79` | hints |
| icon muted | `#9DA29F` | info "i" ring |
| accent green | `#14803C` | primary buttons, active nav and tab underline, links, toggles, chart bars, positive numbers |
| red | `#C92A1C` | Overdue, Aging, below floor, caution only |
| red tint / border | `#FFEDEA` / `#E8A8A0` | caution button, error rows |
| note button | bg `#FBE7A1`, text `#5C4300` | "View note" |

## Type
- UI: **Albert Sans** 400, 500, 600, 700, 800. Numbers, SKUs and codes: **Geist Mono** 400, 500. Load both with `next/font`. Replace Archivo, IBM Plex Sans and IBM Plex Mono.
- Body 14.5px. Page title 32px / 800 / letter-spacing -0.035em. Section heading 24px / 800 / -0.02em. Card title 15.5px / 800. Table header 12.5px / 800. Table body 14px. Secondary 13px. Labels and badges 11.5 to 12.5px. Big stat numbers 38 to 44px / 800 / -0.03em.
- Eyebrow badges (for example `ALL TIME`): 11.5px / 800 / letter-spacing 0.06em, white at 16% on the title bar.
- No em-dashes anywhere. Hyphens only.

## Shape and size
- Rail 216px wide, padding 20 14, nav item padding 10 12, radius 10, icon 20px, gap 12. Active item: bg `#14803C`, text `#fff`, weight 700. Logo 40px plus "Querent" 20px / 800, supplier name 13px / 800 below.
- Page padding 24 32. Card radius 14. Control radius 9 to 10. Pills and toggles radius 999.
- Card title bar padding 12 20. Panel and standard buttons 38px high; Filter, caution and bell 40px; Sign out 36px.
- Table header row padding 10 20. Body row padding 14 20. Board column header padding 12 16.
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
- **Disabled:** 50% opacity, `not-allowed` cursor.
- **Empty and error:** a single plain line in `#585F5B` inside the card; errors in `#C92A1C`.
