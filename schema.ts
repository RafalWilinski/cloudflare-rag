import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const documents = sqliteTable('documents', {
  id: integer('id').primaryKey(),
  name: text('name'),
  textContent: text('text_content'),
  sessionId: text('session_id'),
  r2Url: text('r2_url'),
}, (documents) => ({
  nameIdx: uniqueIndex('nameIdx').on(documents.name),
})
);

export const documentChunks = sqliteTable('document_chunks', {
  id: integer('id').primaryKey(),
  documentId: integer('document_id').references(() => documents.id),
  text: text('text'),
  sessionId: text('session_id'),
}, (documentChunks) => ({
  documentIdIdx: uniqueIndex('documentIdIdx').on(documentChunks.documentId),
}));