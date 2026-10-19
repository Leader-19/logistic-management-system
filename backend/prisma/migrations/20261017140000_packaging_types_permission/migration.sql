INSERT INTO "permissions" ("id", "resource", "action", "description")
VALUES (gen_random_uuid(), 'packaging.types', 'manage', 'Manage package types')
ON CONFLICT ("resource", "action") DO NOTHING;
