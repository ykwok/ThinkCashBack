ALTER TABLE "campaigns" ADD COLUMN "spent_today_millicents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "earnings_ledger" ADD COLUMN "gross_millicents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "earnings_ledger" ADD COLUMN "dev_share_millicents" bigint DEFAULT 0 NOT NULL;