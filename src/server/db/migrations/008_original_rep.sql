-- 008_original_rep: the quote's first owner (v3 spec §1.2 "original_rep" row, §8; decision 21; D2).
-- Added column only, so code that predates it ignores it (rollback = revert the PR).
-- quotes.rep_id is the current owner, which a manager can reassign; original_rep_id is the rep the
-- quote was created for, set at creation and never changed. Existing quotes have never moved.
ALTER TABLE quotes ADD COLUMN original_rep_id TEXT REFERENCES reps(id);
UPDATE quotes SET original_rep_id=rep_id WHERE original_rep_id IS NULL;
