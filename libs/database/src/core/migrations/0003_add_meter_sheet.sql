CREATE TABLE "meter_reading" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_guid" uuid NOT NULL,
	"reading_date" date NOT NULL,
	"value_high" numeric(12, 3) NOT NULL,
	"value_low" numeric(12, 3),
	"note" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meter_sheet" (
	"guid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"utility" "utility_type" NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meter_reading" ADD CONSTRAINT "meter_reading_sheet_guid_meter_sheet_guid_fk" FOREIGN KEY ("sheet_guid") REFERENCES "public"."meter_sheet"("guid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_meter_reading_date" ON "meter_reading" USING btree ("sheet_guid","reading_date");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_meter_sheet_name" ON "meter_sheet" USING btree ("name");