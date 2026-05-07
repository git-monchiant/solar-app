-- Add 5 zone master rows per the new area-based scheme.
-- Existing zones (กรุงเทพ ทีม 1/2/3) are left intact — leads referencing
-- them by name still resolve. If the team later wants to retire those,
-- flip is_active = 0 in a follow-up rather than deleting.
USE solardb;
GO

IF NOT EXISTS (SELECT 1 FROM zones WHERE name = N'โซนเหนือ')
  INSERT INTO zones (name, color, is_active) VALUES (N'โซนเหนือ', N'#f59e0b', 1);

IF NOT EXISTS (SELECT 1 FROM zones WHERE name = N'โซนตะวันตก')
  INSERT INTO zones (name, color, is_active) VALUES (N'โซนตะวันตก', N'#06b6d4', 1);

IF NOT EXISTS (SELECT 1 FROM zones WHERE name = N'โซนใต้')
  INSERT INTO zones (name, color, is_active) VALUES (N'โซนใต้', N'#10b981', 1);

IF NOT EXISTS (SELECT 1 FROM zones WHERE name = N'โซนตะวันออก')
  INSERT INTO zones (name, color, is_active) VALUES (N'โซนตะวันออก', N'#8b5cf6', 1);

IF NOT EXISTS (SELECT 1 FROM zones WHERE name = N'โซนใจกลางเมือง')
  INSERT INTO zones (name, color, is_active) VALUES (N'โซนใจกลางเมือง', N'#ef4444', 1);

PRINT 'Added 5 area zones (โซนเหนือ / ตะวันตก / ใต้ / ตะวันออก / ใจกลางเมือง)';
GO
