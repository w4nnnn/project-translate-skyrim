import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const dialogFiles = sqliteTable('dialog_files', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    filename: text('filename').notNull().unique(),
    addon: text('addon'),
    sourceLang: text('source_lang'),
    destLang: text('dest_lang'),
    version: integer('version'),
});

export const dialogStrings = sqliteTable('dialog_strings', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    fileId: integer('file_id').references(() => dialogFiles.id).notNull(),
    sId: text('s_id').notNull(),
    listId: text('list_id').default('0'),
    source: text('source'),
    dest: text('dest'),
    maskedSource: text('masked_source'),
});

export const glossary = sqliteTable('glossary', {
    id: text('id').primaryKey(),
    term: text('term').notNull().unique(),
    category: text('category'),
});
