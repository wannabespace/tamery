CREATE TABLE "passkeys" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"aaguid" text,
	"backed_up" boolean NOT NULL,
	"counter" bigint NOT NULL,
	"credential_id" text NOT NULL UNIQUE,
	"device_type" text NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"transports" text,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE INDEX "passkeys_userId_idx" ON "passkeys" ("user_id");--> statement-breakpoint
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;