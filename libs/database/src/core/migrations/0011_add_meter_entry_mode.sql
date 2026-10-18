CREATE TYPE "public"."meter_entry_mode" AS ENUM('state', 'increment');--> statement-breakpoint
ALTER TABLE "meter_sheet" ADD COLUMN "entry_mode" "meter_entry_mode" DEFAULT 'state' NOT NULL;