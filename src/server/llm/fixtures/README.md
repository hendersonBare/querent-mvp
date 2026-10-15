# LLM fixtures

The scripted parser and judge (`QUERENT_SCRIPTED=1`, or no `ANTHROPIC_API_KEY`) answer from these files
and never reach the network. CI, the unit tests and every E2E run use them.

**Everything here was hand-written in the build session (no API key was available). None of it is a
recording of real Claude output.** It shows what a careful, conservative parser and judge should answer.

## `judge.json`: recorded judge verdicts

- A map from a line's normalized description to `{ "sku": string | null, "reason": string }`.
- Keys are `judgeKey(description)` from `../scripted-judge.ts`: lowercase, plain quote marks, spaced dimensions
  joined (`12 x 10 x 8` → `12x10x8`), single spaces, no trailing punctuation. The scripted judge looks up the
  line's description, then its raw text.
- A recorded SKU is answered only when it is one of that line's candidates; otherwise the answer is `null`
  (`not_in_candidates`). A line with no recorded verdict gets the first candidate (`scripted_first_candidate`),
  which mimics an always-agreeing judge, so the scorer's thresholds decide.
- Every non-null SKU must exist in `data/boxt-catalog.json` (checked by `scripted-judge.test.ts`).
- To add a verdict: write the line's description, run it through `judgeKey`, and add the entry with the SKU a
  careful judge would pick from the candidates the scorer returns (or `null`), with a one-sentence reason.

## `pdf/`: parse results for known PDFs

- `pdf/<sha256>.json` holds `{ "file", "note", "rows": ParsedRow[] }` for the PDF whose bytes hash to
  `<sha256>`; `pdf/index.ts` registers it. The scripted parser validates the rows like live output. Any PDF
  without a fixture is refused with "Could not read that PDF. Try pasting the list as text."
- The committed sample is `test/fixtures/sample-list.pdf`, written by `buildFixturePdf(SAMPLE_LIST_LINES)` in
  `../fixture-pdf.ts` (a dependency-free, deterministic single-page PDF). Regenerate it with
  `npx tsx -e "import {writeSamplePdf} from './src/server/llm/fixture-pdf.ts'; writeSamplePdf()"`.
  `fixture-pdf.test.ts` fails if the file, its hash or its fixture drift apart.
- To add a PDF: commit it, compute `sha256sum <file>`, write `pdf/<sha256>.json` by hand (one row per product
  line, `rawText` verbatim, no header/address/total rows) and register it in `pdf/index.ts`.
