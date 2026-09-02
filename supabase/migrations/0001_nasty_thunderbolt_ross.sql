ALTER TABLE "trusted_devices" ADD COLUMN "expo_push_token" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "stage" "leave_request_status";--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_leave_stage_recipient_key" ON "notifications" USING btree ("related_leave_request_id","recipient_id","stage");