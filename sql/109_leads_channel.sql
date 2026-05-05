-- Mirror prospects.channel — track where the lead came from. Same code set
-- (senxpm, walk_in, event, ads, the1, web, refer, line_oa, other).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'channel')
  ALTER TABLE leads ADD channel NVARCHAR(20) NULL;
