CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"advertiser_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"stripe_payment_intent_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_webhook_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "balance_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "earnings_ledger" ADD COLUMN "payout_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_advertiser_id_advertisers_id_fk" FOREIGN KEY ("advertiser_id") REFERENCES "public"."advertisers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_advertiser_id_idx" ON "payments" USING btree ("advertiser_id");--> statement-breakpoint
CREATE INDEX "payments_campaign_id_idx" ON "payments" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_payment_intent_uq" ON "payments" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
ALTER TABLE "earnings_ledger" ADD CONSTRAINT "earnings_ledger_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "earnings_payout_id_idx" ON "earnings_ledger" USING btree ("payout_id");