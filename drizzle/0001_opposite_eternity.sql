CREATE TABLE "ingestion_locks" (
	"name" text PRIMARY KEY NOT NULL,
	"held_until" timestamp with time zone NOT NULL
);
