-- A newer updated_at makes every device's catch-up fetch the new name.
UPDATE "workspaces"
SET "name" = 'Personal', "slug" = 'personal-' || "id", "updated_at" = now()
WHERE "metadata" LIKE '%"default":true%' AND "name" LIKE '%''s workspace';
