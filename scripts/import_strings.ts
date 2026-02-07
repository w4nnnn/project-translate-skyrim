import { db, dialogFiles, dialogStrings } from '../lib/db';
import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';
import * as path from 'path';
import { eq } from 'drizzle-orm';

const RAW_STRINGS_DIR = path.join(__dirname, '../raw_strings');

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseTagValue: true,
    processEntities: true,
    trimValues: false // Keep spaces
});

async function importFile(filePath: string) {
    console.log(`Processing ${filePath}...`);
    const xmlContent = fs.readFileSync(filePath, 'utf-8');
    const result = parser.parse(xmlContent);

    if (!result.SSTXMLRessources) {
        console.error('Invalid XML structure');
        return;
    }

    const params = result.SSTXMLRessources.Params;
    const content = result.SSTXMLRessources.Content;
    const strings = Array.isArray(content.String) ? content.String : [content.String];

    const filename = path.basename(filePath);

    // Check if file exists in DB
    const existingFiles = await db.select().from(dialogFiles).where(eq(dialogFiles.filename, filename)).limit(1);
    let fileRecord = existingFiles[0];

    if (fileRecord) {
        console.log(`Updating existing file record for ${filename}`);
        // Initialize update if needed, but for now we might want to just clear associated strings and re-insert
        // Or we could perform an update on the file record itself
        await db.update(dialogFiles).set({
            addon: params.Addon,
            sourceLang: params.Source,
            destLang: params.Dest,
            version: params.Version
        }).where(eq(dialogFiles.id, fileRecord.id));

        // Delete existing strings to replace them
        await db.delete(dialogStrings).where(eq(dialogStrings.fileId, fileRecord.id));
    } else {
        console.log(`Creating new file record for ${filename}`);
        const res = await db.insert(dialogFiles).values({
            filename: filename,
            addon: params.Addon,
            sourceLang: params.Source,
            destLang: params.Dest,
            version: params.Version
        }).returning();
        fileRecord = res[0];
    }

    const batchSize = 1000;
    for (let i = 0; i < strings.length; i += batchSize) {
        const batch = strings.slice(i, i + batchSize).map((s: any) => ({
            fileId: fileRecord!.id,
            sId: s.sID,
            listId: s.List,
            source: s.Source,
            dest: ''
        }));
        await db.insert(dialogStrings).values(batch);
    }

    console.log(`Imported ${strings.length} strings from ${filename}`);
}

async function main() {
    const files = fs.readdirSync(RAW_STRINGS_DIR).filter(file => file.endsWith('.xml'));

    for (const file of files) {
        await importFile(path.join(RAW_STRINGS_DIR, file));
    }
    console.log('Done!');
}

main().catch(console.error);
