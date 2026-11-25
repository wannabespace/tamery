CREATE TABLE "subscription_seats" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" text NOT NULL,
	"normalized_email" text NOT NULL,
	"subscription_id" uuid NOT NULL,
	CONSTRAINT "subscription_seats_subscription_id_normalized_email_unique" UNIQUE("subscription_id","normalized_email")
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "seats" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX "subscription_seats_normalized_email_index" ON "subscription_seats" ("normalized_email");--> statement-breakpoint
ALTER TABLE "subscription_seats" ADD CONSTRAINT "subscription_seats_subscription_id_subscriptions_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE;