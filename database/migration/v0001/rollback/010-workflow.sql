DROP VIEW "vw_last_workflow_tick";
DROP TRIGGER "workflow_tick__block_any_update" ON "workflow_tick";
DROP TRIGGER "workflow_tick__latest_breakpoint_inserter" ON "workflow_tick";
DROP FUNCTION "tr_workflow_tick_latest_breakpoint_inserter"();
DROP TABLE "workflow_tick";
DROP TRIGGER "workflow__block_any_update" ON "workflow";
DROP TABLE "workflow";
DROP TYPE "WORKFLOW_STATUS";
DROP FUNCTION "tr_block_any_updates"();
