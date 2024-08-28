CREATE TABLE `document_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text,
	`text` text,
	`session_id` text,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE CASCADE
);

--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`text_content` text,
	`size` integer,
	`session_id` text,
	`r2_url` text
);

--> statement-breakpoint
CREATE VIRTUAL TABLE document_chunks_fts USING fts5(
	id UNINDEXED,
	document_id UNINDEXED,
	text,
	session_id UNINDEXED,
	content = 'document_chunks'
);

CREATE TRIGGER document_chunks_ai
AFTER
INSERT
	ON document_chunks BEGIN
INSERT INTO
	document_chunks_fts(id, document_id, text, session_id)
VALUES
	(
		new.id,
		new.document_id,
		new.text,
		new.session_id
	);

END;