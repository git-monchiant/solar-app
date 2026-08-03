-- Quotation builder, one-step approval, package equipment and payment templates.
-- Idempotent migration for SQL Server.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.users') AND name = 'job_title')
  ALTER TABLE dbo.users ADD job_title NVARCHAR(100) NULL;

IF OBJECT_ID('dbo.package_items', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.package_items (
    id INT IDENTITY(1,1) PRIMARY KEY,
    package_id INT NOT NULL,
    item_name NVARCHAR(500) NOT NULL,
    quantity DECIMAL(10,2) NOT NULL CONSTRAINT DF_package_items_qty DEFAULT 1,
    unit NVARCHAR(50) NULL,
    sort_order INT NOT NULL CONSTRAINT DF_package_items_sort DEFAULT 0,
    is_active BIT NOT NULL CONSTRAINT DF_package_items_active DEFAULT 1,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_package_items_created DEFAULT GETDATE(),
    updated_at DATETIME2 NULL,
    CONSTRAINT FK_package_items_package FOREIGN KEY (package_id) REFERENCES dbo.packages(id)
  );
  CREATE INDEX IX_package_items_package ON dbo.package_items(package_id, is_active, sort_order);
END;

-- Give every existing package a usable equipment baseline. Admin can refine
-- these rows in Package Management; future quotation snapshots stay unchanged.
INSERT dbo.package_items(package_id,item_name,quantity,unit,sort_order)
SELECT p.id,v.item_name,v.quantity,v.unit,v.sort_order
FROM dbo.packages p
CROSS APPLY (VALUES
  (CONCAT(N'ชุดระบบโซลาร์ ', p.name),CAST(1 AS DECIMAL(10,2)),N'ชุด',0),
  (CASE WHEN p.has_panel=1 THEN CONCAT(N'แผงโซลาร์เซลล์ กำลังติดตั้งรวม ',FORMAT(p.kwp,'0.0'),N' kWp') END,CAST(1 AS DECIMAL(10,2)),N'ชุด',10),
  (CASE WHEN p.has_inverter=1 THEN CONCAT(N'อินเวอร์เตอร์ ',COALESCE(p.inverter_brand,N''),CASE WHEN p.inverter_kw IS NOT NULL THEN CONCAT(N' ',FORMAT(p.inverter_kw,'0.0'),N' kW') ELSE N'' END) END,CAST(1 AS DECIMAL(10,2)),N'เครื่อง',20),
  (CASE WHEN p.has_battery=1 THEN CONCAT(N'แบตเตอรี่ ',COALESCE(p.battery_brand,N''),CASE WHEN p.battery_kwh IS NOT NULL THEN CONCAT(N' ',FORMAT(p.battery_kwh,'0.0'),N' kWh') ELSE N'' END) END,CAST(COALESCE(NULLIF(p.battery_count,0),1) AS DECIMAL(10,2)),N'ชุด',30),
  (N'ชุดโครงสร้างติดตั้งและอุปกรณ์ประกอบ',CAST(1 AS DECIMAL(10,2)),N'ชุด',40),
  (N'ชุดสายไฟ AC/DC และอุปกรณ์ป้องกัน',CAST(1 AS DECIMAL(10,2)),N'ชุด',50),
  (N'ระบบสายดินและอุปกรณ์ประกอบ',CAST(1 AS DECIMAL(10,2)),N'ชุด',60),
  (N'ค่าติดตั้ง ทดสอบ และส่งมอบระบบ',CAST(1 AS DECIMAL(10,2)),N'งาน',70),
  (N'บริการดูแลและบำรุงรักษาตามเงื่อนไข Package',CAST(1 AS DECIMAL(10,2)),N'งาน',80)
) v(item_name,quantity,unit,sort_order)
WHERE v.item_name IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM dbo.package_items pi WHERE pi.package_id=p.id AND pi.is_active=1);

