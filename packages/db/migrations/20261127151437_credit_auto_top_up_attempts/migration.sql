ALTER TABLE "credit_accounts" ADD COLUMN "auto_top_up_attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD COLUMN "auto_top_up_payment_method_id" text;--> statement-breakpoint
ALTER TABLE "credit_top_ups" ADD COLUMN "reversed" numeric DEFAULT '0' NOT NULL;
