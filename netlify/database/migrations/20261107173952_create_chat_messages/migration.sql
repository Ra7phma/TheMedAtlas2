CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"text" text NOT NULL,
	"ip_hash" text NOT NULL,
	"reports" integer DEFAULT 0 NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "chat_messages_ip_created_idx" ON "chat_messages" ("ip_hash","created_at");