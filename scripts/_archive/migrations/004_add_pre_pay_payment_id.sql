-- Link the lead's current pre_pay_token to the payments row it represents,
-- so the invoice document can render per-payment context (CC fee, discount)
-- without duplicating those fields on `leads`.

ALTER TABLE leads ADD pre_pay_payment_id INT NULL;