IF OBJECT_ID('dbo.quotation_payment_templates', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.quotation_payment_templates (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(100) NOT NULL,
    terms_json NVARCHAR(MAX) NOT NULL,
    is_default BIT NOT NULL CONSTRAINT DF_qpt_default DEFAULT 0,
    is_active BIT NOT NULL CONSTRAINT DF_qpt_active DEFAULT 1,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_qpt_created DEFAULT GETDATE(),
    CONSTRAINT CK_qpt_json CHECK (ISJSON(terms_json) = 1)
  );
  INSERT dbo.quotation_payment_templates(name, terms_json, is_default)
  VALUES (N'มาตรฐาน 20/80', N'[{"label":"งวดที่ 1 ชำระ","percent":20,"due":"ภายใน 7 วัน นับจากวันที่ในใบเสนอราคา"},{"label":"งวดที่ 2 ชำระ","percent":80,"due":"ภายใน 3 วัน ก่อนวันติดตั้ง"}]', 1);
END;

IF OBJECT_ID('dbo.quotations', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.quotations (
    id INT IDENTITY(1,1) PRIMARY KEY,
    lead_id INT NOT NULL,
    option_no TINYINT NOT NULL,
    doc_no NVARCHAR(30) NOT NULL,
    revision_no INT NOT NULL CONSTRAINT DF_quotations_revision DEFAULT 0,
    status NVARCHAR(30) NOT NULL CONSTRAINT DF_quotations_status DEFAULT 'draft',
    package_id INT NOT NULL,
    package_name_snapshot NVARCHAR(200) NOT NULL,
    package_price_snapshot DECIMAL(12,2) NOT NULL,
    issue_date DATE NOT NULL CONSTRAINT DF_quotations_issue DEFAULT CAST(GETDATE() AS DATE),
    valid_days INT NOT NULL CONSTRAINT DF_quotations_valid DEFAULT 7,
    subtotal_incl_vat DECIMAL(12,2) NOT NULL,
    discount_label NVARCHAR(200) NULL,
    discount_type NVARCHAR(10) NOT NULL CONSTRAINT DF_quotations_discount_type DEFAULT 'amount',
    discount_value DECIMAL(12,2) NOT NULL CONSTRAINT DF_quotations_discount_value DEFAULT 0,
    discount_amount DECIMAL(12,2) NOT NULL CONSTRAINT DF_quotations_discount_amount DEFAULT 0,
    discount_reason NVARCHAR(500) NULL,
    contract_total_incl_vat DECIMAL(12,2) NOT NULL,
    deposit_paid_amount DECIMAL(12,2) NOT NULL CONSTRAINT DF_quotations_deposit DEFAULT 0,
    outstanding_amount DECIMAL(12,2) NOT NULL,
    vat_rate DECIMAL(5,2) NOT NULL CONSTRAINT DF_quotations_vat DEFAULT 7,
    amount_before_vat DECIMAL(12,2) NOT NULL,
    vat_amount DECIMAL(12,2) NOT NULL,
    payment_template_id INT NULL,
    payment_terms_json NVARCHAR(MAX) NOT NULL,
    terms_text NVARCHAR(MAX) NULL,
    note NVARCHAR(MAX) NULL,
    created_by INT NOT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_quotations_created DEFAULT GETDATE(),
    updated_by INT NOT NULL,
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_quotations_updated DEFAULT GETDATE(),
    submitted_by INT NULL,
    submitted_at DATETIME2 NULL,
    approved_by INT NULL,
    approved_at DATETIME2 NULL,
    approver_name_snapshot NVARCHAR(150) NULL,
    approver_title_snapshot NVARCHAR(100) NULL,
    approver_signature_url_snapshot NVARCHAR(500) NULL,
    approver_signature_data_snapshot VARBINARY(MAX) NULL,
    approver_signature_mime_snapshot NVARCHAR(100) NULL,
    approval_note NVARCHAR(1000) NULL,
    sent_to_customer_by INT NULL,
    sent_to_customer_at DATETIME2 NULL,
    CONSTRAINT FK_quotations_lead FOREIGN KEY (lead_id) REFERENCES dbo.leads(id),
    CONSTRAINT FK_quotations_package FOREIGN KEY (package_id) REFERENCES dbo.packages(id),
    CONSTRAINT FK_quotations_template FOREIGN KEY (payment_template_id) REFERENCES dbo.quotation_payment_templates(id),
    CONSTRAINT CK_quotations_option CHECK (option_no BETWEEN 1 AND 3),
    CONSTRAINT CK_quotations_status CHECK (status IN ('draft','pending_approval','approved','changes_required')),
    CONSTRAINT CK_quotations_discount_type CHECK (discount_type IN ('amount','percent')),
    CONSTRAINT CK_quotations_payment_json CHECK (ISJSON(payment_terms_json) = 1),
    CONSTRAINT UQ_quotations_doc UNIQUE (doc_no),
    CONSTRAINT UQ_quotations_option_revision UNIQUE (lead_id, option_no, revision_no)
  );
  CREATE INDEX IX_quotations_lead_status ON dbo.quotations(lead_id, status, option_no);
  CREATE INDEX IX_quotations_approval ON dbo.quotations(status, submitted_at);
END;

IF OBJECT_ID('dbo.quotation_items', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.quotation_items (
    id INT IDENTITY(1,1) PRIMARY KEY,
    quotation_id INT NOT NULL,
    source_type NVARCHAR(20) NOT NULL,
    package_item_id INT NULL,
    item_name_snapshot NVARCHAR(500) NOT NULL,
    quantity DECIMAL(10,2) NOT NULL,
    unit NVARCHAR(50) NULL,
    unit_price DECIMAL(12,2) NOT NULL CONSTRAINT DF_qi_price DEFAULT 0,
    line_total DECIMAL(12,2) NOT NULL CONSTRAINT DF_qi_total DEFAULT 0,
    sort_order INT NOT NULL CONSTRAINT DF_qi_sort DEFAULT 0,
    CONSTRAINT FK_qi_quotation FOREIGN KEY (quotation_id) REFERENCES dbo.quotations(id) ON DELETE CASCADE,
    CONSTRAINT CK_qi_source CHECK (source_type IN ('package','addon','custom'))
  );
  CREATE INDEX IX_qi_quotation ON dbo.quotation_items(quotation_id, sort_order);
END;

IF OBJECT_ID('dbo.quotation_approval_events', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.quotation_approval_events (
    id INT IDENTITY(1,1) PRIMARY KEY,
    quotation_id INT NOT NULL,
    action NVARCHAR(30) NOT NULL,
    from_status NVARCHAR(30) NULL,
    to_status NVARCHAR(30) NOT NULL,
    note NVARCHAR(1000) NULL,
    acted_by INT NOT NULL,
    acted_at DATETIME2 NOT NULL CONSTRAINT DF_qae_acted DEFAULT GETDATE(),
    CONSTRAINT FK_qae_quotation FOREIGN KEY (quotation_id) REFERENCES dbo.quotations(id) ON DELETE CASCADE
  );
  CREATE INDEX IX_qae_quotation ON dbo.quotation_approval_events(quotation_id, acted_at);
END;
