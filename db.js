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
    header_color      TEXT DEFAULT '#a0a0b8',
    header_font       TEXT DEFAULT '',
    stt_api_key           TEXT DEFAULT '',
    stt_model             TEXT DEFAULT '',
    stt_language          TEXT DEFAULT '',
    tts_api_key           TEXT DEFAULT '',
    tts_model             TEXT DEFAULT '',
    tts_stability         REAL DEFAULT -1,
    tts_similarity        REAL DEFAULT -1,
    ai_provider           TEXT DEFAULT 'anthropic',
    ai_max_tokens         INTEGER DEFAULT 0,
    anthropic_api_key     TEXT DEFAULT '',
    anthropic_model       TEXT DEFAULT '',
    openai_api_key        TEXT DEFAULT '',
    openai_model          TEXT DEFAULT '',
    avatar_mode           TEXT DEFAULT 'embedded',
    webhook_url           TEXT DEFAULT '',
    webhook_input_template TEXT DEFAULT '{"query":"{{query}}"}',
    webhook_output_field  TEXT DEFAULT 'response',
    webhook_headers       TEXT DEFAULT '{}',
    idle_timeout      INTEGER DEFAULT 90,
    idle_icon         TEXT DEFAULT '🤖',
    idle_title        TEXT DEFAULT '',
    idle_subtitle     TEXT DEFAULT 'La tua assistente virtuale',
    idle_hint         TEXT DEFAULT '✨ Tocca per iniziare',
    overlay_color     TEXT DEFAULT '#0a0a0f',
    overlay_opacity   REAL DEFAULT 0.75,
    overlay_height    REAL DEFAULT 65,
    chat_height       INTEGER DEFAULT 65,
    chat_bottom       INTEGER DEFAULT 0,
    chat_max_width    INTEGER DEFAULT 100,
    chat_align        TEXT DEFAULT 'center',
    chat_hide_input   INTEGER DEFAULT 0,
    show_logo         INTEGER DEFAULT 1,
    published         INTEGER DEFAULT 0,
    created_at        TEXT DEFAULT (datetime('now')),
    updated_at        TEXT DEFAULT (datetime('now'))
  )
`);

// Migrazione: aggiunge colonne mancanti su DB esistenti
const existing = db.prepare("PRAGMA table_info(avatars)").all().map(c => c.name);
if (!existing.includes('header_color'))
  db.exec("ALTER TABLE avatars ADD COLUMN header_color TEXT DEFAULT '#a0a0b8'");
if (!existing.includes('header_font'))
  db.exec("ALTER TABLE avatars ADD COLUMN header_font TEXT DEFAULT ''");
if (!existing.includes('stt_api_key'))     db.exec("ALTER TABLE avatars ADD COLUMN stt_api_key TEXT DEFAULT ''");
if (!existing.includes('stt_model'))       db.exec("ALTER TABLE avatars ADD COLUMN stt_model TEXT DEFAULT ''");
if (!existing.includes('stt_language'))    db.exec("ALTER TABLE avatars ADD COLUMN stt_language TEXT DEFAULT ''");
if (!existing.includes('tts_api_key'))     db.exec("ALTER TABLE avatars ADD COLUMN tts_api_key TEXT DEFAULT ''");
if (!existing.includes('tts_model'))       db.exec("ALTER TABLE avatars ADD COLUMN tts_model TEXT DEFAULT ''");
if (!existing.includes('tts_stability'))   db.exec("ALTER TABLE avatars ADD COLUMN tts_stability REAL DEFAULT -1");
if (!existing.includes('tts_similarity'))  db.exec("ALTER TABLE avatars ADD COLUMN tts_similarity REAL DEFAULT -1");
if (!existing.includes('ai_provider'))      db.exec("ALTER TABLE avatars ADD COLUMN ai_provider TEXT DEFAULT 'anthropic'");
if (!existing.includes('ai_max_tokens'))    db.exec("ALTER TABLE avatars ADD COLUMN ai_max_tokens INTEGER DEFAULT 0");
if (!existing.includes('anthropic_api_key')) db.exec("ALTER TABLE avatars ADD COLUMN anthropic_api_key TEXT DEFAULT ''");
if (!existing.includes('anthropic_model'))   db.exec("ALTER TABLE avatars ADD COLUMN anthropic_model TEXT DEFAULT ''");
if (!existing.includes('openai_api_key'))    db.exec("ALTER TABLE avatars ADD COLUMN openai_api_key TEXT DEFAULT ''");
if (!existing.includes('openai_model'))      db.exec("ALTER TABLE avatars ADD COLUMN openai_model TEXT DEFAULT ''");
// Migra vecchi campi ai_api_key/ai_model se presenti
if (existing.includes('ai_api_key')) {
  db.exec("UPDATE avatars SET anthropic_api_key = ai_api_key WHERE anthropic_api_key = '' AND ai_api_key != ''");
  db.exec("UPDATE avatars SET anthropic_model = ai_model WHERE anthropic_model = '' AND ai_model != '' AND ai_provider = 'anthropic'");
  db.exec("UPDATE avatars SET openai_model = ai_model WHERE openai_model = '' AND ai_model != '' AND ai_provider = 'openai'");
}
if (!existing.includes('avatar_mode'))
  db.exec("ALTER TABLE avatars ADD COLUMN avatar_mode TEXT DEFAULT 'embedded'");
if (!existing.includes('webhook_url'))
  db.exec("ALTER TABLE avatars ADD COLUMN webhook_url TEXT DEFAULT ''");
if (!existing.includes('webhook_input_template'))
  db.exec(`ALTER TABLE avatars ADD COLUMN webhook_input_template TEXT DEFAULT '{"query":"{{query}}"}'`);
if (!existing.includes('webhook_output_field'))
  db.exec("ALTER TABLE avatars ADD COLUMN webhook_output_field TEXT DEFAULT 'response'");
if (!existing.includes('webhook_headers'))
  db.exec("ALTER TABLE avatars ADD COLUMN webhook_headers TEXT DEFAULT '{}'");
if (!existing.includes('idle_timeout'))
  db.exec("ALTER TABLE avatars ADD COLUMN idle_timeout INTEGER DEFAULT 90");
if (!existing.includes('chat_height'))
  db.exec("ALTER TABLE avatars ADD COLUMN chat_height INTEGER DEFAULT 65");
if (!existing.includes('chat_bottom'))
  db.exec("ALTER TABLE avatars ADD COLUMN chat_bottom INTEGER DEFAULT 0");
if (!existing.includes('chat_max_width'))
  db.exec("ALTER TABLE avatars ADD COLUMN chat_max_width INTEGER DEFAULT 100");
if (!existing.includes('chat_align'))
  db.exec("ALTER TABLE avatars ADD COLUMN chat_align TEXT DEFAULT 'center'");
if (!existing.includes('chat_hide_input'))
  db.exec("ALTER TABLE avatars ADD COLUMN chat_hide_input INTEGER DEFAULT 0");
if (!existing.includes('show_logo'))
  db.exec("ALTER TABLE avatars ADD COLUMN show_logo INTEGER DEFAULT 1");

export default db;
