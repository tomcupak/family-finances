CREATE TABLE "expense_correction" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_guid" uuid NOT NULL,
	"for_month" date NOT NULL,
	"apply_month" date NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"note" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expense_correction" ADD CONSTRAINT "expense_correction_expense_guid_expense_guid_fk" FOREIGN KEY ("expense_guid") REFERENCES "public"."expense"("guid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_correction_expense_guid_idx" ON "expense_correction" USING btree ("expense_guid");--> statement-breakpoint
CREATE INDEX "expense_correction_apply_month_idx" ON "expense_correction" USING btree ("apply_month");