CREATE TABLE `document_chunks` (
	`id` integer PRIMARY KEY NOT NULL,
	`document_id` integer,
	`text` text,
	`session_id` text,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text,
	`text_content` text,
	`session_id` text,
	`r2_url` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documentIdIdx` ON `document_chunks` (`document_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `nameIdx` ON `documents` (`name`);
