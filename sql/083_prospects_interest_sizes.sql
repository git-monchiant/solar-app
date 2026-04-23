-- Prospect size interest — which package sizes the customer is interested in.
-- CSV of preset codes like "3,5,10,bat" (solar kW sizes + bat for battery).

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('prospects') AND name = 'interest_sizes')
  ALTER TABLE prospects ADD interest_sizes NVARCHAR(100) NULL;
GO
