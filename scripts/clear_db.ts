
import { db, dialogFiles, dialogStrings, glossary } from '../lib/db';
import { sql } from 'drizzle-orm';

async function main() {
    console.log("⚠️  Clearing database...");

    try {
        await db.run(sql`BEGIN TRANSACTION`);

        console.log("Deleting strings...");
        await db.delete(dialogStrings);

        console.log("Deleting files...");
        await db.delete(dialogFiles);

        console.log("Deleting glossary...");
        await db.delete(glossary);

        await db.run(sql`COMMIT`);
        console.log("✅ Database cleared successfully.");
    } catch (e) {
        console.error("❌ Error clearing database:", e);
        try { await db.run(sql`ROLLBACK`); } catch { }
    }
}

main().catch(console.error);
