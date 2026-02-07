
import { db, dialogStrings, glossary } from '../lib/db';
import * as fs from 'fs';
import * as path from 'path';
import { eq, like, isNull, sql } from 'drizzle-orm';

const OUTPUT_DIR = path.join(__dirname, '../glossary');

async function main() {
    console.log("Starting optimized masking process...");

    // 1. Load glossary terms
    // We need to store category alongside term
    let rawTerms: { term: string, category: string }[] = [];
    const termSet = new Set<string>();

    const categoryMap: Record<string, string> = {
        'creatures': 'Creature',
        'enchanting': 'Enchanting',
        'other': 'Term',
        'perks': 'Perk',
        'races': 'Race',
        'skills': 'Skill',
        'skyrim_characters': 'Name',
        'skyrim_factions': 'Faction',
        'skyrim_items': 'Item',
        'skyrim_locations': 'Location',
        'skyrim_quests': 'Quest',
        'spells': 'Spell'
    };

    if (fs.existsSync(OUTPUT_DIR)) {
        const subdirs = fs.readdirSync(OUTPUT_DIR, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        for (const subdir of subdirs) {
            const jsonPath = path.join(OUTPUT_DIR, subdir, 'names_only.json');
            if (fs.existsSync(jsonPath)) {
                try {
                    const rawData = fs.readFileSync(jsonPath, 'utf-8');
                    const jsonData = JSON.parse(rawData);
                    if (Array.isArray(jsonData.items)) {
                        const category = categoryMap[subdir] || 'Term';
                        for (const item of jsonData.items) {
                            if (item) rawTerms.push({ term: item, category });
                        }
                        console.log(`Loaded ${jsonData.items.length} terms from ${subdir}/names_only.json as ${category}`);
                    }
                } catch (e) {
                    console.error(`Error reading ${jsonPath}:`, e);
                }
            }
        }
    }

    console.log(`Total raw terms loaded: ${rawTerms.length}`);

    // 2. Sync with Glossary Table
    console.log("Resetting glossary table to ensure fresh categories...");
    // We truncate to ensure we update categories and IDs cleanly
    await db.delete(glossary);

    console.log("Populating glossary table...");

    // Deduplicate terms (some might appear in multiple categories? unlikely but possible)
    // If duplicate, first one wins? Or we can check.
    const uniqueTerms = new Map<string, string>(); // term -> category
    for (const t of rawTerms) {
        if (!uniqueTerms.has(t.term)) {
            uniqueTerms.set(t.term, t.category);
        }
    }

    const glossaryBatches: { id: string, term: string, category: string }[] = [];
    let currentBatch: { id: string, term: string, category: string }[] = [];

    for (const [term, category] of uniqueTerms.entries()) {
        const id = Math.random().toString(36).substring(2, 7);
        currentBatch.push({ id, term, category });
        if (currentBatch.length >= 500) {
            await db.insert(glossary).values(currentBatch);
            currentBatch = [];
        }
    }
    if (currentBatch.length > 0) {
        await db.insert(glossary).values(currentBatch);
    }

    console.log("Glossary populated.");

    // Re-build term list with IDs and Categories for masking
    const glossaryTerms = await db.select().from(glossary);

    // Sort by length desc for regex priority
    const sortedTerms = glossaryTerms.map(t => ({
        term: t.term,
        id: t.id,
        category: t.category || 'Term'
    })).sort((a, b) => b.term.length - a.term.length);

    const termLookup = new Map<string, { id: string, category: string }>();
    sortedTerms.forEach(t => {
        termLookup.set(t.term.toLowerCase(), { id: t.id, category: t.category });
        termSet.add(t.term.toLowerCase());
    });

    // 3. Construct Regex with word boundaries
    console.log("Constructing Regex...");
    // Add word boundaries \b to ensure we match whole words only
    const escapedTerms = sortedTerms.map(t => `\\b${escapeRegExp(t.term)}\\b`);
    if (escapedTerms.length === 0) {
        console.log("No terms to mask.");
        return;
    }
    const pattern = new RegExp(escapedTerms.join('|'), 'gi');

    // 4. Batch Process Dialog Strings
    console.log("Fetching dialog strings...");
    const allStrings = await db.select().from(dialogStrings);
    console.log(`Processing ${allStrings.length} strings...`);

    let updatedCount = 0;
    const updates = [];
    const totalStrings = allStrings.length;
    const startTime = Date.now();
    let lastProgressTime = startTime;

    for (let idx = 0; idx < allStrings.length; idx++) {
        const record = allStrings[idx];
        
        // Progress indicator setiap 1000 records atau setiap 5 detik
        const now = Date.now();
        if (idx % 1000 === 0 || now - lastProgressTime > 5000) {
            const percent = ((idx / totalStrings) * 100).toFixed(1);
            const elapsed = ((now - startTime) / 1000).toFixed(0);
            const rate = idx > 0 ? (idx / ((now - startTime) / 1000)).toFixed(0) : '0';
            const eta = idx > 0 ? (((totalStrings - idx) / (idx / ((now - startTime) / 1000))) / 60).toFixed(1) : '?';
            console.log(`  [${percent}%] ${idx}/${totalStrings} - ${rate}/s - ETA: ${eta}m`);
            lastProgressTime = now;
        }

        if (!record.source) continue;

        const source = record.source;
        let masked = source;
        let dest = record.dest;
        let shouldUpdate = false;

        // A. Auto-fill Dest Logic
        if (termSet.has(source.toLowerCase())) {
            if (dest !== source) {
                dest = source;
                shouldUpdate = true;
            }
        }

        // B. Masking Logic
        const newMasked = source.replace(pattern, (match) => {
            const info = termLookup.get(match.toLowerCase());
            // Format: [Category_ID]
            return info ? `[${info.category}_${info.id}]` : match;
        });

        if (newMasked !== record.maskedSource) {
            masked = newMasked;
            shouldUpdate = true;
        }

        if (shouldUpdate) {
            updates.push({
                id: record.id,
                dest: dest,
                maskedSource: masked
            });
        }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\nProcessing complete in ${totalTime}s`);
    console.log(`Found ${updates.length} records to update.`);

    // 5. Perform Batch Updates
    // SQlite doesn't have a great "bulk update from values" syntax in basic SQL 
    // without using a temporary table or specialized upsert.
    // But Drizzle/SQLite might be slow with 50k individual update queries.
    // Best approach for SQLite: Transaction.

    console.log("Applying updates...");
    const updateStartTime = Date.now();

    await db.run(sql`BEGIN TRANSACTION`);
    try {
        for (let i = 0; i < updates.length; i++) {
            const u = updates[i];
            await db.update(dialogStrings)
                .set({ dest: u.dest, maskedSource: u.maskedSource })
                .where(eq(dialogStrings.id, u.id));

            // Progress setiap 1000 records
            if (i % 1000 === 0) {
                const percent = ((i / updates.length) * 100).toFixed(1);
                process.stdout.write(`\r  Updating: [${percent}%] ${i}/${updates.length}`);
            }
        }
        await db.run(sql`COMMIT`);
        const updateTime = ((Date.now() - updateStartTime) / 1000).toFixed(1);
        console.log(`\n  Updates committed in ${updateTime}s`);
    } catch (e) {
        console.error("\nError during updates, rolling back:", e);
        try { await db.run(sql`ROLLBACK`); } catch { }
    }

    console.log(`\nProcessing complete.`);
}

function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

main().catch(console.error);
