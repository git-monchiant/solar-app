-- Backfill lead.source from prospect.prospect_source for leads that came from
-- seeker promotion before the source-carry-over change landed. Prior code
-- always set lead.source = 'seeker', losing the actual first-touch channel.
USE solardb;
GO

UPDATE l
SET l.source = p.prospect_source
FROM leads l
INNER JOIN prospects p ON p.lead_id = l.id
WHERE l.source = 'seeker'
  AND p.prospect_source IS NOT NULL
  AND p.prospect_source <> '';
GO

-- Report what changed (no-op SELECT for logging the sample after the script).
PRINT 'leads.source backfilled from prospects.prospect_source';
GO
