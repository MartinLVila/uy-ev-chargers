CREATE TABLE "connector_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"station_id" integer NOT NULL,
	"connector_type" text NOT NULL,
	"power_kw" double precision NOT NULL,
	"has_cable" boolean NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connector_states" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"connector_group_id" integer NOT NULL,
	"status_code" integer,
	"status_detail" text NOT NULL,
	"health" text NOT NULL,
	"connector_count" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "poll_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL,
	"outcome" text NOT NULL,
	"http_status" integer,
	"station_count" integer,
	"connector_count" integer,
	"payload_digest" text,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "station_states" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"station_id" integer NOT NULL,
	"state" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"coord_key" text NOT NULL,
	"name_key" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"city" text,
	"department" text NOT NULL,
	"department_raw" text,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"source" text,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connector_groups" ADD CONSTRAINT "connector_groups_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_states" ADD CONSTRAINT "connector_states_connector_group_id_connector_groups_id_fk" FOREIGN KEY ("connector_group_id") REFERENCES "public"."connector_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_states" ADD CONSTRAINT "station_states_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connector_groups_identity_key" ON "connector_groups" USING btree ("station_id","connector_type","power_kw","has_cable");--> statement-breakpoint
CREATE INDEX "connector_groups_station_idx" ON "connector_groups" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "connector_states_group_idx" ON "connector_states" USING btree ("connector_group_id","started_at");--> statement-breakpoint
CREATE INDEX "connector_states_open_idx" ON "connector_states" USING btree ("connector_group_id") WHERE ended_at IS NULL;--> statement-breakpoint
CREATE INDEX "connector_states_window_idx" ON "connector_states" USING btree ("started_at","ended_at");--> statement-breakpoint
CREATE INDEX "connector_states_health_idx" ON "connector_states" USING btree ("health");--> statement-breakpoint
CREATE INDEX "poll_runs_started_at_idx" ON "poll_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "poll_runs_digest_idx" ON "poll_runs" USING btree ("payload_digest");--> statement-breakpoint
CREATE INDEX "station_states_station_idx" ON "station_states" USING btree ("station_id","started_at");--> statement-breakpoint
CREATE INDEX "station_states_open_idx" ON "station_states" USING btree ("station_id") WHERE ended_at IS NULL;--> statement-breakpoint
CREATE INDEX "station_states_window_idx" ON "station_states" USING btree ("started_at","ended_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stations_slug_key" ON "stations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "stations_coord_key" ON "stations" USING btree ("coord_key");--> statement-breakpoint
CREATE INDEX "stations_name_key_idx" ON "stations" USING btree ("name_key");--> statement-breakpoint
CREATE INDEX "stations_department_idx" ON "stations" USING btree ("department");