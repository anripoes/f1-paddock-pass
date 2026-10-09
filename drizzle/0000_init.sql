CREATE TYPE "public"."ticket_status" AS ENUM('held', 'confirmed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TABLE "grand_prix" (
	"id" text PRIMARY KEY NOT NULL,
	"season" smallint NOT NULL,
	"round" smallint NOT NULL,
	"name" text NOT NULL,
	"circuit_name" text NOT NULL,
	"country" text NOT NULL,
	"race_date" date NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"row" smallint NOT NULL,
	"number" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "section" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grand_prix_id" text NOT NULL,
	"name" text NOT NULL,
	"price_cents" integer NOT NULL,
	"rows" smallint NOT NULL,
	"seats_per_row" smallint NOT NULL,
	CONSTRAINT "section_price_positive" CHECK ("section"."price_cents" > 0),
	CONSTRAINT "section_layout_positive" CHECK ("section"."rows" > 0 AND "section"."seats_per_row" > 0)
);
--> statement-breakpoint
CREATE TABLE "ticket" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seat_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"hold_group" uuid NOT NULL,
	"status" "ticket_status" DEFAULT 'held' NOT NULL,
	"price_cents" integer NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "ticket_hold_has_expiry" CHECK ("ticket"."status" <> 'held' OR "ticket"."expires_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"favorite_constructor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "seat" ADD CONSTRAINT "seat_section_id_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."section"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section" ADD CONSTRAINT "section_grand_prix_id_grand_prix_id_fk" FOREIGN KEY ("grand_prix_id") REFERENCES "public"."grand_prix"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_seat_id_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seat"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "grand_prix_season_round_uq" ON "grand_prix" USING btree ("season","round");--> statement-breakpoint
CREATE UNIQUE INDEX "seat_section_row_number_uq" ON "seat" USING btree ("section_id","row","number");--> statement-breakpoint
CREATE UNIQUE INDEX "section_gp_name_uq" ON "section" USING btree ("grand_prix_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_one_active_per_seat_uq" ON "ticket" USING btree ("seat_id") WHERE "ticket"."status" IN ('held', 'confirmed');--> statement-breakpoint
CREATE INDEX "ticket_user_created_idx" ON "ticket" USING btree ("user_id","created_at" DESC NULLS LAST);