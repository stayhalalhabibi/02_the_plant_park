
BEGIN;

-- Update the existing Owner protection function.
CREATE OR REPLACE FUNCTION protect_admin_owner()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent deleting the Owner account.
    IF TG_OP = 'DELETE' AND OLD.role = 'owner' THEN
        RAISE EXCEPTION 'The Owner account cannot be deleted.';
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.role = 'owner' THEN

        -- Prevent changing the Owner role.
        IF NEW.role <> 'owner' THEN
            RAISE EXCEPTION 'The Owner role cannot be changed.';
        END IF;

        -- Prevent suspending the Owner account.
        IF NEW.status <> 'active' THEN
            RAISE EXCEPTION 'The Owner account cannot be suspended.';
        END IF;

    END IF;

    RETURN CASE
        WHEN TG_OP = 'DELETE' THEN OLD
        ELSE NEW
    END;
END;
$$ LANGUAGE plpgsql;

COMMIT;
