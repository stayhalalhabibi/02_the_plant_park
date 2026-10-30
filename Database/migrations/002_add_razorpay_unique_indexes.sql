BEGIN;

-- Prevent duplicate Razorpay IDs across orders.
-- Multiple NULL values remain allowed by PostgreSQL.

CREATE UNIQUE INDEX IF NOT EXISTS orders_razorpay_order_id_unique
    ON public.orders (razorpay_order_id);

CREATE UNIQUE INDEX IF NOT EXISTS orders_razorpay_payment_id_unique
    ON public.orders (razorpay_payment_id);

COMMIT;
