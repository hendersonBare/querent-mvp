# Task 3.7 evidence: Approve & send dialog + centered Confirm send

These screenshots were captured by `e2e/rep-approve-send.spec.ts` on `task/3.7-approve-send` (head 6fc97ac). They come from a production server in scripted mode, with the seed pinned to 2026-09-23 and the sample quote Q-24817.

| File | What it shows |
|---|---|
| 01-1440-send-dialog.png | The send dialog (screen 07). It has the summary line and the "Still open … You can send anyway." callout. The channel is Querent chat only (checked, fixed). Attach PDF is on, with Preview PDF, and the editable message is prefilled. |
| 02-1440-confirm-send.png | Confirm send is a separate, narrower dialog centered on screen. It shows Q-24817 rev 1, Dana Ortiz, Wasatch Mechanical Contractors (Querent chat, PDF attached), $1,122.40 and 1 line below floor. Cancel is red and Send is Querent green, centered and away from Send quote. |
| 03-1440-sent.png | After Send: status Sent, the banner "Sent to Dana as rev 1", Approve & send disabled, and the toast. |
| 04-1440-send-blocked.png | A line with no price: "Can't send yet" lists the reason and Send quote is disabled. |
| 05-390-send-dialog.png | The send dialog at 390px, with no sideways scroll. |
| 06-390-confirm-send.png | Confirm send at 390px: centered, with Send clear of where Send quote was. |
