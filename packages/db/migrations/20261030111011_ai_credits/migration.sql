CREATE TABLE "credit_accounts" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"auto_top_up_amount" numeric DEFAULT '20' NOT NULL,
	"auto_top_up_enabled" boolean DEFAULT false NOT NULL,
	"auto_top_up_failed_at" timestamp with time zone,
	"auto_top_up_threshold" numeric DEFAULT '5' NOT NULL,
	"balance" numeric(14,8) DEFAULT '0' NOT NULL,
	"user_id" uuid NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "credit_top_ups" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"amount" numeric NOT NULL,
	"automatic" boolean NOT NULL,
	"stripe_payment_intent_id" text NOT NULL UNIQUE,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE INDEX "credit_top_ups_user_id_created_at_index" ON "credit_top_ups" ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credit_top_ups" ADD CONSTRAINT "credit_top_ups_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;