-- client_errors — every unhandled error / failed API response gets POSTed
-- here from the browser. Powers /admin/client-errors so we can see what users
-- actually hit without screen-sharing.
USE solardb;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'client_errors')
BEGIN
  CREATE TABLE client_errors (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    created_at  DATETIME2 DEFAULT SYSUTCDATETIME(),
    user_id     INT NULL,
    source      NVARCHAR(50) NULL,   -- 'apifetch' | 'window_error' | 'promise_rejection' | 'manual'
    message     NVARCHAR(2000) NULL,
    stack       NVARCHAR(MAX) NULL,
    url         NVARCHAR(500) NULL,
    user_agent  NVARCHAR(500) NULL,
    status_code INT NULL,            -- only for apifetch (4xx/5xx)
    request_url NVARCHAR(500) NULL,  -- only for apifetch (the URL that failed)
  );
  CREATE INDEX IX_client_errors_created_at ON client_errors(created_at DESC);
END
GO

PRINT 'client_errors table ready';
GO
