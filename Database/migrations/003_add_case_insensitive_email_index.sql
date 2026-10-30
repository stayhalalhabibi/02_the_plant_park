BEGIN;

-- Prevent duplicate user emails regardless of capitalization.

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique_idx
    ON public.users (LOWER(email));

COMMIT;
