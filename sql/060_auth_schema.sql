-- Auth schema: ensure user_roles + email column exist. Passwords remain in
-- users.password_hash (scrypt `salt:hash` format — set via scripts/set_password.mjs).

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'user_roles')
BEGIN
  CREATE TABLE user_roles (
    user_id INT NOT NULL,
    role    NVARCHAR(30) NOT NULL,
    PRIMARY KEY (user_id, role)
  );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'email')
  ALTER TABLE users ADD email NVARCHAR(150) NULL;
GO
