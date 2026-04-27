import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, 'avatars.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS avatars (
    id                TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    voice_id          TEXT DEFAULT '',
    system_prompt     TEXT DEFAULT '',
    background        TEXT DEFAULT '#0a0a0f',
    model_file        TEXT DEFAULT '',
    idle_start        REAL DEFAULT 0,
    idle_end          REAL DEFAULT 2,
    speech_start      REAL DEFAULT 2,
    speech_end        REAL DEFAULT 9,
    avatar_scale      REAL DEFAULT 0.75,
    avatar_offset_x   REAL DEFAULT 0,
    avatar_offset_y   REAL DEFAULT 0,
    avatar_rot_y      REAL DEFAULT 0,
    camera_z          REAL DEFAULT 3.5,
    camera_y          REAL DEFAULT 1.0,
    camera_look_at_y  REAL DEFAULT 1.0,
    overlay_color     TEXT DEFAULT '#0a0a0f',
    overlay_opacity   REAL DEFAULT 0.75,
    overlay_height    REAL DEFAULT 65,
    published         INTEGER DEFAULT 0,
    created_at        TEXT DEFAULT (datetime('now')),
    updated_at        TEXT DEFAULT (datetime('now'))
  )
`);

export default db;
