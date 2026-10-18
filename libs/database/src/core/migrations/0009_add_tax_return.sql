CREATE TYPE "public"."tax_advance_kind" AS ENUM('social', 'health', 'tax');--> statement-breakpoint
CREATE TABLE "tax_advance" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tax_return_guid" uuid NOT NULL,
	"month" smallint NOT NULL,
	"kind" "tax_advance_kind" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	CONSTRAINT "tax_advance_month_range" CHECK ("tax_advance"."month" between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "tax_return" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_guid" uuid NOT NULL,
	"year" integer NOT NULL,
	"closed_at" timestamp with time zone,
	"income_override" numeric(12, 2),
	"expense_rate_pct" numeric(5, 2) DEFAULT 60 NOT NULL,
	"tax_rate_pct" numeric(5, 2) DEFAULT 15 NOT NULL,
	"assessment_base_pct" numeric(5, 2) DEFAULT 55 NOT NULL,
	"social_rate_pct" numeric(5, 2) DEFAULT 29.2 NOT NULL,
	"health_rate_pct" numeric(5, 2) DEFAULT 13.5 NOT NULL,
	"social_min" numeric(12, 2) DEFAULT 57108 NOT NULL,
	"health_min" numeric(12, 2) DEFAULT 37716 NOT NULL,
	"basic_discount" numeric(12, 2) DEFAULT 30840 NOT NULL,
	"spouse_discount" numeric(12, 2) DEFAULT 24840 NOT NULL,
	"child_discount" numeric(12, 2) DEFAULT 35664 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tax_advance" ADD CONSTRAINT "tax_advance_tax_return_guid_tax_return_guid_fk" FOREIGN KEY ("tax_return_guid") REFERENCES "public"."tax_return"("guid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_return" ADD CONSTRAINT "tax_return_account_guid_account_guid_fk" FOREIGN KEY ("account_guid") REFERENCES "public"."account"("guid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_tax_advance" ON "tax_advance" USING btree ("tax_return_guid","month","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_tax_return" ON "tax_return" USING btree ("account_guid","year");