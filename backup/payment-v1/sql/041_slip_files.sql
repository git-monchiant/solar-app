-- Store slip files directly in DB so they don't get lost when disk files are removed/swept.
-- Referenced by leads.slip_url / order_before_slip / order_after_slip as "/api/slips/<id>".

CREATE TABLE slip_files (
  id INT IDENTITY(1,1) PRIMARY KEY,
  lead_id INT NOT NULL,
  slip_field NVARCHAR(50) NOT NULL,      -- "slip_url" | "order_before_slip" | "order_after_slip"
  data VARBINARY(MAX) NOT NULL,
  mime NVARCHAR(50) NOT NULL DEFAULT 'image/jpeg',
  filename NVARCHAR(200) NULL,
  uploaded_at DATETIME2 NOT NULL DEFAULT GETDATE()
);

CREATE INDEX IX_slip_files_lead ON slip_files(lead_id, slip_field);
