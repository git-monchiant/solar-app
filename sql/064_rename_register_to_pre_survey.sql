-- Rename status value 'register' to 'pre_survey' across all tables.
-- Motivation: in the domain, "Register" is the user action of creating a lead
-- (NewLeadModal). The persistent first stage that follows is conceptually
-- "pre-survey" — data prefix is pre_*, validator is validatePreSurvey. The DB
-- value was lagging the conceptual model; this migration aligns them.

UPDATE leads        SET status     = 'pre_survey' WHERE status     = 'register';
UPDATE lead_activities SET old_status = 'pre_survey' WHERE old_status = 'register';
UPDATE lead_activities SET new_status = 'pre_survey' WHERE new_status = 'register';
