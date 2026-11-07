
BEGIN;

-- 1. ADMIN ACCOUNTS
CREATE TABLE IF NOT EXISTS admins (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,

    role VARCHAR(10) NOT NULL DEFAULT 'admin'
        CHECK (role IN ('owner', 'admin')),

    status VARCHAR(15) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended')),

    email_verified_at TIMESTAMPTZ,
    created_by_admin_id BIGINT REFERENCES admins(id) ON DELETE SET NULL,

    token_version INTEGER NOT NULL DEFAULT 0,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS admins_email_unique_idx
ON admins (LOWER(email));

CREATE UNIQUE INDEX IF NOT EXISTS admins_single_owner_idx
ON admins (role)
WHERE role = 'owner';


-- 2. ADMIN PERMISSIONS
CREATE TABLE IF NOT EXISTS admin_permissions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    permission_key VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(255) NOT NULL
);

-- 3. PERMISSIONS ASSIGNED TO ADMINS
CREATE TABLE IF NOT EXISTS admin_permission_assignments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    admin_id BIGINT NOT NULL
        REFERENCES admins(id) ON DELETE CASCADE,

    permission_id BIGINT NOT NULL
        REFERENCES admin_permissions(id) ON DELETE CASCADE,

    granted_by_admin_id BIGINT
        REFERENCES admins(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (admin_id, permission_id)
);


-- 4. ADMIN INVITATIONS
CREATE TABLE IF NOT EXISTS admin_invitations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    email VARCHAR(150) NOT NULL,
    name VARCHAR(100) NOT NULL,

    token_hash CHAR(64) NOT NULL UNIQUE,

    invited_by_admin_id BIGINT NOT NULL
        REFERENCES admins(id) ON DELETE RESTRICT,

    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_invitations_email_idx
ON admin_invitations (LOWER(email));


-- 5. ADMIN LOGIN OTP
-- Separate from customer OTP verification.
CREATE TABLE IF NOT EXISTS admin_auth_verifications (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    admin_id BIGINT NOT NULL UNIQUE
        REFERENCES admins(id) ON DELETE CASCADE,

    otp_hash CHAR(64) NOT NULL,
    otp_expires_at TIMESTAMPTZ NOT NULL,

    attempts INTEGER NOT NULL DEFAULT 0
        CHECK (attempts BETWEEN 0 AND 5),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 6. ADMIN AUDIT LOGS
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    actor_admin_id BIGINT
        REFERENCES admins(id) ON DELETE SET NULL,

    action VARCHAR(100) NOT NULL,

    target_admin_id BIGINT
        REFERENCES admins(id) ON DELETE SET NULL,

    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_idx
ON admin_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_logs_actor_idx
ON admin_audit_logs (actor_admin_id);


-- 7. PROTECT THE OWNER ACCOUNT
CREATE OR REPLACE FUNCTION protect_admin_owner()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' AND OLD.role = 'owner' THEN
        RAISE EXCEPTION 'The Owner account cannot be deleted.';
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD.role = 'owner'
       AND NEW.role <> 'owner' THEN
        RAISE EXCEPTION 'The Owner role cannot be changed.';
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_admin_owner_trigger ON admins;

CREATE TRIGGER protect_admin_owner_trigger
BEFORE UPDATE OR DELETE ON admins
FOR EACH ROW
EXECUTE FUNCTION protect_admin_owner();


COMMIT;
