-- Merge 'visited' status into 'registered' (now labeled Register/Walk-In)
USE solardb;
GO

UPDATE leads SET status = 'registered' WHERE status = 'visited';
UPDATE lead_activities SET old_status = 'registered' WHERE old_status = 'visited';
UPDATE lead_activities SET new_status = 'registered' WHERE new_status = 'visited';
GO
