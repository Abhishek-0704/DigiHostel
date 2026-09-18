CREATE TABLE "device_registration_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid NOT NULL,
	"platform" "device_platform" NOT NULL,
	"nonce" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "device_registration_challenges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "device_registration_challenges" ADD CONSTRAINT "device_registration_challenges_parent_id_parents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drc_parent_id_idx" ON "device_registration_challenges" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "drc_expires_at_idx" ON "device_registration_challenges" USING btree ("expires_at");