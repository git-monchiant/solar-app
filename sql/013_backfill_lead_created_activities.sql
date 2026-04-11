-- Fix activity_type for 'Lead created' rows that were stored as 'note'
-- and populate their note field from leads.note/requirement
USE solardb;
GO

UPDATE la
SET la.activity_type = 'lead_created',
    la.note = COALESCE(la.note, l.note, l.requirement)
FROM lead_activities la
JOIN leads l ON l.id = la.lead_id
WHERE la.title LIKE N'Lead created%' AND la.activity_type <> 'lead_created';
GO
