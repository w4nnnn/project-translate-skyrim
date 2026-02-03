import { db, dialogFiles, dialogStrings } from '../lib/db';
import { XMLBuilder } from 'fast-xml-parser';
import * as fs from 'fs';
import * as path from 'path';
import { eq } from 'drizzle-orm';

const EXPORT_DIR = path.join(__dirname, '../exported_strings');

// Create export directory if it doesn't exist
if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR);
}

const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: true,
    processEntities: true,
    suppressBooleanAttributes: false
});

async function exportFile(fileRecord: typeof dialogFiles.$inferSelect) {
    console.log(`Exporting ${fileRecord.filename}...`);

    const strings = await db.select().from(dialogStrings).where(eq(dialogStrings.fileId, fileRecord.id));

    const xmlObj = {
        SSTXMLRessources: {
            Params: {
                Addon: fileRecord.addon,
                Source: fileRecord.sourceLang,
                Dest: fileRecord.destLang,
                Version: fileRecord.version
            },
            Content: {
                String: strings.map(s => ({
                    '@_List': s.listId,
                    '@_sID': s.sId,
                    Source: s.source,
                    Dest: s.dest
                }))
            }
        }
    };

    const xmlContent = builder.build(xmlObj);
    // Add <?xml ... ?> declaration manually if builder doesn't (fast-xml-parser builder usually doesn't add preamble by default unless configured)
    const finalXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${xmlContent}`;

    fs.writeFileSync(path.join(EXPORT_DIR, fileRecord.filename), finalXml, 'utf-8');
}

async function main() {
    const files = await db.select().from(dialogFiles);

    for (const file of files) {
        await exportFile(file);
    }
    console.log(`Exported ${files.length} files to ${EXPORT_DIR}`);
}

main().catch(console.error);
