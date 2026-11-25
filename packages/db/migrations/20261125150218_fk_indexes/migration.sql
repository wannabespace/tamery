SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE INDEX "ai_usage_chat_id_index" ON "ai_usage" ("chat_id");--> statement-breakpoint
CREATE INDEX "ai_usage_workspace_id_index" ON "ai_usage" ("workspace_id");--> statement-breakpoint
CREATE INDEX "connection_machines_connection_id_index" ON "connection_machines" ("connection_id");--> statement-breakpoint
CREATE INDEX "connections_user_id_index" ON "connections" ("user_id");--> statement-breakpoint
CREATE INDEX "queries_user_id_index" ON "queries" ("user_id");--> statement-breakpoint
CREATE INDEX "queries_connection_resource_id_index" ON "queries" ("connection_resource_id");