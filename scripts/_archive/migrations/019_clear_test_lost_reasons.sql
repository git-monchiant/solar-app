-- Clear lost_reason values that are obviously placeholder text ("test",
-- "TEST", etc.) — these were typed during early testing and shouldn't show
-- up as a real "อื่นๆ" reason on the lost-reasons chart. status stays 'lost'
-- so the lead remains in the lost bucket; only the reason field is wiped.

UPDATE dbo.leads
SET lost_reason = NULL
WHERE LOWER(LTRIM(RTRIM(lost_reason))) IN ('test', 'tests', 'testing');
GO

PRINT 'placeholder "test" lost_reason values cleared';
GO
