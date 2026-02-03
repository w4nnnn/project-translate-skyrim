# Project Skyrim

A comprehensive tool for extracting, processing, and translating Skyrim game strings. This project manages dialogue, items, quests, characters, and other in-game text content from The Elder Scrolls V: Skyrim, including all DLCs (Dawnguard, Dragonborn, and Hearthfires).

## Features

- **String Extraction**: Parse and extract strings from Skyrim's binary string files (.strings, .dlstrings, .ilstrings)
- **Database Management**: Store and manage game strings using SQLite with Drizzle ORM
- **Glossary System**: Automatic detection and masking of game-specific terms (names, locations, items, etc.)
- **AI Translation**: Integrate with OpenRouter AI for intelligent translation while preserving game terminology
- **Discord Notifications**: Real-time progress updates via Discord webhooks
- **Comprehensive Coverage**: Support for all Skyrim DLCs and updates

## Project Structure

```
project-skyrim/
├── strings/                 # Original Skyrim binary string files
├── export_strings/          # Exported XML string files
├── exported_strings/        # Processed string exports
├── output/                  # Categorized JSON outputs
│   ├── creatures/
│   ├── enchanting/
│   ├── skyrim_characters/
│   ├── skyrim_factions/
│   ├── skyrim_items/
│   ├── skyrim_locations/
│   ├── skyrim_quests/
│   ├── spells/
│   └── ...
├── scripts/                 # Utility scripts
│   ├── export_strings.ts   # Export strings to XML
│   ├── import_strings.ts   # Import strings to database
│   ├── mask_strings.ts     # Mask game-specific terms
│   └── clear_db.ts         # Clear database
├── lib/db/                  # Database configuration
│   ├── index.ts
│   └── schema.ts
└── index.ts                 # Main translation engine
```

## Database Schema

The project uses three main tables:

- **dialog_files**: Stores metadata about string files
- **dialog_strings**: Contains all game strings with source, masked source, and translated text
- **glossary**: Manages game-specific terminology (character names, locations, items, etc.)

## Installation

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- SQLite

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd project-skyrim
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```env
OPENROUTER_API_KEY=your_openrouter_api_key
DISCORD_WEBHOOK_URL=your_discord_webhook_url (optional)
```

4. Initialize the database:
```bash
npm run db:push
```

## Usage

### Available Scripts

- **`npm start`** - Run the main translation engine
- **`npm run mask`** - Mask game-specific terms in strings
- **`npm run import`** - Import strings from XML files to database
- **`npm run export`** - Export strings from binary files to XML
- **`npm run db:studio`** - Open Drizzle Studio for database management
- **`npm run db:clear`** - Clear all data from database
- **`npm run db:push`** - Push schema changes to database

### PM2 Process Management

For production deployment, use PM2 to manage the application process:

- **`npm run pm2:start`** - Start the application with PM2
- **`npm run pm2:stop`** - Stop the PM2 process
- **`npm run pm2:restart`** - Restart the PM2 process
- **`npm run pm2:delete`** - Delete the PM2 process
- **`npm run pm2:logs`** - View PM2 logs
- **`npm run pm2:monit`** - Open PM2 monitoring interface

### Workflow

1. **Export strings from Skyrim files**:
```bash
npm run export
```

2. **Import strings to database**:
```bash
npm run import
```

3. **Mask game-specific terms**:
```bash
npm run mask
```

4. **Run translation**:
```bash
npm start
```

### Glossary System

The masking system automatically detects and masks game-specific terms to preserve them during translation:

- **Character Names**: `[Name_id]`
- **Locations**: `[Location_id]`
- **Items**: `[Item_id]`
- **Quests**: `[Quest_id]`
- **Factions**: `[Faction_id]`
- **Spells**: `[Spell_id]`
- **Creatures**: `[Creature_id]`
- And more...

These masked terms are automatically unmasked after translation to preserve the original game terminology.

## Output Structure

The project generates categorized JSON files in the `output/` directory:

- `creatures/` - Creature names and data
- `enchanting/` - Enchantments and effects
- `skyrim_characters/` - NPC names
- `skyrim_factions/` - Faction names
- `skyrim_items/` - Weapons, armor, potions, ingredients, books
- `skyrim_locations/` - Location names
- `skyrim_quests/` - Quest titles and objectives
- `spells/` - Spell names and descriptions
- `perks/` - Perk names and descriptions
- `skills/` - Skill names
- `races/` - Playable races

Each category includes:
- `all.json` - Complete data
- `names_only.json` - Just the names/titles
- Category-specific files (e.g., `weapons.json`, `armor.json`)

## Technologies Used

- **TypeScript** - Type-safe development
- **Drizzle ORM** - Type-safe database operations
- **Better-SQLite3** - Fast SQLite database
- **OpenRouter SDK** - AI translation integration
- **Discord.js** - Webhook notifications
- **fast-xml-parser** - XML parsing for string exports
- **PM2** - Process management for production deployment

## Features in Detail

### Translation Engine

The main translation engine (`index.ts`) provides:
- Progress tracking with Discord notifications
- Batch processing of strings
- Automatic glossary unmasking
- Error handling and retry logic
- Resume capability for interrupted translations

### String Processing

The string processing system:
- Parses binary Skyrim string files
- Converts to XML for editing
- Imports to database for processing
- Masks game terms before translation
- Unmasks terms after translation

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.

## License

ISC

## Acknowledgments

- The Elder Scrolls V: Skyrim © Bethesda Softworks
- This is a fan-made tool for managing Skyrim translations and is not affiliated with Bethesda

## Support

For issues or questions, please open an issue on the GitHub repository.