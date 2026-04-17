USE solardb;
GO

-- Grant leadsseeker role to admin user (id=1) so it appears in role dropdown
IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = 1 AND role = 'leadsseeker')
  INSERT INTO user_roles (user_id, role) VALUES (1, 'leadsseeker');
GO
