ALTER TABLE "chats" ADD COLUMN "compact_at" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "chat_compact_at" integer;