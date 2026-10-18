CREATE TABLE "expense_utility_price" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_guid" uuid NOT NULL,
	"month" date NOT NULL,
	"unit_price_high" numeric(12, 4) NOT NULL,
	"unit_price_low" numeric(12, 4),
	"fixed_fee" numeric(12, 2) DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expense" ADD COLUMN "meter_sheet_guid" uuid;--> statement-breakpoint
ALTER TABLE "expense_utility_price" ADD CONSTRAINT "expense_utility_price_expense_guid_expense_guid_fk" FOREIGN KEY ("expense_guid") REFERENCES "public"."expense"("guid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_expense_utility_price_month" ON "expense_utility_price" USING btree ("expense_guid","month");--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_meter_sheet_guid_meter_sheet_guid_fk" FOREIGN KEY ("meter_sheet_guid") REFERENCES "public"."meter_sheet"("guid") ON DELETE set null ON UPDATE no action;