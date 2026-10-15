-- 011_teams: teams become entities (plan U7; new-ui-implementation-prompt Appendix C "teams"; decision 47).
-- New tables only, so code that predates them ignores them (rollback = restore the volume backup, revert the PR).
-- teams: a name (unique whatever its case, 1 to 40 characters after trimming) and an optional parent team.
-- A parent is grouping only: its members count in it for counts and filters, never for permissions
-- (hierarchical visibility stays TODO(R-12)). No loops: the app refuses a parent that is the team or a
-- team inside it; the CHECK refuses the team itself. A deleted parent leaves its child teams on their own.
CREATE TABLE teams(
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(name)) BETWEEN 1 AND 40),
  parent_team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL CHECK(parent_team_id IS NULL OR parent_team_id<>id)
);
-- team_members: each rep belongs to at most one team. A deleted team takes its memberships with it.
CREATE TABLE team_members(
  rep_id TEXT PRIMARY KEY REFERENCES reps(id),
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE
);
CREATE INDEX team_members_team ON team_members(team_id);
-- Backfill from the free-text label (006_roles): one team per label, trimmed and case-insensitive, named
-- as its first rep (by id) writes it; each rep a member of their label's team. reps.team stays for old code.
INSERT INTO teams(name)
  SELECT (SELECT trim(r2.team) FROM reps r2 WHERE lower(trim(r2.team))=lower(trim(r.team)) ORDER BY r2.id LIMIT 1)
  FROM reps r WHERE trim(coalesce(r.team,''))<>''
  GROUP BY lower(trim(r.team)) ORDER BY min(r.id);
INSERT INTO team_members(rep_id,team_id)
  SELECT r.id,t.id FROM reps r JOIN teams t ON t.name=trim(r.team) WHERE trim(coalesce(r.team,''))<>'';
