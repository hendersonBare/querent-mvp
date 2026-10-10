-- 006_roles: roles, team labels and inactive reps (v3 spec §1.2 "006" row, §8; decisions 20, 21; D1).
-- Added columns only, so code that predates them ignores them (rollback = revert the PR).
-- role: 'rep' or 'manager' (supervisor and admin are merged). A manager sees all reps.
ALTER TABLE reps ADD COLUMN role TEXT NOT NULL DEFAULT 'rep' CHECK(role IN ('rep','manager'));
-- team: a free-text label, used only as a filter. NULL = no team.
ALTER TABLE reps ADD COLUMN team TEXT;
-- active: 0 once a manager marks the rep inactive, which is refused while any customer is theirs (customer_rep).
ALTER TABLE reps ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1));
-- Brandi becomes the manager and keeps her own book. A fresh database gets this from the seed.
UPDATE reps SET role='manager' WHERE id='brandi';
