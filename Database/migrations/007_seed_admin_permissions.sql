BEGIN;

INSERT INTO admin_permissions (permission_key, description)
VALUES
    ('manage_plants', 'Add, edit and remove plants'),
    ('manage_categories', 'Create and manage plant categories'),
    ('manage_orders', 'View and update customer orders'),
    ('manage_customers', 'View and manage customer accounts'),
    ('manage_inventory', 'Manage plant stock and inventory'),
    ('view_analytics', 'View website and sales analytics'),
    ('view_audit_logs', 'View administrative activity logs')
ON CONFLICT (permission_key) DO NOTHING;

COMMIT;