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
    bg_video          TEXT DEFAULT '',
    anim_pingpong     INTEGER DEFAULT 0,
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
    stt_api_key           TEXT DEFAULT '',
    stt_model             TEXT DEFAULT '',
    stt_language          TEXT DEFAULT '',
    tts_api_key           TEXT DEFAULT '',
    tts_model             TEXT DEFAULT '',
    tts_stability               REAL DEFAULT -1,
    tts_similarity              REAL DEFAULT -1,
    tts_text_normalization      TEXT DEFAULT 'auto',
    tts_language_normalization  INTEGER DEFAULT 0,
    texture_quality             INTEGER DEFAULT 85,
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
    idle_disabled     INTEGER DEFAULT 0,
    idle_timeout      INTEGER DEFAULT 90,
    idle_icon         TEXT DEFAULT '🤖',
    idle_icon_img     TEXT DEFAULT '',
    idle_title        TEXT DEFAULT '',
    idle_subtitle     TEXT DEFAULT 'La tua assistente virtuale',
    idle_hint         TEXT DEFAULT '✨ Tocca per iniziare',
    idle_video        TEXT DEFAULT '',
    idle_bg_image     TEXT DEFAULT '',
    idle_bg_color       TEXT DEFAULT '',
    idle_bg_color_alpha REAL DEFAULT 1,
    idle_bg_opacity   REAL DEFAULT 1,
    idle_font         TEXT DEFAULT '',
    idle_font_size    REAL DEFAULT 1.1,
    overlay_color     TEXT DEFAULT '#0a0a0f',
    overlay_opacity   REAL DEFAULT 0.75,
    overlay_height    REAL DEFAULT 65,
    chat_height       INTEGER DEFAULT 65,
    chat_bottom       INTEGER DEFAULT 100,
    chat_max_width    INTEGER DEFAULT 100,
    chat_align        TEXT DEFAULT 'center',
    chat_hide_input   INTEGER DEFAULT 0,
    chat_font         TEXT DEFAULT '',
    chat_font_size    REAL DEFAULT 1.1,
    show_controls     INTEGER DEFAULT 1,
    mic_icon          TEXT DEFAULT '',
    mic_icon_size     INTEGER DEFAULT 100,
    mic_icon_x        INTEGER DEFAULT 0,
    mic_icon_y        INTEGER DEFAULT 0,
    mic_icon_disabled TEXT DEFAULT '',
    mic_visible       INTEGER DEFAULT 1,
    mic_bg_color      TEXT DEFAULT 'rgba(248,113,113,0.15)',
    mic_disabled_color TEXT DEFAULT 'rgba(248,113,113,0.15)',
    mic_border_color  TEXT DEFAULT 'rgba(34,211,160,0.5)',
    mic_border_disabled_color TEXT DEFAULT 'rgba(248,113,113,0.4)',
    audio_icon        TEXT DEFAULT '',
    audio_icon_size   INTEGER DEFAULT 100,
    audio_icon_x      INTEGER DEFAULT 0,
    audio_icon_y      INTEGER DEFAULT 0,
    audio_icon_disabled TEXT DEFAULT '',
    audio_visible     INTEGER DEFAULT 1,
    audio_bg_color    TEXT DEFAULT 'rgba(34,211,160,0.15)',
    audio_disabled_color TEXT DEFAULT 'rgba(34,211,160,0.15)',
    audio_border_color TEXT DEFAULT 'rgba(34,211,160,0.5)',
    audio_border_disabled_color TEXT DEFAULT 'rgba(248,113,113,0.4)',
    mic_wave_color    TEXT DEFAULT '#ffffff',
    audio_wave_color  TEXT DEFAULT '#ffffff',
    theme             TEXT DEFAULT 'viola',
    published         INTEGER DEFAULT 0,
    created_at        TEXT DEFAULT (datetime('now')),
    updated_at        TEXT DEFAULT (datetime('now'))
  )
