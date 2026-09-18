# Golden Questions and Exact No-Key Responses

Use the **Wasatch Excavation** persona with all seven categories enabled. These are the exact responses returned from the initial seed when `ANTHROPIC_API_KEY` is absent. Claude mode uses live data but controls its own wording.

If a question's category is disabled, the response is exactly: `That information isn’t available here.` An unsupported no-key question returns: `Without an Anthropic API key, this demo supports the questions in docs/golden-questions.md. Try one of the suggested questions.`

## 1. Account number

**Ask:** What is our account number?

**Category:** Account details

**Response:** Your Century Equipment account number is **CE-1001**.

## 2. Account contact

**Ask:** Who is our account contact?

**Category:** Account details

**Response:** Your account contact is **Jordan Lee** (operations@example.com).

## 3. Account address

**Ask:** What is our account address?

**Category:** Account details

**Response:** Your account address is **1250 West Industrial Drive, Salt Lake City, UT**.

## 4. Part quantity

**Ask:** How many PART-0001 units are in stock?

**Category:** Parts inventory

**Response:** **PART-0001 has 11 units in stock.**

## 5. Part branch

**Ask:** What branch has PART-0002?

**Category:** Parts inventory

**Response:** **PART-0002 is stocked at the Salt Lake City branch.**

## 6. Equipment inventory

**Ask:** Show CASE CX210D equipment in stock.

**Category:** Equipment inventory

**Response:**

Available CASE CX210D equipment:

| Stock number | Model | Branch | Condition | Price |
| --- | --- | --- | --- | --- |
| EQ-001 | CASE CX210D | Ogden | New | $69,500 |
| EQ-005 | CASE CX210D | Ogden | New | $87,500 |
| EQ-009 | CASE CX210D | Ogden | Used | $105,500 |
| EQ-013 | CASE CX210D | Ogden | New | $123,500 |
| EQ-017 | CASE CX210D | Ogden | New | $141,500 |

## 7. Current order status

**Ask:** What is the status of PO-48213?

**Category:** Current orders

**Response:** **PO-48213 is shipped.**

## 8. Expected delivery

**Ask:** When is PO-48214 expected?

**Category:** Current orders

**Response:** **PO-48214 is expected on September 20, 2026.**

## 9. Delivered orders

**Ask:** Show our delivered orders.

**Category:** Past orders

**Response:**

Your delivered orders:

| Order | Description | Status | Order date | Total |
| --- | --- | --- | --- | --- |
| PO-48216 | Track maintenance kit | delivered | 2026-09-05 | $750 |
| PO-48221 | Hydraulic filter kit | delivered | 2026-09-10 | $1,375 |
| PO-48226 | Bucket teeth set | delivered | 2026-09-05 | $2,000 |
| PO-48231 | CASE CX210D parts | delivered | 2026-09-10 | $2,625 |

## 10. Closed orders

**Ask:** Show our closed orders.

**Category:** Past orders

**Response:**

Your closed orders:

| Order | Description | Status | Order date | Total |
| --- | --- | --- | --- | --- |
| PO-48217 | Hydraulic filter kit | closed | 2026-09-06 | $875 |
| PO-48222 | Bucket teeth set | closed | 2026-09-01 | $1,500 |
| PO-48227 | CASE CX210D parts | closed | 2026-09-06 | $2,125 |
| PO-48232 | Track maintenance kit | closed | 2026-09-01 | $2,750 |

## 11. Recent service records

**Ask:** Show our recent service records.

**Category:** Service records

**Response:**

Your five most recent service records:

| Date | Equipment | Service | Status | Cost |
| --- | --- | --- | --- | --- |
| 2026-09-08 | CASE CX210D | 500-hour maintenance | Completed | $380 |
| 2026-09-01 | CASE 580N | Hydraulic inspection | Completed | $460 |
| 2026-08-25 | CASE 621G | Track adjustment | Completed | $540 |
| 2026-08-18 | CASE CX210D | 500-hour maintenance | Completed | $620 |
| 2026-08-11 | CASE 580N | Hydraulic inspection | Completed | $700 |

## 12. Financing plans

**Ask:** What financing plans do we have?

**Category:** Financing

**Response:**

Your financing plans:

| Plan | Equipment | Balance | Monthly payment |
| --- | --- | --- | --- |
| FIN-1001 | CASE CX210D | $76,000 | $1,625 |
| FIN-1002 | CASE 580N | $68,000 | $1,750 |
| FIN-1003 | CASE 621G | $60,000 | $1,875 |
| FIN-1004 | CASE TR340 | $52,000 | $2,000 |

## 13. Financing balance

**Ask:** What is the balance on FIN-1004?

**Category:** Financing

**Response:** The balance on **FIN-1004 is $52,000**.

## 14. Combined order and account

**Ask:** What is PO-48213's status and our account number?

**Categories:** Current orders and account details

**Response:** PO-48213 is **shipped**. Your Century Equipment account number is **CE-1001**.

## 15. Combined financing and service

**Ask:** Show financing balances and service history.

**Categories:** Financing and service records

**Response:**

### Financing balances

| Plan | Equipment | Balance |
| --- | --- | --- |
| FIN-1001 | CASE CX210D | $76,000 |
| FIN-1002 | CASE 580N | $68,000 |
| FIN-1003 | CASE 621G | $60,000 |
| FIN-1004 | CASE TR340 | $52,000 |

### Recent service history

| Date | Equipment | Service | Status |
| --- | --- | --- | --- |
| 2026-09-08 | CASE CX210D | 500-hour maintenance | Completed |
| 2026-09-01 | CASE 580N | Hydraulic inspection | Completed |
| 2026-08-25 | CASE 621G | Track adjustment | Completed |
| 2026-08-18 | CASE CX210D | 500-hour maintenance | Completed |
| 2026-08-11 | CASE 580N | Hydraulic inspection | Completed |

## Demo sequence

1. Choose Wasatch and ask questions 7, 4, 11, and 13.
2. Switch workspace, choose Century Equipment, select Wasatch, and disable Financing.
3. Return to Wasatch. Financing disappears from the contacts panel.
4. Ask question 13. Confirm the restricted response appears and no financing values are disclosed.
5. Return to Century Equipment, re-enable Financing, and inspect analytics, the data browser, assignments, and connection status.

Simple wording variants are recognized without Claude. A short follow-up beginning with “what about,” “and,” or “how about” reuses the previous question for context. Canonical questions are the stable byte-for-byte acceptance cases.
