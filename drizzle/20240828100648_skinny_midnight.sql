CREATE TABLE `document_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` integer,
	`text` text,
	`session_id` text,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`text_content` text,
	`session_id` text,
	`r2_url` text
);

--> statement-breakpoint
CREATE VIRTUAL TABLE `document_chunks_fts` USING fts5(`text`);

CREATE TRIGGER document_chunks_after_insert
AFTER
INSERT
	ON document_chunks BEGIN
INSERT INTO
	document_chunks_fts(docid, id, title, body)
SELECT
	rowid,
	id,
	title,
	body
FROM
	document_chunks
WHERE
	is_conflict = 0
	AND encryption_applied = 0
	AND new.rowid = document_chunks.rowid;

END;