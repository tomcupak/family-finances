CREATE TABLE "payee" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_guid" uuid NOT NULL,
	"name" varchar NOT NULL,
	"bank_account" varchar,
	"variable_symbol" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payee_payment" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payee_guid" uuid NOT NULL,
	"month" date NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expense" ADD COLUMN "payee_guid" uuid;--> statement-breakpoint
ALTER TABLE "payee" ADD CONSTRAINT "payee_account_guid_account_guid_fk" FOREIGN KEY ("account_guid") REFERENCES "public"."account"("guid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payee_payment" ADD CONSTRAINT "payee_payment_payee_guid_payee_guid_fk" FOREIGN KEY ("payee_guid") REFERENCES "public"."payee"("guid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_payee_name" ON "payee" USING btree ("account_guid","name");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_payee_payment_month" ON "payee_payment" USING btree ("payee_guid","month");--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_payee_guid_payee_guid_fk" FOREIGN KEY ("payee_guid") REFERENCES "public"."payee"("guid") ON DELETE set null ON UPDATE no action;