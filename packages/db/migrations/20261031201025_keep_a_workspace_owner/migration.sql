CREATE FUNCTION "keep_a_workspace_owner"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	-- Better Auth counts owners before removing or demoting one, without a lock: two owners leaving at once both still see the other. Locking the workspace row makes those changes check one after the other, and each check runs on a fresh snapshot.
	PERFORM 1 FROM "workspaces" WHERE "id" = OLD."workspace_id" FOR NO KEY UPDATE;
	IF FOUND
		AND EXISTS (SELECT 1 FROM "members" WHERE "workspace_id" = OLD."workspace_id")
		AND NOT EXISTS (SELECT 1 FROM "members" WHERE "workspace_id" = OLD."workspace_id" AND "role" = 'owner')
	THEN
		RAISE EXCEPTION 'Workspace % would be left without an owner', OLD."workspace_id" USING ERRCODE = 'check_violation';
	END IF;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "keep_a_workspace_owner" AFTER UPDATE OF "role" OR DELETE ON "members" FOR EACH ROW WHEN (OLD."role" = 'owner') EXECUTE FUNCTION "keep_a_workspace_owner"();
