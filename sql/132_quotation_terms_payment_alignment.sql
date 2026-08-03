-- Align quotation payment terms with the approved Excel quotation template.
-- Approved and pending-approval quotations keep their historical snapshot.

DECLARE @standard_terms NVARCHAR(MAX) =
  N'[{"label":"งวดที่ 1 ชำระ","percent":20,"due":"ภายใน 7 วัน นับจากวันที่ในใบเสนอราคา"},{"label":"งวดที่ 2 ชำระ","percent":80,"due":"ภายใน 3 วัน ก่อนวันติดตั้ง"}]';

UPDATE quotation_payment_templates
SET terms_json = @standard_terms
WHERE is_default = 1
  AND is_active = 1;

UPDATE quotations
SET payment_terms_json = @standard_terms,
    document_snapshot_json = NULL,
    financial_snapshot_json = NULL,
    document_snapshot_at = NULL,
    updated_at = GETDATE()
WHERE status IN ('draft', 'changes_required');
