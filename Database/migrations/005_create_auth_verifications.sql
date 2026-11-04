BEGIN;

CREATE TABLE IF NOT EXISTS auth_verifications (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    method VARCHAR(10) NOT NULL
        CHECK (method IN ('email', 'phone')),

    contact VARCHAR(150) NOT NULL,

    otp_hash CHAR(64) NOT NULL,

    otp_expires_at TIMESTAMPTZ NOT NULL,

    attempts INTEGER NOT NULL DEFAULT 0
        CHECK (attempts BETWEEN 0 AND 5),

    verified_at TIMESTAMPTZ,

    profile_token_hash CHAR(64),

    profile_token_expires_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (method, contact)
);

CREATE UNIQUE INDEX IF NOT EXISTS
    auth_verifications_profile_token_unique_idx
ON auth_verifications (profile_token_hash)
WHERE profile_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS
    auth_verifications_expiry_idx
ON auth_verifications (otp_expires_at);

COMMIT;