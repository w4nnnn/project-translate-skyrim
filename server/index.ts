
import express from 'express';
import path from 'path';
import { db, dialogStrings } from '../lib/db';
import { eq, isNull, sql, and, or, count, desc, like } from 'drizzle-orm';
import { fileURLToPath } from 'url';
import { getAnomalyTypes, AnomalyType, isDLC, isTechnical, isPunctuationMismatch } from '../lib/anomaly';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', async (req, res) => {
    try {
        const allStrings = await db.select().from(dialogStrings);

        const stats = {
            total: allStrings.length,
            missing: 0,
            same: 0,
            dlc: 0,
            tech: 0,
            punct: 0
        };

        for (const str of allStrings) {
            if (!str.source) continue;
            if (!str.dest) stats.missing++;
            else if (str.source === str.dest) stats.same++;
            else if (isPunctuationMismatch(str.source, str.dest)) {
                stats.punct++;
            }

            if (isDLC(str.source)) stats.dlc++;
            if (isTechnical(str.source)) stats.tech++;
        }

        res.render('index', stats);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading dashboard");
    }
});

app.get('/review', async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = 50;
    const type = (req.query.type as string) || 'all';
    const search = (req.query.search as string || '').toLowerCase();

    try {
        const allStrings = await db.select().from(dialogStrings);

        const filtered = allStrings.filter(str => {
            if (!str.source) return false;

            // 1. Search Filter
            if (search) {
                const s = str.source.toLowerCase();
                const d = (str.dest || '').toLowerCase();
                if (!s.includes(search) && !d.includes(search)) return false;
            }

            // 2. Type Filter
            if (type === 'all') return true;

            if (type === AnomalyType.MISSING) return !str.dest;
            if (type === AnomalyType.SAME) return str.source === str.dest;
            if (type === AnomalyType.DLC) return isDLC(str.source);
            if (type === AnomalyType.TECHNICAL) return isTechnical(str.source);
            if (type === AnomalyType.PUNCTUATION) return isPunctuationMismatch(str.source, str.dest || '');

            return true;
        });

        const total = filtered.length;
        const totalPages = Math.ceil(total / limit);
        const paginated = filtered.slice((page - 1) * limit, page * limit);

        res.render('review', {
            strings: paginated,
            page,
            totalPages,
            type,
            search
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading strings");
    }
});

app.post('/api/update', async (req, res) => {
    const { id, dest } = req.body;
    if (!id || dest === undefined) {
        return res.status(400).json({ error: "Missing id or dest" });
    }

    try {
        await db.update(dialogStrings)
            .set({ dest })
            .where(eq(dialogStrings.id, parseInt(id)));
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Update failed" });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
