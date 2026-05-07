-- Retire the legacy team-based zones (กรุงเทพ ทีม 1/2/3) in favor of the
-- area-based zones added in 118. Per user direction, all rows referencing
-- the old "ทีม 1" land in "โซนเหนือ" (the first new zone) — manual reclass
-- can follow if needed.
USE solardb;
GO

-- 1. Migrate lead zone references
UPDATE leads SET zone = N'โซนเหนือ' WHERE zone IN (N'กรุงเทพ ทีม 1', N'กรุงเทพ ทีม 2', N'กรุงเทพ ทีม 3');

-- 2. Migrate calendar block zone references (string column, not FK)
UPDATE calendar_blocks SET zone = N'โซนเหนือ' WHERE zone IN (N'กรุงเทพ ทีม 1', N'กรุงเทพ ทีม 2', N'กรุงเทพ ทีม 3');

-- 3. Delete the old zone master rows. projects.zone_id + zone_areas.zone_id
-- are unused for these ids (verified before this migration).
DELETE FROM zones WHERE name IN (N'กรุงเทพ ทีม 1', N'กรุงเทพ ทีม 2', N'กรุงเทพ ทีม 3');

PRINT 'Old zones (ทีม 1/2/3) retired — references moved to โซนเหนือ';
GO
