CREATE TABLE "social_research_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"identifier" text NOT NULL,
	"name" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"last_requested_at" timestamp with time zone,
	"refreshed_at" timestamp with time zone,
	"refresh_lease_until" timestamp with time zone,
	"last_error" text,
	"archived_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_research_account_platform" CHECK ("platform" in ('facebook','instagram')),
	CONSTRAINT "social_research_account_identifier" CHECK (("platform"='facebook' and "identifier" ~ '^[0-9]{1,40}$') or ("platform"='instagram' and "identifier" ~ '^[a-z0-9_][a-z0-9_.]{0,29}$')),
	CONSTRAINT "social_research_account_version" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE TABLE "social_research_connections" (
	"workspace_id" uuid PRIMARY KEY,
	"access_token_sealed" text,
	"expires_at" timestamp with time zone,
	"scopes" jsonb DEFAULT '[]' NOT NULL,
	"sources" jsonb DEFAULT '[]' NOT NULL,
	"connected_by_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_research_connection_revision" CHECK ("revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "social_research_snapshots" (
	"id" uuid PRIMARY KEY,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"source_id" text,
	"status" text NOT NULL,
	"connection_revision" integer NOT NULL,
	"data" jsonb,
	"safe_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_research_snapshot_status" CHECK ("status" in ('running','succeeded','failed')),
	CONSTRAINT "social_research_snapshot_result" CHECK (("status"='succeeded') = ("data" is not null)),
	CONSTRAINT "social_research_snapshot_completion" CHECK (("status"='running') = ("completed_at" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "social_research_account_tenant_unique" ON "social_research_accounts" ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_research_account_identity_unique" ON "social_research_accounts" ("workspace_id","platform","identifier");--> statement-breakpoint
CREATE INDEX "social_research_account_workspace_active_index" ON "social_research_accounts" ("workspace_id","archived_at","created_at");--> statement-breakpoint
CREATE INDEX "social_research_snapshot_account_created_index" ON "social_research_snapshots" ("workspace_id","account_id","created_at");--> statement-breakpoint
ALTER TABLE "social_research_accounts" ADD CONSTRAINT "social_research_accounts_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "social_research_accounts" ADD CONSTRAINT "social_research_accounts_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "social_research_connections" ADD CONSTRAINT "social_research_connections_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "social_research_connections" ADD CONSTRAINT "social_research_connections_connected_by_user_id_users_id_fkey" FOREIGN KEY ("connected_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "social_research_snapshots" ADD CONSTRAINT "social_research_snapshots_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "social_research_snapshots" ADD CONSTRAINT "social_research_snapshot_tenant_account_fk" FOREIGN KEY ("account_id","workspace_id") REFERENCES "social_research_accounts"("id","workspace_id");