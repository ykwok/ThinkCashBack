CREATE TABLE "advertisers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"stripe_customer_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"advertiser_id" uuid NOT NULL,
	"headline" text NOT NULL,
	"target_url" text NOT NULL,
	"cpm_bid_cents" integer NOT NULL,
	"daily_budget_cents" integer NOT NULL,
	"spent_today_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"targeting_countries" text[] DEFAULT '{}'::text[] NOT NULL,
	"targeting_platforms" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "developers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_id" text NOT NULL,
	"email" text NOT NULL,
	"stripe_connect_id" text,
	"api_key_hash" text NOT NULL,
	"signing_secret_hash" text NOT NULL,
	"rev_share_bps" integer DEFAULT 8000 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" uuid NOT NULL,
	"machine_fingerprint" text NOT NULL,
	"device_pubkey" text,
	"platform" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "earnings_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"impressions_count" integer DEFAULT 0 NOT NULL,
	"gross_cents" bigint DEFAULT 0 NOT NULL,
	"dev_share_cents" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "impressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"nonce" text NOT NULL,
	"signature" text NOT NULL,
	"ip_hash" text,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"stripe_transfer_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_advertiser_id_advertisers_id_fk" FOREIGN KEY ("advertiser_id") REFERENCES "public"."advertisers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "earnings_ledger" ADD CONSTRAINT "earnings_ledger_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "earnings_ledger" ADD CONSTRAINT "earnings_ledger_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impressions" ADD CONSTRAINT "impressions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impressions" ADD CONSTRAINT "impressions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "advertisers_email_uq" ON "advertisers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "campaigns_advertiser_id_idx" ON "campaigns" USING btree ("advertiser_id");--> statement-breakpoint
CREATE INDEX "campaigns_status_bid_idx" ON "campaigns" USING btree ("status","cpm_bid_cents");--> statement-breakpoint
CREATE UNIQUE INDEX "developers_github_id_uq" ON "developers" USING btree ("github_id");--> statement-breakpoint
CREATE UNIQUE INDEX "developers_email_uq" ON "developers" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "developers_api_key_hash_uq" ON "developers" USING btree ("api_key_hash");--> statement-breakpoint
CREATE INDEX "devices_developer_id_idx" ON "devices" USING btree ("developer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_developer_fingerprint_uq" ON "devices" USING btree ("developer_id","machine_fingerprint");--> statement-breakpoint
CREATE INDEX "earnings_developer_id_idx" ON "earnings_ledger" USING btree ("developer_id");--> statement-breakpoint
CREATE INDEX "earnings_campaign_id_idx" ON "earnings_ledger" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "earnings_period_idx" ON "earnings_ledger" USING btree ("developer_id","period_start");--> statement-breakpoint
CREATE INDEX "impressions_device_id_idx" ON "impressions" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "impressions_campaign_id_idx" ON "impressions" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "impressions_device_nonce_uq" ON "impressions" USING btree ("device_id","nonce");--> statement-breakpoint
CREATE INDEX "impressions_created_at_idx" ON "impressions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "payouts_developer_id_idx" ON "payouts" USING btree ("developer_id");