CREATE FUNCTION "tr_block_any_updates"() RETURNS trigger LANGUAGE 'plpgsql' AS $BODY$ BEGIN
	RAISE EXCEPTION 'Update for the table is not allowed';
END;$BODY$;

CREATE TYPE "WORKFLOW_STATUS" AS ENUM (
	'WORKING','SLEEPING','CRASHED','TERMINATED'
);

CREATE SEQUENCE "workflow_id_seq" START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE TABLE "workflow" (
	"id" BIGINT NOT NULL DEFAULT nextval('"workflow_id_seq"'),
	"workflow_uuid" UUID NOT NULL,
	"activity_uuid" UUID NOT NULL,
	"activity_version" VARCHAR(512) NOT NULL,
	"utc_created_at" TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
	CONSTRAINT "uq__workflow__workflow_uuid" UNIQUE ("workflow_uuid")
);

ALTER SEQUENCE "workflow_id_seq" OWNED BY "workflow"."id";

CREATE TRIGGER "workflow__block_any_update"
	BEFORE UPDATE ON "workflow"
	FOR EACH ROW
	EXECUTE PROCEDURE "tr_block_any_updates"();

CREATE SEQUENCE "workflow_tick_id_seq" START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE TABLE "workflow_tick" (
	"id" BIGINT NOT NULL DEFAULT nextval('"workflow_tick_id_seq"'),
	"prev_tick_id" BIGINT NULL REFERENCES "workflow_tick" ("id"),
	"workflow_id" BIGINT REFERENCES "workflow" ("id"),
	"workflow_virtual_machine_snapshot" JSONB NULL,
	"workflow_status" "WORKFLOW_STATUS" NOT NULL,
	"latest_breakpoint" VARCHAR(128) NULL,
	"crash_report" VARCHAR(1024) NULL,
	"utc_executed_at" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	"next_tick_tags" VARCHAR(1024) NULL,
	CONSTRAINT "uq__workflow_tick__one_tick_per_date" UNIQUE ("workflow_id", "utc_executed_at"),
	CONSTRAINT "uq__workflow_tick__single_prev_tick_id_per_workflow" UNIQUE ("prev_tick_id", "workflow_id")
);

ALTER SEQUENCE "workflow_tick_id_seq" OWNED BY "workflow_tick"."id";

CREATE FUNCTION "tr_workflow_tick_latest_breakpoint_inserter"()
RETURNS trigger LANGUAGE 'plpgsql' AS $BODY$
BEGIN
	IF (NEW."latest_breakpoint" IS NULL) THEN
		SELECT "latest_breakpoint" INTO NEW."latest_breakpoint"
		FROM "workflow_tick"
		WHERE "workflow_id" = NEW."workflow_id" AND "latest_breakpoint" IS NOT NULL
		ORDER BY "utc_executed_at" DESC;
	END IF;
	RETURN NEW;
END;$BODY$;

CREATE TRIGGER "workflow_tick__latest_breakpoint_inserter" BEFORE INSERT ON "workflow_tick"
FOR EACH ROW EXECUTE PROCEDURE "tr_workflow_tick_latest_breakpoint_inserter"();

CREATE TRIGGER "workflow_tick__block_any_update" BEFORE UPDATE ON "workflow_tick"
FOR EACH ROW EXECUTE PROCEDURE "tr_block_any_updates"();

CREATE VIEW "vw_last_workflow_tick" AS
	SELECT	
		WT."id",
		W."workflow_uuid",
		WT."prev_tick_id",
		WT."workflow_id",
		WT."workflow_virtual_machine_snapshot",
		WT."workflow_status",
		WT."latest_breakpoint",
		WT."crash_report",
		WT."utc_executed_at",
		WT."next_tick_tags"
	FROM (
		SELECT 
			DISTINCT ON ("workflow_id")
			"id",
			"prev_tick_id",
			"workflow_id",
			"workflow_virtual_machine_snapshot",
			"workflow_status",
			"latest_breakpoint",
			"crash_report" ,
			"utc_executed_at",
			"next_tick_tags"
		FROM "workflow_tick"
		ORDER BY "workflow_id", "utc_executed_at" DESC
	) AS WT
	INNER JOIN "workflow" AS W ON W."id" = WT."workflow_id";
