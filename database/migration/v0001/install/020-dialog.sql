CREATE TABLE "dialog" (
	"uuid" UUID NOT NULL DEFAULT uuid_generate_v4(),
	"workflow_uuid" UUID NOT NULL,
	"messenger_name" VARCHAR(512) NOT NULL,
	"messenger_type" VARCHAR(32) NOT NULL,
	"messenger_chat_token" VARCHAR(2048) NOT NULL,
	"utc_created_at" TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),

	CONSTRAINT "pk__dialog" PRIMARY KEY ("uuid"),

	CONSTRAINT "fk__dialog__workflow"
	FOREIGN KEY ("workflow_uuid")
	REFERENCES "workflow" ("uuid")

	-- CONSTRAINT "uq__dialog__messenger_chat_token"
	-- UNIQUE ("messenger_chat_token")
);

GRANT SELECT, INSERT       ON TABLE    "dialog"    TO "{{database.user.messengerbridge}}";

GRANT SELECT               ON TABLE    "dialog"    TO "{{database.user.readonly}}";
