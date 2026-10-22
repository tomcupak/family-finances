CREATE TYPE "public"."electricity_price_mode" AS ENUM('fixed', 'spot');--> statement-breakpoint
CREATE TABLE "electricity_price_period" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_guid" uuid NOT NULL,
	"mode" "electricity_price_mode" NOT NULL,
	"date_from" date NOT NULL,
	"date_to" date,
	"vat_included" boolean NOT NULL,
	"unit_price" numeric(12, 4),
	"consumption_high" numeric(12, 3),
	"consumption_low" numeric(12, 3),
	"invoice_amount" numeric(12, 2),
	"note" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "electricity_supplier" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"location" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_electricity_supplier" UNIQUE NULLS NOT DISTINCT("name","location")
);
--> statement-breakpoint
ALTER TABLE "expense" ADD COLUMN "electricity_supplier_guid" uuid;--> statement-breakpoint
ALTER TABLE "electricity_price_period" ADD CONSTRAINT "electricity_price_period_supplier_guid_electricity_supplier_guid_fk" FOREIGN KEY ("supplier_guid") REFERENCES "public"."electricity_supplier"("guid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "electricity_price_period_supplier_guid_idx" ON "electricity_price_period" USING btree ("supplier_guid");--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_electricity_supplier_guid_electricity_supplier_guid_fk" FOREIGN KEY ("electricity_supplier_guid") REFERENCES "public"."electricity_supplier"("guid") ON DELETE set null ON UPDATE no action;