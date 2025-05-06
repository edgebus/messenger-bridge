GRANT SELECT, INSERT       ON TABLE    "workflow"              TO "{{database.user.messengerbridge}}";
GRANT SELECT, INSERT       ON TABLE    "workflow_tick"         TO "{{database.user.messengerbridge}}";
GRANT SELECT               ON TABLE    "vw_last_workflow_tick" TO "{{database.user.messengerbridge}}";

GRANT SELECT               ON TABLE    "workflow"              TO "{{database.user.readonly}}";
GRANT SELECT               ON TABLE    "workflow_tick"         TO "{{database.user.readonly}}";
GRANT SELECT               ON TABLE    "vw_last_workflow_tick" TO "{{database.user.readonly}}";
