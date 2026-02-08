
import { db, dialogStrings } from '../lib/db';
import { getAnomalyTypes, AnomalyType } from '../lib/anomaly';
import { eq, isNull, sql } from 'drizzle-orm';

async function main() {
    console.log("Scanning for anomalies...");

    // Fetch all strings - filtering in JS for complex regex
    // SQLite regex support is limited without extensions
    const allStrings = await db.select().from(dialogStrings);

    const stats = {
        [AnomalyType.MISSING]: 0,
        [AnomalyType.SAME]: 0,
        [AnomalyType.DLC]: 0,
        [AnomalyType.TECHNICAL]: 0,
        [AnomalyType.PUNCTUATION]: 0,
        total: allStrings.length,
        anomalies: 0
    };

    const details: Record<string, any[]> = {
        [AnomalyType.DLC]: [],
        [AnomalyType.TECHNICAL]: [],
        [AnomalyType.PUNCTUATION]: []
    };

    for (const record of allStrings) {
        if (!record.source) continue;

        const types = getAnomalyTypes(record.source, record.dest);

        if (types.length > 0) {
            stats.anomalies++;
            types.forEach(t => {
                // Safely update stats and details
                if (stats.hasOwnProperty(t)) {
                    stats[t]++;
                }

                // Store details for review (limit to 5 samples per type for console output)
                if (details[t] && details[t].length < 5) {
                    details[t].push(`${record.source} -> ${record.dest}`);
                }
            });
        }
    }

    console.log("\nScan Results:");
    console.log(`Total Strings: ${stats.total}`);
    console.log(`Total Anomalies Found: ${stats.anomalies}`);
    console.log("------------------------------------------------");
    console.log(`[${AnomalyType.MISSING}] Missing Translations: ${stats[AnomalyType.MISSING]}`);
    console.log(`[${AnomalyType.SAME}] Untranslated (Same as Source): ${stats[AnomalyType.SAME]}`);
    console.log(`[${AnomalyType.DLC}] DLC References: ${stats[AnomalyType.DLC]}`);
    console.log(`[${AnomalyType.TECHNICAL}] Technical IDs: ${stats[AnomalyType.TECHNICAL]}`);
    console.log(`[${AnomalyType.PUNCTUATION}] Punctuation Mismatches: ${stats[AnomalyType.PUNCTUATION]}`);

    console.log("\nSample Artifacts (First 5):");
    if (stats[AnomalyType.DLC] > 0) {
        console.log("\n[DLC Samples]:");
        details[AnomalyType.DLC].forEach(s => console.log(` - ${s}`));
    }
    if (stats[AnomalyType.TECHNICAL] > 0) {
        console.log("\n[Technical Samples]:");
        details[AnomalyType.TECHNICAL].forEach(s => console.log(` - ${s}`));
    }
    if (stats[AnomalyType.PUNCTUATION] > 0) {
        console.log("\n[Punctuation Mismatches]:");
        details[AnomalyType.PUNCTUATION].forEach(s => console.log(` - ${s}`));
    }
}

main().catch(console.error);
