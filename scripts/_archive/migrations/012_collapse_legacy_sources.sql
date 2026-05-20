-- Collapse legacy source/channel codes (and free-text variants imported from
-- the old sheet) into the active 12-code ChannelCode taxonomy. The dashboard
-- Lead's Source chart was splitting one business source across multiple bars
-- because pre-picker rows used the loose codes and post-picker rows use the
-- canonical ones.
--
-- Mapping (legacy → active), confirmed by the team:
--   senxpm  / Sen X PM / SenXPM   → seeker_senxpm
--   seeker                         → seeker_senxpm   (default seeker = SenXPM)
--   event   / Event                → event_booth
--   web     / Website              → web_sena
--   line_oa / LINE OA              → line_sena
--   ads     / Ads                  → fb_senx
--
-- Intentionally NOT migrated (no active code is a clean match — keep raw so
-- they stay distinguishable in legacy reports):
--   walk_in, the1, refer, email

-- leads.source — first-touch source on each lead row. Mapping is inlined as
-- a VALUES table inside each batch because table variables don't persist
-- across the GO batch separator that the deploy script splits on.
UPDATE l
SET source = m.dst
FROM dbo.leads l
INNER JOIN (VALUES
    ('%senxpm%',  'seeker_senxpm'),
    ('%seeker%',  'seeker_senxpm'),
    ('%event%',   'event_booth'),
    ('%website%', 'web_sena'),
    ('web',       'web_sena'),
    ('%lineoa%',  'line_sena'),
    ('line_oa',   'line_sena'),
    ('%ads%',     'fb_senx'),
    ('ad',        'fb_senx')
  ) AS m(pattern, dst)
  ON LOWER(REPLACE(l.source, ' ', '')) LIKE m.pattern
WHERE l.source IS NOT NULL
  AND l.source <> m.dst
  -- Don't touch rows already on an active code that happens to match a
  -- pattern (e.g. seeker_housing matches "%seeker%" but must stay).
  AND l.source NOT IN ('seeker_senxpm','seeker_housing','line_sena','line_agent','line_smartify',
                       'event_booth','smartify_app','smartify_existing','smartify_new',
                       'web_sena','fb_smartify','fb_senx','other');
GO

-- prospects.prospect_source — same logic on the prospect side.
UPDATE p
SET prospect_source = m.dst
FROM dbo.prospects p
INNER JOIN (VALUES
    ('%senxpm%',  'seeker_senxpm'),
    ('%seeker%',  'seeker_senxpm'),
    ('%event%',   'event_booth'),
    ('%website%', 'web_sena'),
    ('web',       'web_sena'),
    ('%lineoa%',  'line_sena'),
    ('line_oa',   'line_sena'),
    ('%ads%',     'fb_senx'),
    ('ad',        'fb_senx')
  ) AS m(pattern, dst)
  ON LOWER(REPLACE(p.prospect_source, ' ', '')) LIKE m.pattern
WHERE p.prospect_source IS NOT NULL
  AND p.prospect_source <> m.dst
  AND p.prospect_source NOT IN ('seeker_senxpm','seeker_housing','line_sena','line_agent','line_smartify',
                                'event_booth','smartify_app','smartify_existing','smartify_new',
                                'web_sena','fb_smartify','fb_senx','other');
GO

-- prospects.tag — JSON array of additional touchpoints; token-replace each
-- legacy code in-place. No active code contains these as substrings so
-- collision is impossible.
UPDATE dbo.prospects SET tag = REPLACE(tag, '"senxpm"',  '"seeker_senxpm"') WHERE tag LIKE '%"senxpm"%';
UPDATE dbo.prospects SET tag = REPLACE(tag, '"seeker"',  '"seeker_senxpm"') WHERE tag LIKE '%"seeker"%';
UPDATE dbo.prospects SET tag = REPLACE(tag, '"event"',   '"event_booth"')   WHERE tag LIKE '%"event"%';
UPDATE dbo.prospects SET tag = REPLACE(tag, '"web"',     '"web_sena"')      WHERE tag LIKE '%"web"%';
UPDATE dbo.prospects SET tag = REPLACE(tag, '"line_oa"', '"line_sena"')     WHERE tag LIKE '%"line_oa"%';
UPDATE dbo.prospects SET tag = REPLACE(tag, '"ads"',     '"fb_senx"')       WHERE tag LIKE '%"ads"%';
GO

PRINT 'legacy source codes collapsed to active ChannelCodes';
GO
