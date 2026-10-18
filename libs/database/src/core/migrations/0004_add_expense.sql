CREATE TYPE "public"."expense_category" AS ENUM('taxes', 'services', 'car', 'kids', 'other');--> statement-breakpoint
CREATE TYPE "public"."expense_recurrence" AS ENUM('once', 'monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TABLE "expense" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_guid" uuid NOT NULL,
	"name" varchar NOT NULL,
	"category" "expense_category" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"recurrence" "expense_recurrence" NOT NULL,
	"start_month" date NOT NULL,
	"end_month" date,
	"note" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_account_guid_account_guid_fk" FOREIGN KEY ("account_guid") REFERENCES "public"."account"("guid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_account_guid_idx" ON "expense" USING btree ("account_guid");