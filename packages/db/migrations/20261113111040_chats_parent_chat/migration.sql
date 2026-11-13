ALTER TABLE "chats" ADD COLUMN "parent_chat_id" uuid;--> statement-breakpoint
CREATE INDEX "chats_parent_chat_id_index" ON "chats" ("parent_chat_id");--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_parent_chat_id_chats_id_fkey" FOREIGN KEY ("parent_chat_id") REFERENCES "chats"("id") ON DELETE CASCADE;