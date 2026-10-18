CREATE TABLE "savings_goal" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_guid" uuid NOT NULL,
	"name" varchar NOT NULL,
	"current_balance" numeric(12, 2) DEFAULT 0 NOT NULL,
	"balance_date" date NOT NULL,
	"target_amount" numeric(12, 2) NOT NULL,
	"target_month" date NOT NULL,
	"note" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "savings_goal" ADD CONSTRAINT "savings_goal_account_guid_account_guid_fk" FOREIGN KEY ("account_guid") REFERENCES "public"."account"("guid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "savings_goal_account_guid_idx" ON "savings_goal" USING btree ("account_guid");