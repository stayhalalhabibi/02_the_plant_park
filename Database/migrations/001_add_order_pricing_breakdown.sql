
BEGIN;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS bundle_discount NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS percentage_discount NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC(10, 2);

COMMIT;
