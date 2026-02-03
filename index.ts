import 'dotenv/config';
import { db, dialogStrings, glossary } from './lib/db';
import { eq, sql } from 'drizzle-orm';
import { OpenRouter } from '@openrouter/sdk';
import { WebhookClient, EmbedBuilder } from 'discord.js';

const openrouter = new OpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
});

// Discord Webhook Client
const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
let webhookClient: WebhookClient | null = null;

if (webhookUrl) {
    webhookClient = new WebhookClient({ url: webhookUrl });
    console.log("Discord webhook initialized.");
} else {
    console.warn("DISCORD_WEBHOOK_URL not set. Notifications disabled.");
}

// Progress tracking
interface ProgressStats {
    totalUniqueTexts: number;
    totalRecords: number;
    successCount: number;
    copiedCount: number;
    errorCount: number;
    startTime: Date;
    lastNotifyTime: Date;
}

async function sendDiscordNotification(
    title: string,
    description: string,
    stats?: ProgressStats,
    color: number = 0x00AE86
): Promise<void> {
    if (!webhookClient) return;

    try {
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color)
            .setTimestamp();

        if (stats) {
            const elapsed = Math.floor((Date.now() - stats.startTime.getTime()) / 1000);
            const hours = Math.floor(elapsed / 3600);
            const minutes = Math.floor((elapsed % 3600) / 60);
            const seconds = elapsed % 60;

            const progress = ((stats.successCount + stats.errorCount) / stats.totalUniqueTexts * 100).toFixed(2);
            const recordsUpdated = stats.successCount + stats.copiedCount;

            embed.addFields(
                { name: '📊 Progress', value: `${progress}%`, inline: true },
                { name: '✅ Translated', value: `${stats.successCount}/${stats.totalUniqueTexts}`, inline: true },
                { name: '❌ Errors', value: `${stats.errorCount}`, inline: true },
                { name: '📝 Records Updated', value: `${recordsUpdated}/${stats.totalRecords}`, inline: true },
                { name: '📋 Copied', value: `${stats.copiedCount}`, inline: true },
                { name: '⏱️ Elapsed', value: `${hours}h ${minutes}m ${seconds}s`, inline: true }
            );
        }

        await webhookClient.send({ embeds: [embed] });
    } catch (error) {
        console.error("Failed to send Discord notification:", error);
    }
}

// Cache glossary untuk unmask
let glossaryCache: Map<string, string> | null = null;

async function loadGlossaryCache(): Promise<Map<string, string>> {
    if (glossaryCache) return glossaryCache;

    console.log("Loading glossary cache...");
    const terms = await db.select().from(glossary);
    glossaryCache = new Map();

    for (const term of terms) {
        // Key format: [Category_ID] -> term asli
        const key = `[${term.category}_${term.id}]`;
        glossaryCache.set(key, term.term);
    }

    console.log(`Glossary cache loaded with ${glossaryCache.size} terms.`);
    return glossaryCache;
}

function unmaskText(text: string, cache: Map<string, string>): string {
    // Regex untuk mencocokkan pattern [Category_ID]
    const pattern = /\[([A-Za-z]+)_([a-z0-9]+)\]/g;

    return text.replace(pattern, (match) => {
        const original = cache.get(match);
        return original || match; // Kembalikan term asli atau biarkan jika tidak ditemukan
    });
}

async function translateText(text: string, targetLang: string = 'Indonesian'): Promise<string> {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 5000; // 5 detik

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`Translation attempt ${attempt}/${MAX_RETRIES} for: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

            const result = await openrouter.callModel({
                model: 'openai/gpt-oss-120b',
                input: [
                    {
                        role: 'system', content: `You are an expert translator for The Elder Scrolls V: Skyrim. Translate the following dialog text to ${targetLang}.
Context: Use your knowledge of Skyrim lore and character mannerisms. The text contains masked terms in brackets like [Faction_abcde]; DO NOT translate these brackets or their contents. Keep them exactly as is.
Tone: Maintain the appropriate tone for the speaker (e.g., formal for Jarls, rough for bandits, archaic for ancient beings).
Format: Return the output as a strictly valid JSON object with the format: {"english": "source text", "indonesian": "translated text"}.
Constraints: Preserve any special tags like <...>. Do not include markdown formatting or explanations outside the JSON.`
                    },
                    { role: 'user', content: JSON.stringify({ english: text, indonesian: "" }) }
                ],
                provider: {
                    only: ['deepinfra/fp4']
                }
            });
            const translatedText = await result.getText();

            if (!translatedText) {
                if (attempt < MAX_RETRIES) {
                    console.log(`Empty response received. Retrying in ${RETRY_DELAY_MS / 1000} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                    continue;
                }
                return text;
            }

            try {
                // Find the first '{' and last '}' to extract JSON in case of extra text
                const firstBrace = translatedText.indexOf('{');
                const lastBrace = translatedText.lastIndexOf('}');

                if (firstBrace !== -1 && lastBrace !== -1) {
                    const jsonStr = translatedText.substring(firstBrace, lastBrace + 1);
                    const parsed = JSON.parse(jsonStr);
                    return parsed.indonesian || text;
                }
                return text;
            } catch (e) {
                console.error("Failed to parse JSON response:", translatedText);
                if (attempt < MAX_RETRIES) {
                    console.log(`JSON parsing failed. Retrying in ${RETRY_DELAY_MS / 1000} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                    continue;
                }
                return text;
            }
        } catch (error) {
            console.error(`Translation error (attempt ${attempt}/${MAX_RETRIES}):`, error);

            if (attempt < MAX_RETRIES) {
                console.log(`Retrying in ${RETRY_DELAY_MS / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                continue;
            }

            console.error("All retry attempts failed. Returning original text.");
            return text;
        }
    }

    // This should never be reached, but just in case
    return text;
}

