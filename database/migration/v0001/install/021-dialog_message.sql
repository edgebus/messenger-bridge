CREATE TABLE "dialog_message" (
	"uuid"             UUID                        NOT NULL DEFAULT uuid_generate_v4(),
	"dialog_uuid"      UUID                        NOT NULL,
	"text"             TEXT                        NOT NULL,
	"utc_created_at"   TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
	"utc_processed_at" TIMESTAMP WITHOUT TIME ZONE     NULL,

	CONSTRAINT "pk__dialog_message" PRIMARY KEY ("uuid"),

	CONSTRAINT "fk__dialog_message__dialog"
	FOREIGN KEY ("dialog_uuid")
	REFERENCES "dialog" ("uuid")
);

GRANT SELECT, INSERT, UPDATE("utc_processed_at")  ON TABLE    "dialog_message"    TO "{{database.user.messengerbridge}}";

GRANT SELECT                                      ON TABLE    "dialog_message"    TO "{{database.user.readonly}}";
