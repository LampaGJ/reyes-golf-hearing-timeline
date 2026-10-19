-- Rows logged before the project/host columns existed all came from this one page.
UPDATE visits
SET project = 'reyes-golf-hearing-timeline', host = 'lampagj.github.io'
WHERE project IS NULL AND path LIKE '/reyes-golf-hearing-timeline/%';

-- Remove the Claude Code smoke-test row.
DELETE FROM visits WHERE project = 'claude-test' AND referrer = '(test from Claude Code)';
