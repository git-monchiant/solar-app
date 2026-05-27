-- Multi-quotation support. QuoteStep can attach up to 3 quotations, each with
-- its own file/doc_no/amount (stored as JSON in the existing NVARCHAR(MAX)
-- quotation_files column). OrderStep substep 1 forces the user to pick which
-- one the customer accepted before they can move on, and that index lands
-- here. Nullable: single-quotation leads (legacy + new) auto-pick 0.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'quotation_accepted_idx')
BEGIN
    ALTER TABLE dbo.leads ADD quotation_accepted_idx INT NULL;
END
GO
