CREATE TABLE "social_research_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slot" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_category_slot_valid" CHECK ("slot" between 1 and 50),
	CONSTRAINT "research_category_name_valid" CHECK (length(btrim("name")) between 1 and 80 and "name"=btrim("name")),
	CONSTRAINT "research_category_version_positive" CHECK ("version">0)
);
--> statement-breakpoint
ALTER TABLE "social_research_accounts" ADD COLUMN "category_id" uuid;--> statement-breakpoint
CREATE INDEX "research_account_category_index" ON "social_research_accounts" ("workspace_id","category_id","archived_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "research_category_tenant_unique" ON "social_research_categories" ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "research_category_slot_unique" ON "social_research_categories" ("workspace_id","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "research_category_name_unique" ON "social_research_categories" ("workspace_id",lower("name"));--> statement-breakpoint
ALTER TABLE "social_research_accounts" ADD CONSTRAINT "research_account_category_tenant_fk" FOREIGN KEY ("category_id","workspace_id") REFERENCES "social_research_categories"("id","workspace_id");--> statement-breakpoint
ALTER TABLE "social_research_categories" ADD CONSTRAINT "social_research_categories_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;
--> statement-breakpoint
INSERT INTO social_research_categories(workspace_id,name,slot)
SELECT w.id, defaults.name, defaults.slot FROM workspaces w
CROSS JOIN (VALUES ('Competitors',1),('Inspiration',2),('Industry insights',3)) defaults(name,slot);