async function main() {
    console.log("Starting translation process...");

    // Load glossary cache untuk unmask
    const cache = await loadGlossaryCache();

    // Fetch SEMUA strings yang belum diterjemahkan (dest kosong)
    const untranslatedStrings = await db.select()
        .from(dialogStrings)
        .where(eq(dialogStrings.dest, ''));

    if (untranslatedStrings.length === 0) {
        console.log("No untranslated strings found.");
        return;
    }

    console.log(`Found ${untranslatedStrings.length} total untranslated strings.`);

    // Group by source/maskedSource untuk menghindari translate duplikat
    const groupedBySource = new Map<string, typeof untranslatedStrings>();
    let skippedEmptySource = 0;

    for (const record of untranslatedStrings) {
        // Skip jika source kosong
        if (!record.source || record.source.trim() === '') {
            skippedEmptySource++;
            continue;
        }

        const textKey = record.maskedSource || record.source;

        if (!groupedBySource.has(textKey)) {
            groupedBySource.set(textKey, []);
        }
        groupedBySource.get(textKey)!.push(record);
    }

    console.log(`Skipped (empty source): ${skippedEmptySource}`);
    console.log(`Unique texts to translate: ${groupedBySource.size}`);

    // Production: translate ALL unique texts
    const uniqueTexts = Array.from(groupedBySource.entries());

    // Calculate total records to update
    const totalRecords = uniqueTexts.reduce((sum, [, records]) => sum + records.length, 0);

    // Progress stats
    const stats: ProgressStats = {
        totalUniqueTexts: uniqueTexts.length,
        totalRecords,
        successCount: 0,
        copiedCount: 0,
        errorCount: 0,
        startTime: new Date(),
        lastNotifyTime: new Date(),
    };

    // Send start notification
    await sendDiscordNotification(
        '🚀 Translation Started',
        `Starting Skyrim dialog translation process.`,
        stats,
        0x3498DB // Blue
    );

    // Interval untuk notifikasi progress (setiap 1 menit atau setiap 100 item)
    const NOTIFY_INTERVAL_MS = 1 * 60 * 1000; // 1 menit
    const NOTIFY_ITEM_INTERVAL = 100; // Setiap 100 item

    for (let i = 0; i < uniqueTexts.length; i++) {
        const [textToTranslate, records] = uniqueTexts[i];

        console.log(`\n[${i + 1}/${uniqueTexts.length}] Source: "${textToTranslate.substring(0, 50)}${textToTranslate.length > 50 ? '...' : ''}"`);
        console.log(`  Records with same source: ${records.length}`);

        try {
            // 1. Terjemahkan teks yang di-mask (hanya 1x)
            const translatedMasked = await translateText(textToTranslate);
            console.log(`  Translated (masked): ${translatedMasked}`);

            // 2. Unmask hasil terjemahan
            const unmaskedTranslation = unmaskText(translatedMasked, cache);
            console.log(`  Unmasked: ${unmaskedTranslation}`);

            // 3. Simpan ke SEMUA records dengan source yang sama
            for (const record of records) {
                await db.update(dialogStrings)
                    .set({ dest: unmaskedTranslation })
                    .where(eq(dialogStrings.id, record.id));
            }

            console.log(`  ✓ Saved to ${records.length} record(s).`);
            stats.successCount++;
            stats.copiedCount += records.length - 1;
        } catch (error) {
            console.error(`  ✗ Error processing:`, error);
            stats.errorCount++;
        }

        // Send progress notification every NOTIFY_INTERVAL_MS or every NOTIFY_ITEM_INTERVAL items
        const now = Date.now();
        const shouldNotifyByTime = now - stats.lastNotifyTime.getTime() >= NOTIFY_INTERVAL_MS;
        const shouldNotifyByCount = (stats.successCount + stats.errorCount) % NOTIFY_ITEM_INTERVAL === 0;

        if (shouldNotifyByTime || shouldNotifyByCount) {
            stats.lastNotifyTime = new Date();
            await sendDiscordNotification(
                '📈 Translation Progress',
                `Translation is in progress...`,
                stats,
                0xF39C12 // Orange
            );
        }
    }

    // Send completion notification
    const finalColor = stats.errorCount === 0 ? 0x2ECC71 : 0xE74C3C; // Green or Red
    await sendDiscordNotification(
        stats.errorCount === 0 ? '✅ Translation Complete' : '⚠️ Translation Complete (with errors)',
        `Translation process has finished.`,
        stats,
        finalColor
    );

    console.log(`\n--- Summary ---`);
    console.log(`Unique texts translated: ${stats.successCount}`);
    console.log(`Records updated via copy: ${stats.copiedCount}`);
    console.log(`Total records updated: ${stats.successCount + stats.copiedCount}`);
    console.log(`Errors: ${stats.errorCount}`);

    // Cleanup webhook client
    if (webhookClient) {
        webhookClient.destroy();
    }
}

main().catch(async (error) => {
    console.error("Fatal error:", error);

    // Send error notification
    if (webhookClient) {
        await sendDiscordNotification(
            '💥 Translation Failed',
            `Fatal error occurred: ${error.message}`,
            undefined,
            0xE74C3C // Red
        );
        webhookClient.destroy();
    }

    process.exit(1);
});