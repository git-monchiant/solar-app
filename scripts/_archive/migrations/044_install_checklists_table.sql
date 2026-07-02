-- install_checklists — installation handover inspection (รายละเอียดตรวจสอบ
-- งานติดตั้งระบบโซลาร์เซลล์). One row per lead; gates the move from "install
-- done" to "warranty issued" with a structured verification.
--
-- Storage shape mirrors lead_data: header + a handful of JSON columns, one
-- per logical section of the paper form. JSON instead of 30+ flat columns
-- because (a) the inspection items rarely need SQL-side filtering, (b) the
-- list of items will evolve, and (c) we already use the same shape for
-- ac_split / decision_factors / lead assessment.

IF OBJECT_ID('dbo.install_checklists', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.install_checklists (
    lead_id              INT             NOT NULL PRIMARY KEY,
    -- Header
    doc_no               NVARCHAR(50)    NULL,                    -- SSE-26001
    inspection_date      DATE            NULL,                    -- date checklist was filled

    -- §1 Customer-installed system specs. Pre-filled from warranty/survey
    -- on first open; surveyor can override. JSON shape:
    --   {
    --     "inverter": { "brand", "model", "kw", "phase", "sn" },
    --     "panel":    { "brand", "model", "count", "watt", "total_kwp" },
    --     "battery":  { "brand", "model", "kwh" },
    --     "ac_dc_box_ongrid":  { "mcb_dc_solar":{"amp","sqmm"}, "mcb_rcbo_ac":{...}, "mcb_dc":{...}, "mcb_ac_grid":{...} },
    --     "ac_dc_box_hybrid":  { ... mcb_dc_solar, ats, mcb_rcbo_ac, mcb_dc, mcb_ac_grid, mcb_ac_backup ... }
    --   }
    system_specs         NVARCHAR(MAX)   NULL,

    -- §2 10 visual inspection items, each pass/fail + optional note. JSON:
    --   {
    --     "panel_pos":      { "pass": true, "note": "" },
    --     "inverter_pos":   { "pass": true, "note": "" },
    --     "control_box_pos":{ "pass": true, "note": "" },
    --     "battery_pos":    { "pass": null, "note": "ไม่มีแบต" },
    --     "junction_box":   { "pass": true, "note": "" },
    --     "pipe_install":   { "pass": true, "note": "" },
    --     "wire_way":       { "pass": true, "note": "" },
    --     "ground_weld":    { "pass": true, "note": "" },
    --     "terminal_breaker":{"pass": true, "note": "" },
    --     "dc_pipe":        { "pass": true, "note": "" }
    --   }
    visual_checks        NVARCHAR(MAX)   NULL,

    -- §3 Function tests + measurements. JSON:
    --   {
    --     "voltage_1ph":    { "ln": 231.3 },
    --     "voltage_3ph":    { "l1n":..., "l1l2":..., "l3n":..., "l1l3":..., "l2n":..., "l2l3":... },
    --     "meter_amp":      30,
    --     "current_kw":     3.548,
    --     "pv1_volt":       507.4,
    --     "pv2_volt":       null,
    --     "inverter_ip":          { "pass": true, "note": "" },
    --     "smart_meter_reverse":  { "pass": true, "note": "" },
    --     "wifi_app":             { "pass": true, "note": "" },
    --     "app_solar":            { "pass": true, "note": "" }
    --   }
    function_tests       NVARCHAR(MAX)   NULL,

    -- บันทึกเพิ่มเติม (free text at bottom of form)
    notes                NVARCHAR(MAX)   NULL,

    -- Two signatures captured at handover; URLs to /api/files/ uploads.
    inspector_signature_url NVARCHAR(500) NULL,   -- บริษัท เสนา โซลาร์ฯ
    customer_signature_url  NVARCHAR(500) NULL,   -- ลูกค้า

    -- When set, the checklist is finalized → readonly, PDF can be generated,
    -- and the gate to WarrantyStep opens. Unset = still editable.
    submitted_at         DATETIME2       NULL,

    created_at           DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at           DATETIME2       NULL,
    updated_by_id        INT             NULL,

    CONSTRAINT FK_install_checklists_lead FOREIGN KEY (lead_id) REFERENCES dbo.leads(id) ON DELETE CASCADE
  );
END
GO
