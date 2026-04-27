-- Unify role model: one JSON array column `users.roles` instead of two places
-- (legacy users.role + user_roles table). JSON keeps it a single source of
-- truth while still supporting multi-select.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.users') AND name = 'roles')
BEGIN
  ALTER TABLE dbo.users ADD roles NVARCHAR(MAX) NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_users_roles_json')
BEGIN
  ALTER TABLE dbo.users ADD CONSTRAINT CK_users_roles_json
    CHECK (roles IS NULL OR ISJSON(roles) = 1);
END;
