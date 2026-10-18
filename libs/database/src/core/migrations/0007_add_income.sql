CREATE TYPE "public"."income_type" AS ENUM('employee', 'self_employed');--> statement-breakpoint
CREATE TABLE "income_month" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"income_year_guid" uuid NOT NULL,
	"month" smallint NOT NULL,
	"gross_salary" numeric(12, 2) DEFAULT 0 NOT NULL,
	"net_salary" numeric(12, 2),
	"hourly_rate" numeric(12, 2) DEFAULT 0 NOT NULL,
	"working_days" smallint NOT NULL,
	"vacation_days" numeric(4, 1) DEFAULT 0 NOT NULL,
	"expected_invoice" numeric(12, 2) DEFAULT 0 NOT NULL,
	CONSTRAINT "income_month_month_range" CHECK ("income_month"."month" between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "income_year" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_guid" uuid NOT NULL,
	"year" integer NOT NULL,
	"type" "income_type" NOT NULL,
	"default_hourly_rate" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "income_month" ADD CONSTRAINT "income_month_income_year_guid_income_year_guid_fk" FOREIGN KEY ("income_year_guid") REFERENCES "public"."income_year"("guid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_year" ADD CONSTRAINT "income_year_account_guid_account_guid_fk" FOREIGN KEY ("account_guid") REFERENCES "public"."account"("guid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_income_month" ON "income_month" USING btree ("income_year_guid","month");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_income_year" ON "income_year" USING btree ("account_guid","year");