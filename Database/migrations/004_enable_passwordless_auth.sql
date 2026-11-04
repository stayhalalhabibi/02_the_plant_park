BEGIN;

-- Allow customers to register using only their phone number.
ALTER TABLE users
ALTER COLUMN email DROP NOT NULL;

-- Keep existing password hashes, but allow passwordless accounts.
ALTER TABLE users
ALTER COLUMN password DROP NOT NULL;

-- Optional customer profile information.
ALTER TABLE users
ADD COLUMN IF NOT EXISTS age INTEGER;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS sex VARCHAR(30);

-- Prevent duplicate phone numbers.
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx
ON users (phone)
WHERE phone IS NOT NULL;

COMMIT;