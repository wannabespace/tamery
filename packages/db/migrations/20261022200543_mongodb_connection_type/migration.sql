ALTER TYPE "connection_type" ADD VALUE IF NOT EXISTS 'mongodb';--> statement-breakpoint
ALTER TYPE "provider" ADD VALUE IF NOT EXISTS 'mongodb_atlas' BEFORE 'turso';