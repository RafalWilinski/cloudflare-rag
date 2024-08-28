import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  name: text('name'),
  textContent: text('text_content'),
  size: integer('size'),
  sessionId: text('session_id'),
  r2Url: text('r2_url'),
});

export const documentChunks = sqliteTable('document_chunks', {
  id: text('id').primaryKey(),
  documentId: text('document_id').references(() => documents.id),
  text: text('text'),
  sessionId: text('session_id'),
});