CREATE TYPE "public"."utility_type" AS ENUM('electricity', 'water');--> statement-breakpoint
CREATE TABLE "utility_price" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utility" "utility_type" NOT NULL,
	"price_per_unit" numeric(10, 4) NOT NULL,
	"valid_from" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "utility_reading" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utility" "utility_type" NOT NULL,
	"reading_date" date NOT NULL,
	"meter_value" numeric(12, 3) NOT NULL,
	"note" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "unique_utility_price_valid_from" ON "utility_price" USING btree ("utility","valid_from");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_utility_reading_date" ON "utility_reading" USING btree ("utility","reading_date");