`);

// Migrazione: aggiunge colonne mancanti su DB esistenti
const existing = db.prepare("PRAGMA table_info(avatars)").all().map(c => c.name);
if (!existing.includes('stt_api_key'))     db.exec("ALTER TABLE avatars ADD COLUMN stt_api_key TEXT DEFAULT ''");
if (!existing.includes('stt_model'))       db.exec("ALTER TABLE avatars ADD COLUMN stt_model TEXT DEFAULT ''");
if (!existing.includes('stt_language'))    db.exec("ALTER TABLE avatars ADD COLUMN stt_language TEXT DEFAULT ''");
if (!existing.includes('tts_api_key'))     db.exec("ALTER TABLE avatars ADD COLUMN tts_api_key TEXT DEFAULT ''");
if (!existing.includes('tts_model'))       db.exec("ALTER TABLE avatars ADD COLUMN tts_model TEXT DEFAULT ''");
if (!existing.includes('tts_stability'))   db.exec("ALTER TABLE avatars ADD COLUMN tts_stability REAL DEFAULT -1");
if (!existing.includes('tts_similarity'))             db.exec("ALTER TABLE avatars ADD COLUMN tts_similarity REAL DEFAULT -1");
if (!existing.includes('tts_text_normalization'))     db.exec("ALTER TABLE avatars ADD COLUMN tts_text_normalization TEXT DEFAULT 'auto'");
if (!existing.includes('tts_language_normalization')) db.exec("ALTER TABLE avatars ADD COLUMN tts_language_normalization INTEGER DEFAULT 0");
if (!existing.includes('texture_quality'))            db.exec("ALTER TABLE avatars ADD COLUMN texture_quality INTEGER DEFAULT 85");
if (!existing.includes('ai_provider'))      db.exec("ALTER TABLE avatars ADD COLUMN ai_provider TEXT DEFAULT 'anthropic'");
if (!existing.includes('ai_max_tokens'))    db.exec("ALTER TABLE avatars ADD COLUMN ai_max_tokens INTEGER DEFAULT 0");
if (!existing.includes('anthropic_api_key')) db.exec("ALTER TABLE avatars ADD COLUMN anthropic_api_key TEXT DEFAULT ''");
if (!existing.includes('anthropic_model'))   db.exec("ALTER TABLE avatars ADD COLUMN anthropic_model TEXT DEFAULT ''");
if (!existing.includes('openai_api_key'))    db.exec("ALTER TABLE avatars ADD COLUMN openai_api_key TEXT DEFAULT ''");
if (!existing.includes('openai_model'))      db.exec("ALTER TABLE avatars ADD COLUMN openai_model TEXT DEFAULT ''");
// Migra vecchi campi ai_api_key/ai_model se presenti
if (existing.includes('ai_api_key')) {
  db.exec("UPDATE avatars SET anthropic_api_key = ai_api_key WHERE anthropic_api_key = '' AND ai_api_key != ''");
  db.exec("UPDATE avatars SET anthropic_api_key = ai_api_key WHERE anthropic_api_key = '' AND ai_api_key != '' AND ai_provider = 'anthropic'");
  db.exec("UPDATE avatars SET anthropic_model = ai_model WHERE anthropic_model = '' AND ai_model != '' AND ai_provider = 'anthropic'");
  // Non migrare il modello OpenAI se contiene un nome Anthropic
  db.exec("UPDATE avatars SET openai_api_key = ai_api_key WHERE openai_api_key = '' AND ai_api_key != '' AND ai_provider = 'openai' AND ai_api_key NOT LIKE 'sk-ant-%'");
  db.exec("UPDATE avatars SET openai_model = ai_model WHERE openai_model = '' AND ai_model != '' AND ai_provider = 'openai' AND ai_model NOT LIKE 'claude-%'");
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
  db.exec("ALTER TABLE avatars ADD COLUMN chat_bottom INTEGER DEFAULT 100");
if (!existing.includes('chat_max_width'))
  db.exec("ALTER TABLE avatars ADD COLUMN chat_max_width INTEGER DEFAULT 100");
if (!existing.includes('chat_align'))
  db.exec("ALTER TABLE avatars ADD COLUMN chat_align TEXT DEFAULT 'center'");
if (!existing.includes('chat_hide_input'))
  db.exec("ALTER TABLE avatars ADD COLUMN chat_hide_input INTEGER DEFAULT 0");
if (!existing.includes('chat_font'))
  db.exec("ALTER TABLE avatars ADD COLUMN chat_font TEXT DEFAULT ''");
if (!existing.includes('chat_font_size'))
  db.exec("ALTER TABLE avatars ADD COLUMN chat_font_size REAL DEFAULT 1.1");
if (!existing.includes('show_controls'))
  db.exec("ALTER TABLE avatars ADD COLUMN show_controls INTEGER DEFAULT 1");
if (!existing.includes('mic_icon'))
  db.exec("ALTER TABLE avatars ADD COLUMN mic_icon TEXT DEFAULT ''");
if (!existing.includes('mic_icon_size'))
  db.exec("ALTER TABLE avatars ADD COLUMN mic_icon_size INTEGER DEFAULT 100");
if (!existing.includes('mic_icon_x'))
  db.exec("ALTER TABLE avatars ADD COLUMN mic_icon_x INTEGER DEFAULT 0");
if (!existing.includes('mic_icon_y'))
  db.exec("ALTER TABLE avatars ADD COLUMN mic_icon_y INTEGER DEFAULT 0");
if (!existing.includes('mic_visible'))
  db.exec("ALTER TABLE avatars ADD COLUMN mic_visible INTEGER DEFAULT 1");
if (!existing.includes('mic_bg_color'))
  db.exec("ALTER TABLE avatars ADD COLUMN mic_bg_color TEXT DEFAULT 'rgba(248,113,113,0.15)'");
if (!existing.includes('mic_disabled_color'))
  db.exec("ALTER TABLE avatars ADD COLUMN mic_disabled_color TEXT DEFAULT 'rgba(248,113,113,0.15)'");
if (!existing.includes('audio_icon'))
  db.exec("ALTER TABLE avatars ADD COLUMN audio_icon TEXT DEFAULT ''");
if (!existing.includes('audio_icon_size'))
  db.exec("ALTER TABLE avatars ADD COLUMN audio_icon_size INTEGER DEFAULT 100");
if (!existing.includes('audio_icon_x'))
  db.exec("ALTER TABLE avatars ADD COLUMN audio_icon_x INTEGER DEFAULT 0");
if (!existing.includes('audio_icon_y'))
  db.exec("ALTER TABLE avatars ADD COLUMN audio_icon_y INTEGER DEFAULT 0");
if (!existing.includes('audio_visible'))
  db.exec("ALTER TABLE avatars ADD COLUMN audio_visible INTEGER DEFAULT 1");
if (!existing.includes('audio_bg_color'))
  db.exec("ALTER TABLE avatars ADD COLUMN audio_bg_color TEXT DEFAULT 'rgba(34,211,160,0.15)'");
if (!existing.includes('audio_disabled_color'))
  db.exec("ALTER TABLE avatars ADD COLUMN audio_disabled_color TEXT DEFAULT 'rgba(34,211,160,0.15)'");
if (!existing.includes('mic_icon_disabled'))
  db.exec("ALTER TABLE avatars ADD COLUMN mic_icon_disabled TEXT DEFAULT ''");
if (!existing.includes('audio_icon_disabled'))
  db.exec("ALTER TABLE avatars ADD COLUMN audio_icon_disabled TEXT DEFAULT ''");
if (!existing.includes('mic_border_color'))
  db.exec("ALTER TABLE avatars ADD COLUMN mic_border_color TEXT DEFAULT 'rgba(34,211,160,0.5)'");
if (!existing.includes('mic_border_disabled_color'))
  db.exec("ALTER TABLE avatars ADD COLUMN mic_border_disabled_color TEXT DEFAULT 'rgba(248,113,113,0.4)'");
if (!existing.includes('audio_border_color'))
  db.exec("ALTER TABLE avatars ADD COLUMN audio_border_color TEXT DEFAULT 'rgba(34,211,160,0.5)'");
if (!existing.includes('audio_border_disabled_color'))
  db.exec("ALTER TABLE avatars ADD COLUMN audio_border_disabled_color TEXT DEFAULT 'rgba(248,113,113,0.4)'");
if (!existing.includes('mic_wave_color'))
  db.exec("ALTER TABLE avatars ADD COLUMN mic_wave_color TEXT DEFAULT '#ffffff'");
if (!existing.includes('audio_wave_color'))
  db.exec("ALTER TABLE avatars ADD COLUMN audio_wave_color TEXT DEFAULT '#ffffff'");
if (!existing.includes('idle_icon_img'))
  db.exec("ALTER TABLE avatars ADD COLUMN idle_icon_img TEXT DEFAULT ''");
if (!existing.includes('idle_video'))
  db.exec("ALTER TABLE avatars ADD COLUMN idle_video TEXT DEFAULT ''")
if (!existing.includes('idle_bg_image'))
  db.exec("ALTER TABLE avatars ADD COLUMN idle_bg_image TEXT DEFAULT ''")
if (!existing.includes('idle_bg_color'))
  db.exec("ALTER TABLE avatars ADD COLUMN idle_bg_color TEXT DEFAULT ''")
if (!existing.includes('idle_bg_color_alpha'))
  db.exec("ALTER TABLE avatars ADD COLUMN idle_bg_color_alpha REAL DEFAULT 1")
if (!existing.includes('idle_disabled'))
  db.exec("ALTER TABLE avatars ADD COLUMN idle_disabled INTEGER DEFAULT 0")
if (!existing.includes('anim_pingpong'))
  db.exec("ALTER TABLE avatars ADD COLUMN anim_pingpong INTEGER DEFAULT 0")
if (!existing.includes('idle_bg_opacity'))
  db.exec("ALTER TABLE avatars ADD COLUMN idle_bg_opacity REAL DEFAULT 1")
if (!existing.includes('bg_video'))
  db.exec("ALTER TABLE avatars ADD COLUMN bg_video TEXT DEFAULT ''")
if (!existing.includes('idle_font'))
  db.exec("ALTER TABLE avatars ADD COLUMN idle_font TEXT DEFAULT ''");
if (!existing.includes('idle_font_size'))
  db.exec("ALTER TABLE avatars ADD COLUMN idle_font_size REAL DEFAULT 1.1");
if (!existing.includes('theme'))
  db.exec("ALTER TABLE avatars ADD COLUMN theme TEXT DEFAULT 'viola'");

export default db;
