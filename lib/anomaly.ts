
/**
 * Shared logic for detecting anomalous strings in the translation database.
 */

export const AnomalyType = {
    MISSING: 'missing', // dest is null/empty
    SAME: 'same',       // dest == source
    DLC: 'dlc',         // Contains DLC references
    TECHNICAL: 'tech',  // Looks like an internal ID
    PUNCTUATION: 'punct' // Punctuation mismatch
} as const;

export type AnomalyType = typeof AnomalyType[keyof typeof AnomalyType];

export function getAnomalyTypes(source: string, dest: string | null): AnomalyType[] {
    const types: AnomalyType[] = [];

    if (!dest) {
        types.push(AnomalyType.MISSING);
    } else if (source === dest) {
        types.push(AnomalyType.SAME);
    } else {
        // Only check punctuation if there is a translation and it's not identical
        if (isPunctuationMismatch(source, dest)) {
            types.push(AnomalyType.PUNCTUATION);
        }
    }

    if (isDLC(source)) {
        types.push(AnomalyType.DLC);
    }

    if (isTechnical(source)) {
        types.push(AnomalyType.TECHNICAL);
    }

    return types;
}

export function isDLC(text: string): boolean {
    // Matches "DLC01...", "DLC1 ", etc.
    return /DLC\d+/i.test(text) || text.startsWith("DLC");
}

export function isTechnical(text: string): boolean {
    // Heuristic for Technical IDs:
    // 1. No spaces
    // 2. Contains at least one Uppercase letter
    // 3. AND (Contains Number OR Contains Underscore OR Has multiple Uppercase letters)
    // Examples: "AudioTemplateChaurusHunter", "FemaleHeadWoodElfVampire", "MaleEyesHumanVampire01"

    if (text.includes(' ')) return false; // Sentences are usually not IDs (except specific DLC names like "DLC01 Name", which are covered by isDLC)

    const hasUpper = /[A-Z]/.test(text);
    if (!hasUpper) return false;

    const hasNumber = /[0-9]/.test(text);
    const hasUnderscore = /_/.test(text);
    const upperCount = (text.match(/[A-Z]/g) || []).length;

    return hasNumber || hasUnderscore || upperCount > 1;
}

export function isPunctuationMismatch(source: string, dest: string): boolean {
    if (!dest) return false;

    // Only check for specific critical punctuation: < > "
    // Used for tags (e.g. <Alias=Player>) and speech quotes.
    const getCriticalPunctuation = (s: string) => s.replace(/[^<>"]/g, '');

    return getCriticalPunctuation(source) !== getCriticalPunctuation(dest);
}
