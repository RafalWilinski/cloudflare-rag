-- Create a temporary table with the desired structure
CREATE TABLE `temp_document_chunks` (
    `id` text PRIMARY KEY NOT NULL,
    `text` text,
    `session_id` text,
    `document_id` text
);

-- Copy data from the original table to the temporary table
INSERT INTO `temp_document_chunks` SELECT `id`, `text`, `session_id`, `document_id` FROM `document_chunks`;

-- Drop the original table
DROP TABLE `document_chunks`;

-- Rename the temporary table to the original table name
ALTER TABLE `temp_document_chunks` RENAME TO `document_chunks`;

CREATE VIRTUAL TABLE `document_chunks_fts` USING fts5(`text`);