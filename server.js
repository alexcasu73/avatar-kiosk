/**
 * Avatar Kiosk Platform - Server Node.js
 */

import 'dotenv/config';
import compression from 'compression';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import Anthropic from '@anthropic-ai/sdk';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import fs from 'fs';
import db from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app    = express();
const server = createServer(app);
const wss    = new WebSocketServer({ server });

// ─── Config globale (fallback se nessun avatar specifico) ─────────────────────
const PORT         = process.env.PORT         || 3000;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const AVATAR_NAME  = process.env.AVATAR_NAME  || 'Sofia';
const DEFAULT_SYSTEM_PROMPT = process.env.AVATAR_SYSTEM_PROMPT ||
  `Sei ${AVATAR_NAME}, un'assistente virtuale professionale su un totem interattivo. Rispondi in modo chiaro, conciso e amichevole. Max 3 frasi.`;
const DEFAULT_VOICE_ID   = process.env.ELEVENLABS_VOICE_ID || '';
const DEFAULT_STT_MODEL  = process.env.STT_MODEL    || 'whisper-1';
const DEFAULT_STT_LANG   = process.env.STT_LANGUAGE || 'it';
const DEFAULT_TTS_MODEL  = process.env.TTS_MODEL    || 'eleven_multilingual_v2';
const DEFAULT_TTS_STAB   = parseFloat(process.env.TTS_STABILITY  || '0.5');
const DEFAULT_TTS_SIM    = parseFloat(process.env.TTS_SIMILARITY || '0.75');
const DEFAULT_AI_TOKENS  = parseInt(process.env.AI_MAX_TOKENS    || '512');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const sessions  = new Map();

// ─── Admin auth ───────────────────────────────────────────────────────────────
const ADMIN_USER     = process.env.ADMIN_USER     || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
const adminTokens    = new Map(); // token → expiry

function genToken() { return uuidv4() + uuidv4(); }
function isAdminAuth(req) {
  const token = req.headers.cookie?.match(/admin_token=([^;]+)/)?.[1];
  if (!token) return false;
  const exp = adminTokens.get(token);
  if (!exp || Date.now() > exp) { adminTokens.delete(token); return false; }
  return true;
}
function requireAdmin(req, res, next) {
  if (isAdminAuth(req)) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Non autorizzato' });
  res.redirect('/admin/login');
}

app.set('trust proxy', 1);
app.use(compression({ level: 6 }));
app.use(cors());
app.use(express.json({ limit: '200mb' }));
// Cache aggressiva per asset statici immutabili
app.use('/lib', express.static(join(__dirname, 'public', 'lib'), {
  maxAge: '30d', immutable: true,
}));
app.use('/models', express.static(join(__dirname, 'public', 'models'), {
  maxAge: '7d',
}));
app.use('/backgrounds', express.static(join(__dirname, 'public', 'backgrounds'), {
  maxAge: '7d',
}));
app.use('/icons', express.static(join(__dirname, 'public', 'icons'), {
  maxAge: '7d',
}));
// Blocca accesso diretto a public/admin/* senza autenticazione
app.use('/admin', (req, res, next) => {
  if (req.path === '/login') return next();
  if (isAdminAuth(req)) return next();
  res.redirect('/admin/login');
});

app.use(express.static(join(__dirname, 'public')));

// ─── WebSocket ────────────────────────────────────────────────────────────────
const clients = new Map();
wss.on('connection', ws => {
  const id = uuidv4();
  clients.set(id, ws);
  ws.send(JSON.stringify({ type: 'connected', clientId: id }));
  ws.on('close', () => clients.delete(id));
});

// ─── Helper: carica config avatar dal DB ──────────────────────────────────────
function getAvatarConfig(avatarId) {
  if (!avatarId) return null;
  return db.prepare('SELECT * FROM avatars WHERE id = ?').get(avatarId) || null;
}

// ─── Route: Health check ──────────────────────────────────────────────────────
app.get('/', (req, res) => res.redirect('/admin'));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    avatar: AVATAR_NAME,
    model:  CLAUDE_MODEL,
    tts:    !!process.env.ELEVENLABS_API_KEY,
    stt:    !!process.env.OPENAI_API_KEY,
  });
});

// ─── Route: Config avatar per kiosk ──────────────────────────────────────────
app.get('/api/avatar/:id', (req, res) => {
  const avatar = db.prepare('SELECT * FROM avatars WHERE id = ? AND published = 1').get(req.params.id);
  if (!avatar) return res.status(404).json({ error: 'Avatar non trovato o non pubblicato' });
  const { id, name, background, bg_video, model_file, idle_start, idle_end,
          speech_start, speech_end, anim_pingpong, tts_text_normalization, tts_language_normalization, avatar_scale, avatar_offset_x,
          avatar_offset_y, avatar_rot_y, camera_z, camera_y, camera_look_at_y,
          overlay_color, overlay_opacity, overlay_height, chat_height, chat_bottom, chat_max_width, chat_align, chat_hide_input,
          idle_disabled, idle_timeout, idle_icon, idle_icon_img, idle_video, idle_bg_image, idle_bg_color, idle_bg_color_alpha, idle_bg_opacity, idle_title, idle_subtitle, idle_hint, idle_font, idle_font_size,
          chat_font, chat_font_size,
          show_controls,
          mic_icon, mic_icon_disabled, mic_icon_size, mic_icon_x, mic_icon_y, mic_visible, mic_bg_color, mic_disabled_color, mic_border_color, mic_border_disabled_color,
          audio_icon, audio_icon_disabled, audio_icon_size, audio_icon_x, audio_icon_y, audio_visible, audio_bg_color, audio_disabled_color, audio_border_color, audio_border_disabled_color,
          mic_wave_color, audio_wave_color, theme } = avatar;
  res.json({ id, name, background, bg_video, model_file, idle_start, idle_end,
             speech_start, speech_end, anim_pingpong, tts_text_normalization, tts_language_normalization, avatar_scale, avatar_offset_x,
             avatar_offset_y, avatar_rot_y, camera_z, camera_y, camera_look_at_y,
             overlay_color, overlay_opacity, overlay_height, chat_height, chat_bottom, chat_max_width, chat_align, chat_hide_input,
             idle_disabled, idle_timeout, idle_icon, idle_icon_img, idle_video, idle_bg_image, idle_bg_color, idle_bg_color_alpha, idle_bg_opacity, idle_title, idle_subtitle, idle_hint, idle_font, idle_font_size,
             chat_font, chat_font_size,
             show_controls,
             mic_icon, mic_icon_disabled, mic_icon_size, mic_icon_x, mic_icon_y, mic_visible, mic_bg_color, mic_disabled_color, mic_border_color, mic_border_disabled_color,
             audio_icon, audio_icon_disabled, audio_icon_size, audio_icon_x, audio_icon_y, audio_visible, audio_bg_color, audio_disabled_color, audio_border_color, audio_border_disabled_color,
             mic_wave_color, audio_wave_color, theme });
});

// ─── Route: Kiosk page ────────────────────────────────────────────────────────
app.get('/k/:id', (req, res) => {
  const avatar = db.prepare('SELECT * FROM avatars WHERE id = ? AND published = 1').get(req.params.id);
  if (!avatar) return res.status(404).send('<h1>Avatar non trovato o non pubblicato</h1>');
  res.sendFile(join(__dirname, 'public', 'kiosk.html'));
});

// ─── Route: Preview (anche non pubblicati, per backoffice) ────────────────────
app.get('/preview/:id', (req, res) => {
  const avatar = db.prepare('SELECT * FROM avatars WHERE id = ?').get(req.params.id);
  if (!avatar) return res.status(404).send('<h1>Avatar non trovato</h1>');
  res.sendFile(join(__dirname, 'public', 'kiosk.html'));
});

app.get('/api/preview/:id', (req, res) => {
  const avatar = db.prepare('SELECT * FROM avatars WHERE id = ?').get(req.params.id);
  if (!avatar) return res.status(404).json({ error: 'Non trovato' });
  const { id, name, background, bg_video, model_file, idle_start, idle_end,
          speech_start, speech_end, anim_pingpong, tts_text_normalization, tts_language_normalization, avatar_scale, avatar_offset_x,
          avatar_offset_y, avatar_rot_y, camera_z, camera_y, camera_look_at_y,
          overlay_color, overlay_opacity, overlay_height, chat_height, chat_bottom, chat_max_width, chat_align, chat_hide_input,
          idle_disabled, idle_timeout, idle_icon, idle_icon_img, idle_video, idle_bg_image, idle_bg_color, idle_bg_color_alpha, idle_bg_opacity, idle_title, idle_subtitle, idle_hint, idle_font, idle_font_size,
          chat_font, chat_font_size,
          show_controls,
          mic_icon, mic_icon_disabled, mic_icon_size, mic_icon_x, mic_icon_y, mic_visible, mic_bg_color, mic_disabled_color, mic_border_color, mic_border_disabled_color,
          audio_icon, audio_icon_disabled, audio_icon_size, audio_icon_x, audio_icon_y, audio_visible, audio_bg_color, audio_disabled_color, audio_border_color, audio_border_disabled_color,
          mic_wave_color, audio_wave_color, theme } = avatar;
  res.json({ id, name, background, bg_video, model_file, idle_start, idle_end,
             speech_start, speech_end, anim_pingpong, tts_text_normalization, tts_language_normalization, avatar_scale, avatar_offset_x,
             avatar_offset_y, avatar_rot_y, camera_z, camera_y, camera_look_at_y,
             overlay_color, overlay_opacity, overlay_height, chat_height, chat_bottom, chat_max_width, chat_align, chat_hide_input,
             idle_disabled, idle_timeout, idle_icon, idle_icon_img, idle_video, idle_bg_image, idle_bg_color, idle_bg_color_alpha, idle_bg_opacity, idle_title, idle_subtitle, idle_hint, idle_font, idle_font_size,
             chat_font, chat_font_size,
             show_controls,
             mic_icon, mic_icon_disabled, mic_icon_size, mic_icon_x, mic_icon_y, mic_visible, mic_bg_color, mic_disabled_color, mic_border_color, mic_border_disabled_color,
             audio_icon, audio_icon_disabled, audio_icon_size, audio_icon_x, audio_icon_y, audio_visible, audio_bg_color, audio_disabled_color, audio_border_color, audio_border_disabled_color,
             mic_wave_color, audio_wave_color, theme });
});

// ─── Route: Admin login ───────────────────────────────────────────────────────
app.get('/admin/login', (req, res) => {
  if (isAdminAuth(req)) return res.redirect('/admin');
  res.send(`<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin Login</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#0a0a0f;font-family:system-ui,sans-serif;color:#e0e0e0}
  .card{background:#13131a;border:1px solid #2a2a3a;border-radius:16px;padding:40px;width:340px}
  h1{font-size:1.2rem;font-weight:700;margin-bottom:28px;color:#fff;letter-spacing:.05em}
  label{display:block;font-size:.75rem;color:#888;margin-bottom:6px}
  input{width:100%;padding:10px 14px;background:#0a0a0f;border:1px solid #2a2a3a;
        border-radius:8px;color:#e0e0e0;font-size:.95rem;margin-bottom:18px;outline:none}
  input:focus{border-color:#6c63ff}
  button{width:100%;padding:12px;background:#6c63ff;color:#fff;border:none;
         border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer}
  button:hover{background:#857af7}
  .err{color:#f87171;font-size:.82rem;margin-top:14px;text-align:center}
</style></head><body>
<div class="card">
  <h1>🔐 Avatar Kiosk Admin</h1>
  <form method="POST" action="/admin/login">
    <label>Username</label>
    <input type="text" name="username" autocomplete="username" required autofocus/>
    <label>Password</label>
    <input type="password" name="password" autocomplete="current-password" required/>
    <button type="submit">Accedi</button>
    ${req.query.err ? '<p class="err">Credenziali non valide</p>' : ''}
  </form>
</div></body></html>`);
});

app.use(express.urlencoded({ extended: false }));

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username !== ADMIN_USER || password !== ADMIN_PASSWORD)
    return res.redirect('/admin/login?err=1');
  const token = genToken();
  adminTokens.set(token, Date.now() + 8 * 60 * 60 * 1000); // 8 ore
  const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.secure;
  res.setHeader('Set-Cookie', `admin_token=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=2592000${isHttps ? '; Secure' : ''}`);
  res.redirect('/admin');
});

app.post('/admin/logout', (req, res) => {
  const token = req.headers.cookie?.match(/admin_token=([^;]+)/)?.[1];
  if (token) adminTokens.delete(token);
  res.setHeader('Set-Cookie', 'admin_token=; HttpOnly; Path=/; Max-Age=0');
  res.redirect('/admin/login');
});

// ─── Route: Admin page ────────────────────────────────────────────────────────
app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(join(__dirname, 'public', 'admin', 'index.html'));
});

// ─── CRUD Avatar ──────────────────────────────────────────────────────────────
app.use('/api/admin', requireAdmin);

app.get('/api/admin/avatars', (req, res) => {
  const avatars = db.prepare('SELECT * FROM avatars ORDER BY created_at DESC').all();
  res.json(avatars);
});

app.post('/api/admin/avatars', (req, res) => {
  const id = uuidv4().split('-')[0]; // ID corto
  const { name = 'Nuovo Avatar', voice_id = '', system_prompt = DEFAULT_SYSTEM_PROMPT,
          background = '#0a0a0f' } = req.body;
  db.prepare(`INSERT INTO avatars (id, name, voice_id, system_prompt, background,
              chat_font_size, idle_font_size, mic_icon_size, audio_icon_size, chat_bottom)
              VALUES (?, ?, ?, ?, ?, 1.1, 1.1, 100, 100, 100)`).run(id, name, voice_id, system_prompt, background);
  res.json(db.prepare('SELECT * FROM avatars WHERE id = ?').get(id));
});

app.put('/api/admin/avatars/:id', (req, res) => {
  const fields = ['name','voice_id','system_prompt','background','idle_start','idle_end',
                  'speech_start','speech_end','avatar_scale','avatar_offset_x','avatar_offset_y',
                  'avatar_rot_y','camera_z','camera_y','camera_look_at_y',
                  'overlay_color','overlay_opacity','overlay_height','chat_height','chat_bottom','chat_max_width','chat_align','chat_hide_input',
                  'stt_api_key','stt_model','stt_language',
                  'tts_api_key','tts_model','tts_stability','tts_similarity','tts_text_normalization','tts_language_normalization','texture_quality',
                  'ai_provider','ai_max_tokens','anthropic_api_key','anthropic_model','openai_api_key','openai_model',
                  'avatar_mode','webhook_url','webhook_input_template','webhook_output_field','webhook_headers',
                  'idle_disabled','idle_timeout','idle_icon','idle_title','idle_subtitle','idle_hint','idle_font','idle_font_size','idle_bg_image','idle_bg_color','idle_bg_color_alpha','idle_bg_opacity','anim_pingpong','theme',
                  'chat_font','chat_font_size',
                  'show_controls',
                  'mic_icon_size','mic_icon_x','mic_icon_y','mic_wave_color',
                  'mic_visible','mic_bg_color','mic_disabled_color','mic_border_color','mic_border_disabled_color',
                  'audio_icon_size','audio_icon_x','audio_icon_y','audio_wave_color',
                  'audio_visible','audio_bg_color','audio_disabled_color','audio_border_color','audio_border_disabled_color',
                  'mic_icon_disabled','audio_icon_disabled'];
  const updates = [];
  const values  = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); values.push(req.body[f]); }
  }
  if (!updates.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });
  updates.push("updated_at = datetime('now')");
  values.push(req.params.id);
  db.prepare(`UPDATE avatars SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  const updated = db.prepare('SELECT * FROM avatars WHERE id = ?').get(req.params.id);
  // Broadcast ai kiosk connessi
  const broadcast = JSON.stringify({ type: 'config_update', avatarId: String(req.params.id), data: updated });
  for (const ws of clients.values()) { try { ws.send(broadcast); } catch {} }
  res.json(updated);
});

app.delete('/api/admin/avatars/:id', (req, res) => {
  const avatar = db.prepare('SELECT * FROM avatars WHERE id = ?').get(req.params.id);
  if (!avatar) return res.status(404).json({ error: 'Non trovato' });
  // Elimina file modello solo se nessun altro avatar lo usa
  if (avatar.model_file) {
    const refs = db.prepare('SELECT COUNT(*) as n FROM avatars WHERE model_file = ? AND id != ?').get(avatar.model_file, req.params.id);
    if (refs.n === 0) { try { fs.unlinkSync(join(__dirname, 'public', avatar.model_file)); } catch {} }
  }
  db.prepare('DELETE FROM avatars WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/admin/avatars/:id/duplicate', (req, res) => {
  const src = db.prepare('SELECT * FROM avatars WHERE id = ?').get(req.params.id);
  if (!src) return res.status(404).json({ error: 'Non trovato' });
  const newId = Math.random().toString(36).slice(2, 10);
  const { id, created_at, updated_at, published, name, ...rest } = src;
  db.prepare(`INSERT INTO avatars (id, name, published, ${Object.keys(rest).join(',')})
              VALUES (?, ?, 0, ${Object.keys(rest).map(() => '?').join(',')})`)
    .run(newId, `${name} (copia)`, ...Object.values(rest));
  const newAvatar = db.prepare('SELECT * FROM avatars WHERE id = ?').get(newId);
  res.json(newAvatar);
});

app.post('/api/admin/avatars/:id/publish', (req, res) => {
  const avatar = db.prepare('SELECT * FROM avatars WHERE id = ?').get(req.params.id);
  if (!avatar) return res.status(404).json({ error: 'Non trovato' });
  const published = avatar.published ? 0 : 1;
  db.prepare("UPDATE avatars SET published = ?, updated_at = datetime('now') WHERE id = ?")
    .run(published, req.params.id);
  res.json({ published });
});

// ─── Upload FBX / GLB / GLTF per avatar specifico ────────────────────────────
const uploadFbx = multer({ storage: multer.diskStorage({
  destination: (req, file, cb) => cb(null, join(__dirname, 'public', 'models')),
  filename: (req, file, cb) => {
    const ext = file.originalname.split('.').pop().toLowerCase();
    cb(null, `${req.params.id}_tmp.${ext}`);
  },
}) });

app.post('/api/admin/avatars/:id/upload-model', uploadFbx.single('model'), async (req, res) => {
  const rawGlb  = join(__dirname, 'public', 'models', `${req.params.id}_raw.glb`);
  const outGlb  = join(__dirname, 'public', 'models', `${req.params.id}.glb`);
  try {
    if (!req.file) return res.status(400).json({ error: 'Nessun file ricevuto' });
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    const tmpFile = join(__dirname, 'public', 'models', req.file.filename);

    if (ext === 'fbx') {
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');

      // Trova FBX2glTF (fbx2gltf npm package o sistema)
      let fbx2gltf = null;
      const candidates = [
        join(__dirname, 'node_modules/fbx2gltf/bin/Darwin/FBX2glTF'),
        join(__dirname, 'node_modules/fbx2gltf/bin/Linux/FBX2glTF'),
        join(__dirname, 'node_modules/fbx2gltf/bin/Windows_NT/FBX2glTF.exe'),
        '/usr/local/bin/FBX2glTF',
        '/opt/homebrew/bin/FBX2glTF',
        join(process.env.HOME || '', '.npm-global/lib/node_modules/fbx2gltf/bin/Darwin/FBX2glTF'),
        join(process.env.HOME || '', '.npm-global/lib/node_modules/fbx2gltf/bin/Linux/FBX2glTF'),
      ];
      for (const c of candidates) {
        try { if (fs.existsSync(c)) { fbx2gltf = c; break; } } catch {}
      }

      let converted = false;

      // Prova FBX2glTF
      if (fbx2gltf) {
        try {
          const rawGlbBase = rawGlb.replace(/\.glb$/, '');
          await promisify(execFile)(fbx2gltf, ['--binary', tmpFile, '--output', rawGlbBase]);
          converted = true;
        } catch (e) {
          console.warn('FBX2glTF fallito, provo Blender:', e.message);
        }
      }

      // Fallback: Blender headless (ARM64 / FBX2glTF non disponibile)
      if (!converted) {
        const blenderScript = `
import bpy, sys
bpy.ops.wm.read_factory_settings(use_empty=True)
fbx_path = sys.argv[-2]
glb_path = sys.argv[-1]
print("Importing FBX:", fbx_path)
bpy.ops.import_scene.fbx(filepath=fbx_path, automatic_bone_orientation=True)
print("Exporting GLB:", glb_path)
bpy.ops.export_scene.gltf(
    filepath=glb_path,
    export_format='GLB',
    use_selection=False,
    export_yup=True,
)
print("Done")
`.trim();
        const scriptFile = tmpFile + '.py';
        fs.writeFileSync(scriptFile, blenderScript);
        try {
          const { exec } = await import('child_process');
          const blenderCmd = `blender --background --python "${scriptFile}" -- "${tmpFile}" "${rawGlb.replace(/\.glb$/, '')}"`;
          const { stdout: bOut, stderr: bErr } = await promisify(exec)(blenderCmd, { timeout: 120000 });
          if (bOut) console.log('Blender stdout:', bOut.slice(-2000));
          if (bErr) console.log('Blender stderr:', bErr.slice(-1000));
          // Blender aggiunge .glb al nome output
          const blenderOut = rawGlb.replace(/\.glb$/, '') + '.glb';
          if (fs.existsSync(blenderOut) && blenderOut !== rawGlb) fs.renameSync(blenderOut, rawGlb);
          converted = fs.existsSync(rawGlb);
          if (!converted) console.error('Blender non ha prodotto output GLB');
        } catch (e) {
          console.error('Blender fallback fallito:', e.message, e.stderr || '');
        } finally {
          try { fs.unlinkSync(scriptFile); } catch {}
        }
      }

      fs.unlinkSync(tmpFile);
      if (!converted) return res.status(500).json({ error: 'Conversione FBX fallita. Esporta il modello in .glb o .gltf e caricalo direttamente.' });
    } else if (ext === 'glb') {
      // GLB: usa direttamente come raw
      fs.renameSync(tmpFile, rawGlb);
    } else if (ext === 'gltf') {
      // GLTF: converti in GLB tramite gltf-pipeline
      const gltfPipeline = (await import('gltf-pipeline')).default;
      const gltfContent = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
      const result = await gltfPipeline.gltfToGlb(gltfContent, { resourceDirectory: join(__dirname, 'public', 'models') });
      fs.writeFileSync(rawGlb, result.glb);
      fs.unlinkSync(tmpFile);
    } else {
      fs.unlinkSync(tmpFile);
      return res.status(400).json({ error: 'Formato non supportato. Usa FBX, GLB o GLTF.' });
    }

    // 2. Comprimi texture PNG → JPEG nel GLB (ricostruisce il binary da zero)
    const skipCompress = req.query.skipCompress === '1';
    let originalKB, compressedKB, jsonForAnim;
    if (skipCompress) {
      fs.renameSync(rawGlb, outGlb);
      originalKB = compressedKB = Math.round(fs.statSync(outGlb).size / 1024);
      try {
        const buf = fs.readFileSync(outGlb);
        const jl = buf.readUInt32LE(12);
        jsonForAnim = JSON.parse(buf.slice(20, 20 + jl).toString());
      } catch (_) {}
    } else {
    const avatarRow = db.prepare('SELECT texture_quality FROM avatars WHERE id = ?').get(req.params.id);
    const TEX_QUALITY = Math.max(60, Math.min(100, parseInt(req.query.texQuality) || parseInt(avatarRow?.texture_quality) || 85));
    const sharp = (await import('sharp')).default;
    const rawKB = Math.round(fs.statSync(rawGlb).size / 1024);
    const glbBuf = fs.readFileSync(rawGlb);
    const jsonLen = glbBuf.readUInt32LE(12);
    const json = JSON.parse(glbBuf.slice(20, 20 + jsonLen).toString());
    const binOffset = 12 + 8 + jsonLen + 8;
    const origBin = glbBuf.slice(binOffset);

    // Raccoglie i chunk del nuovo binary: per ogni bufferView, usa dati originali o compressi
    const newChunks = [];
    let newOffset = 0;

    // Mappa bufferView → nuovo chunk (per gestire bufferView non-texture invariate)
    const bvRemap = new Map(); // bvIndex → { offset, length }

    // Prima passa: comprime le texture e raccoglie i chunk
    const imgBvSet = new Set((json.images || []).map(img => img.bufferView).filter(i => i !== undefined));

    for (let bvIdx = 0; bvIdx < (json.bufferViews || []).length; bvIdx++) {
      const bv = json.bufferViews[bvIdx];
      const data = origBin.slice(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
      let outData = data;

      if (imgBvSet.has(bvIdx)) {
        const img = (json.images || []).find(i => i.bufferView === bvIdx);
        if (img && (img.mimeType === 'image/png' || img.mimeType === 'image/jpeg')) {
          try {
            const meta = await sharp(data).metadata();
            const MAX_TEX = 2048;
            const needsResize = meta.width > MAX_TEX || meta.height > MAX_TEX;
            const pipeline = needsResize
              ? sharp(data).resize(MAX_TEX, MAX_TEX, { fit: 'inside', withoutEnlargement: true })
              : sharp(data);
            const compressed = await pipeline.jpeg({ quality: TEX_QUALITY, mozjpeg: true }).toBuffer();
            outData = compressed;
            img.mimeType = 'image/jpeg';
          } catch (e) { console.error('Sharp compress error bv'+bvIdx+':', e.message); }
        }
      }

      const aligned = Buffer.alloc(Math.ceil(outData.length / 4) * 4, 0x00);
      outData.copy(aligned);
      newChunks.push(aligned);
      bvRemap.set(bvIdx, { offset: newOffset, length: outData.length });
      newOffset += aligned.length;
    }

    // Aggiorna gli offset dei bufferViews nel JSON
    for (let bvIdx = 0; bvIdx < (json.bufferViews || []).length; bvIdx++) {
      const r = bvRemap.get(bvIdx);
      if (r) { json.bufferViews[bvIdx].byteOffset = r.offset; json.bufferViews[bvIdx].byteLength = r.length; }
    }

    const newBin = Buffer.concat(newChunks);
    json.buffers[0].byteLength = newBin.length;

    const newJsonStr = JSON.stringify(json);
    const jsonPadded = Buffer.alloc(Math.ceil(newJsonStr.length / 4) * 4, 0x20);
    Buffer.from(newJsonStr).copy(jsonPadded);
    const binPadded = Buffer.alloc(Math.ceil(newBin.length / 4) * 4, 0x00);
    newBin.copy(binPadded);
    const totalLen = 12 + 8 + jsonPadded.length + 8 + binPadded.length;
    const header = Buffer.alloc(12); header.writeUInt32LE(0x46546C67,0); header.writeUInt32LE(2,4); header.writeUInt32LE(totalLen,8);
    const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonPadded.length,0); jh.writeUInt32LE(0x4E4F534A,4);
    const bh = Buffer.alloc(8); bh.writeUInt32LE(binPadded.length,0);  bh.writeUInt32LE(0x004E4942,4);
    fs.writeFileSync(outGlb, Buffer.concat([header,jh,jsonPadded,bh,binPadded]));
    fs.unlinkSync(rawGlb);

    originalKB   = rawKB;
    compressedKB = Math.round(fs.statSync(outGlb).size / 1024);
    console.log(`Texture compress: ${originalKB}KB → ${compressedKB}KB (-${Math.round((1-compressedKB/originalKB)*100)}%)`);
    jsonForAnim = json;
    } // end else (skipCompress)

    // Calcola durata animazioni per settare idle/speech interval di default
    let animDuration = null;
    try {
      for (const anim of ((jsonForAnim || {}).animations || [])) {
        for (const sampler of (anim.samplers || [])) {
          const acc = (jsonForAnim.accessors || [])[sampler.input];
          if (acc?.max?.[0] != null) animDuration = Math.max(animDuration ?? 0, acc.max[0]);
        }
      }
    } catch (_) {}

    const modelFile = `models/${req.params.id}.glb`;
    if (animDuration != null) {
      db.prepare("UPDATE avatars SET model_file = ?, idle_start = 0, idle_end = ?, speech_start = 0, speech_end = ?, updated_at = datetime('now') WHERE id = ?")
        .run(modelFile, animDuration, animDuration, req.params.id);
    } else {
      db.prepare("UPDATE avatars SET model_file = ?, updated_at = datetime('now') WHERE id = ?")
        .run(modelFile, req.params.id);
    }
    res.json({ ok: true, model_file: modelFile, originalKB, compressedKB, animDuration });
  } catch (err) {
    console.error('Upload model error:', err);
    try { if (fs.existsSync(rawGlb)) fs.unlinkSync(rawGlb); } catch {}
    res.status(500).json({ error: 'Conversione fallita: ' + err.message });
  }
});

// ─── Upload sfondo per avatar ─────────────────────────────────────────────────
const uploadBg = multer({ storage: multer.diskStorage({
  destination: (req, file, cb) => cb(null, join(__dirname, 'public', 'backgrounds')),
  filename:    (req, file, cb) => cb(null, `${req.params.id}${extname(file.originalname)}`),
}) });

app.post('/api/admin/avatars/:id/upload-background', uploadBg.single('background'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nessun file ricevuto' });
  const bgFile = `backgrounds/${req.file.filename}`;
  db.prepare("UPDATE avatars SET background = ?, updated_at = datetime('now') WHERE id = ?")
    .run(bgFile, req.params.id);
  res.json({ ok: true, background: bgFile });
});

// ─── Route: Upload video sfondo avatar ───────────────────────────────────────
fs.mkdirSync(join(__dirname, 'public', 'bg-videos'), { recursive: true });
app.use('/bg-videos', express.static(join(__dirname, 'public', 'bg-videos')));

const uploadBgVideo = multer({ storage: multer.diskStorage({
  destination: (req, file, cb) => cb(null, join(__dirname, 'public', 'bg-videos')),
  filename:    (req, file, cb) => cb(null, `${req.params.id}${extname(file.originalname)}`),
}) });

app.post('/api/admin/avatars/:id/upload-bg-video', uploadBgVideo.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nessun file ricevuto' });
  const videoFile = `bg-videos/${req.file.filename}`;
  db.prepare("UPDATE avatars SET bg_video = ?, updated_at = datetime('now') WHERE id = ?")
    .run(videoFile, req.params.id);
  res.json({ ok: true, bg_video: videoFile });
});

app.delete('/api/admin/avatars/:id/bg-video', (req, res) => {
  const avatar = db.prepare('SELECT bg_video FROM avatars WHERE id = ?').get(req.params.id);
  if (avatar?.bg_video) { try { fs.unlinkSync(join(__dirname, 'public', avatar.bg_video)); } catch {} }
  db.prepare("UPDATE avatars SET bg_video = '', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ─── Route: Upload video standby ─────────────────────────────────────────────
fs.mkdirSync(join(__dirname, 'public', 'idle-videos'), { recursive: true });
app.use('/idle-videos', express.static(join(__dirname, 'public', 'idle-videos')));

const uploadIdleVideo = multer({ storage: multer.diskStorage({
  destination: (req, file, cb) => cb(null, join(__dirname, 'public', 'idle-videos')),
  filename:    (req, file, cb) => cb(null, `${req.params.id}${extname(file.originalname)}`),
}) });

app.post('/api/admin/avatars/:id/upload-idle-video', uploadIdleVideo.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nessun file ricevuto' });
  const videoFile = `idle-videos/${req.file.filename}`;
  db.prepare("UPDATE avatars SET idle_video = ?, updated_at = datetime('now') WHERE id = ?")
    .run(videoFile, req.params.id);
  res.json({ ok: true, idle_video: videoFile });
});

app.delete('/api/admin/avatars/:id/idle-video', (req, res) => {
  const avatar = db.prepare('SELECT idle_video FROM avatars WHERE id = ?').get(req.params.id);
  if (avatar?.idle_video) { try { fs.unlinkSync(join(__dirname, 'public', avatar.idle_video)); } catch {} }
  db.prepare("UPDATE avatars SET idle_video = '', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ─── Route: Upload immagine sfondo idle ──────────────────────────────────────
fs.mkdirSync(join(__dirname, 'public', 'idle-bg'), { recursive: true });
app.use('/idle-bg', express.static(join(__dirname, 'public', 'idle-bg')));

const uploadIdleBg = multer({ storage: multer.diskStorage({
  destination: (req, file, cb) => cb(null, join(__dirname, 'public', 'idle-bg')),
  filename:    (req, file, cb) => cb(null, `${req.params.id}${extname(file.originalname)}`),
}) });

app.post('/api/admin/avatars/:id/upload-idle-bg', uploadIdleBg.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nessun file ricevuto' });
  const bgFile = `idle-bg/${req.file.filename}`;
  db.prepare("UPDATE avatars SET idle_bg_image = ?, updated_at = datetime('now') WHERE id = ?")
    .run(bgFile, req.params.id);
  res.json({ ok: true, idle_bg_image: bgFile });
});

app.delete('/api/admin/avatars/:id/idle-bg', (req, res) => {
  const avatar = db.prepare('SELECT idle_bg_image FROM avatars WHERE id = ?').get(req.params.id);
  if (avatar?.idle_bg_image) { try { fs.unlinkSync(join(__dirname, 'public', avatar.idle_bg_image)); } catch {} }
  db.prepare("UPDATE avatars SET idle_bg_image = '', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ─── Route: Upload icone mic/audio ───────────────────────────────────────────
fs.mkdirSync(join(__dirname, 'public', 'icons'), { recursive: true });

const uploadIcon = multer({ storage: multer.diskStorage({
  destination: (req, file, cb) => cb(null, join(__dirname, 'public', 'icons')),
  filename:    (req, file, cb) => cb(null, `${req.params.id}-${req.params.type}${extname(file.originalname)}`),
}) });

app.post('/api/admin/avatars/:id/upload-icon/:type', uploadIcon.single('icon'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nessun file ricevuto' });
  const type = req.params.type; // 'mic' | 'audio' | 'idle'
  if (!['mic', 'mic-disabled', 'audio', 'audio-disabled', 'idle'].includes(type)) return res.status(400).json({ error: 'Tipo non valido' });
  const iconFile = `icons/${req.file.filename}`;
  const col = type === 'mic' ? 'mic_icon' : type === 'mic-disabled' ? 'mic_icon_disabled'
            : type === 'audio' ? 'audio_icon' : type === 'audio-disabled' ? 'audio_icon_disabled' : 'idle_icon_img';
  db.prepare(`UPDATE avatars SET ${col} = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(iconFile, req.params.id);
  res.json({ ok: true, [col]: iconFile });
});

// ─── Route: STT ──────────────────────────────────────────────────────────────
app.post('/api/stt', multer({ storage: multer.memoryStorage() }).single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nessun file audio ricevuto' });
    const avatar   = getAvatarConfig(req.body?.avatarId);
    const sttKey   = avatar?.stt_api_key  || process.env.OPENAI_API_KEY;
    const sttModel = avatar?.stt_model    || DEFAULT_STT_MODEL;
    const sttLang  = avatar?.stt_language || DEFAULT_STT_LANG;
    const formData = new FormData();
    formData.append('file', new Blob([req.file.buffer], { type: req.file.mimetype || 'audio/webm' }), 'audio.webm');
    formData.append('model', sttModel);
    formData.append('language', sttLang);
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sttKey}` },
      body: formData,
    });
    if (!response.ok) throw new Error(`Whisper error: ${await response.text()}`);
    const data = await response.json();
    res.json({ transcript: data.text });
  } catch (error) {
    console.error('STT error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Route: Fetch modelli (admin) ────────────────────────────────────────────
app.post('/api/admin/fetch-models', async (req, res) => {
  try {
    const { provider, apiKey } = req.body;
    if (!provider || !apiKey) return res.status(400).json({ error: 'provider e apiKey obbligatori' });

    if (provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!r.ok) throw new Error(`OpenAI: ${await r.text()}`);
      const data = await r.json();
      const models = data.data
        .filter(m => m.id.includes('whisper') || m.id.includes('transcri'))
        .map(m => ({ id: m.id, name: m.id }))
        .sort((a,b) => a.id.localeCompare(b.id));
      return res.json({ models });
    }

    if (provider === 'openai-gpt') {
      const r = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!r.ok) throw new Error(`OpenAI: ${await r.text()}`);
      const data = await r.json();
      const models = data.data
        .filter(m => m.id.startsWith('gpt') || m.id.startsWith('o1') || m.id.startsWith('o3'))
        .map(m => ({ id: m.id, name: m.id }))
        .sort((a,b) => a.id.localeCompare(b.id));
      return res.json({ models });
    }

    if (provider === 'elevenlabs-models') {
      const r = await fetch('https://api.elevenlabs.io/v1/models', {
        headers: { 'xi-api-key': apiKey },
      });
      const raw = await r.text();
      if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${raw.slice(0,200)}`);
      let data; try { data = JSON.parse(raw); } catch { throw new Error(`Risposta non JSON: ${raw.slice(0,200)}`); }
      if (!Array.isArray(data)) throw new Error(`Formato inatteso: ${JSON.stringify(data).slice(0,200)}`);
      const models = data.map(m => ({ id: m.model_id, name: m.name }));
      return res.json({ models });
    }

    if (provider === 'elevenlabs-voices') {
      const r = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': apiKey },
      });
      const raw = await r.text();
      if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${raw.slice(0,200)}`);
      let data; try { data = JSON.parse(raw); } catch { throw new Error(`Risposta non JSON: ${raw.slice(0,200)}`); }
      if (!data.voices) throw new Error(`Campo 'voices' mancante: ${JSON.stringify(data).slice(0,200)}`);
      const models = data.voices.map(v => ({ id: v.voice_id, name: v.name }));
      return res.json({ models });
    }

    if (provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      });
      const raw = await r.text();
      if (!r.ok) throw new Error(`Anthropic ${r.status}: ${raw.slice(0,200)}`);
      let data; try { data = JSON.parse(raw); } catch { throw new Error(`Risposta non JSON: ${raw.slice(0,200)}`); }
      if (!data.data) throw new Error(`Formato inatteso: ${JSON.stringify(data).slice(0,200)}`);
      const models = data.data.map(m => ({ id: m.id, name: m.display_name || m.id }));
      return res.json({ models });
    }

    res.status(400).json({ error: `Provider '${provider}' non supportato` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Route: Test webhook (admin) ─────────────────────────────────────────────
app.post('/api/admin/webhook-test', async (req, res) => {
  try {
    const { url, inputTemplate, outputField, headers: extraHdrs, message } = req.body;
    if (!url) return res.status(400).json({ error: 'URL mancante' });
    const testMsg   = message || 'test';
    const template  = inputTemplate || '{"query":"{{query}}"}';
    const sid       = uuidv4();
    const timestamp = new Date().toISOString();
    const esc = s => s.replace(/\\/g,'\\\\').replace(/"/g,'\\"');
    const jsonStr = template
      .replace(/\{\{query\}\}/g,      esc(testMsg))
      .replace(/\{\{session_id\}\}/g, esc(sid))
      .replace(/\{\{user_id\}\}/g,    esc(uuidv4()))
      .replace(/\{\{timestamp\}\}/g,  esc(timestamp))
      .replace(/\{\{temp_id\}\}/g,    `temp_test_${Date.now()}`);
    let body;
    try { body = JSON.parse(jsonStr); } catch { return res.status(400).json({ error: 'Template JSON non valido' }); }
    let extraHeaders = {};
    try { extraHeaders = typeof extraHdrs === 'string' ? JSON.parse(extraHdrs) : (extraHdrs || {}); } catch {}
    const whRes = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extraHeaders }, body: JSON.stringify(body) });
    if (!whRes.ok) throw new Error(`HTTP ${whRes.status}: ${await whRes.text()}`);
    const rawText = await whRes.text();
    if (!rawText?.trim()) throw new Error('Body vuoto — aggiungi un nodo "Respond to Webhook" nel workflow n8n');
    let data;
    try { data = JSON.parse(rawText); } catch { throw new Error(`Risposta non è JSON valido: ${rawText.slice(0,200)}`); }
    const reply = getNestedField(data, outputField || 'response');
    if (reply == null) throw new Error(`Campo '${outputField}' non trovato.\nRisposta ricevuta:\n${JSON.stringify(data, null, 2)}`);
    res.json({ reply: String(reply), raw: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Helper: estrae valore da oggetto con dot-notation (es. "output.text") ─────
function getNestedField(obj, path) {
  return path.split('.').reduce((cur, k) => {
    if (cur == null) return undefined;
    // Se il valore corrente è una stringa JSON, la parsa automaticamente
    if (typeof cur === 'string') {
      try { cur = JSON.parse(cur); } catch { return undefined; }
    }
    const idx = Number(k);
    return Array.isArray(cur) && !isNaN(idx) ? cur[idx] : cur[k];
  }, obj);
}

// ─── Route: Chat (embedded o webhook) ────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId, avatarId } = req.body;
    if (!message) return res.status(400).json({ error: 'Messaggio mancante' });

    const avatar = getAvatarConfig(avatarId);

    // ── Modalità Webhook ──────────────────────────────────────────────────────
    if (avatar?.avatar_mode === 'webhook') {
      const url      = avatar.webhook_url;
      const template = avatar.webhook_input_template || '{"query":"{{query}}"}';
      const outField = avatar.webhook_output_field   || 'response';
      if (!url) return res.status(400).json({ error: 'Webhook URL non configurato' });

      const sid       = sessionId || uuidv4();
      const userId    = uuidv4();
      const timestamp = new Date().toISOString();
      const tempId    = `temp_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

      const esc = s => s.replace(/\\/g,'\\\\').replace(/"/g,'\\"');
      const jsonStr = template
        .replace(/\{\{query\}\}/g,      esc(message))
        .replace(/\{\{session_id\}\}/g, esc(sid))
        .replace(/\{\{user_id\}\}/g,    esc(userId))
        .replace(/\{\{timestamp\}\}/g,  esc(timestamp))
        .replace(/\{\{temp_id\}\}/g,    esc(tempId));

      let body;
      try { body = JSON.parse(jsonStr); }
      catch { return res.status(400).json({ error: 'Template JSON non valido' }); }

      let extraHeaders = {};
      try { extraHeaders = JSON.parse(avatar.webhook_headers || '{}'); } catch {}

      const whRes = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...extraHeaders },
        body:    JSON.stringify(body),
      });
      if (!whRes.ok) throw new Error(`Webhook error ${whRes.status}: ${await whRes.text()}`);
      const rawText = await whRes.text();
      if (!rawText?.trim()) throw new Error('Il webhook ha risposto con body vuoto — assicurati che il workflow n8n abbia un nodo "Respond to Webhook"');
      let whData;
      try { whData = JSON.parse(rawText); } catch { throw new Error(`Risposta non è JSON valido: ${rawText.slice(0,200)}`); }
      const reply  = getNestedField(whData, outField);
      if (reply == null) throw new Error(`Campo '${outField}' non trovato. Risposta: ${JSON.stringify(whData)}`);
      return res.json({ reply: String(reply), sessionId: sid });
    }

    // ── Modalità Embedded (Claude) ────────────────────────────────────────────
    const baseName   = avatar?.name || AVATAR_NAME;
    const basePrompt = avatar?.system_prompt || DEFAULT_SYSTEM_PROMPT;
    const systemPrompt = `Il tuo nome è ${baseName}. Non presentarti ad ogni risposta.\n\n${basePrompt}`;

    const sid = sessionId || uuidv4();
    if (!sessions.has(sid)) sessions.set(sid, []);
    const history = sessions.get(sid);
    history.push({ role: 'user', content: message });
    if (history.length > 10) history.splice(0, history.length - 10);

    const aiProvider = avatar?.ai_provider || 'anthropic';
    const aiTokens   = avatar?.ai_max_tokens > 0 ? avatar.ai_max_tokens : DEFAULT_AI_TOKENS;
    let reply;

    if (aiProvider === 'openai') {
      const aiKey   = avatar?.openai_api_key || process.env.OPENAI_API_KEY;
      const aiModel = avatar?.openai_model   || 'gpt-4o';
      const msgs = [{ role: 'system', content: systemPrompt }, ...history];
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${aiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: aiModel, max_tokens: aiTokens, messages: msgs }),
      });
      if (!r.ok) throw new Error(`OpenAI: ${await r.text()}`);
      const data = await r.json();
      reply = data.choices[0].message.content;
    } else {
      const aiKey   = avatar?.anthropic_api_key || process.env.ANTHROPIC_API_KEY;
      const aiModel = avatar?.anthropic_model   || CLAUDE_MODEL;
      const aiClient = aiKey !== process.env.ANTHROPIC_API_KEY
        ? new Anthropic({ apiKey: aiKey }) : anthropic;
      const response = await aiClient.messages.create({
        model: aiModel, max_tokens: aiTokens,
        system: systemPrompt, messages: history,
      });
      reply = response.content[0].text;
    }
    history.push({ role: 'assistant', content: reply });
    res.json({ reply, sessionId: sid });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Route: TTS (con supporto avatar specifico) ───────────────────────────────
app.post('/api/tts', async (req, res) => {
  try {
    const { text, avatarId } = req.body;
    if (!text) return res.status(400).json({ error: 'Testo mancante' });

    const avatar     = getAvatarConfig(avatarId);
    const voiceId    = avatar?.voice_id    || DEFAULT_VOICE_ID;
    const ttsKey     = avatar?.tts_api_key || process.env.ELEVENLABS_API_KEY;
    const ttsModel   = avatar?.tts_model   || DEFAULT_TTS_MODEL;
    const ttsStab    = (avatar?.tts_stability  >= 0) ? avatar.tts_stability  : DEFAULT_TTS_STAB;
    const ttsSim     = (avatar?.tts_similarity >= 0) ? avatar.tts_similarity : DEFAULT_TTS_SIM;
    const ttsTextNorm = avatar?.tts_text_normalization || 'auto';
    const ttsLangNorm = !!avatar?.tts_language_normalization;
    if (!voiceId) return res.status(400).json({ error: 'Voice ID non configurato' });

    const spokenText = text
      .replace(/#{1,6}\s*/g, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/_(.+?)_/g, '$1')
      .replace(/`{1,3}[^`]*`{1,3}/g, '')
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/\n+/g, ' ')
      .trim();

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
      {
        method: 'POST',
        headers: { 'xi-api-key': ttsKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: spokenText, model_id: ttsModel,
          voice_settings: { stability: ttsStab, similarity_boost: ttsSim },
          apply_text_normalization: ttsTextNorm,
          ...(ttsLangNorm ? { apply_language_text_normalization: true } : {}) }),
      }
    );
    if (!response.ok) throw new Error(`ElevenLabs error: ${await response.text()}`);
    const data = await response.json();
    res.json({ audio: data.audio_base64, alignment: data.alignment });
  } catch (error) {
    console.error('TTS error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Route: Reset sessione ────────────────────────────────────────────────────
app.delete('/api/session/:id', (req, res) => {
  sessions.delete(req.params.id);
  res.json({ ok: true });
});

// ─── Export/Import configurazione avatar ──────────────────────────────────────

app.get('/api/admin/avatars/:id/export', requireAdmin, (req, res) => {
  const avatar = db.prepare('SELECT * FROM avatars WHERE id = ?').get(req.params.id);
  if (!avatar) return res.status(404).json({ error: 'Non trovato' });

  const FILE_FIELDS = ['model_file', 'bg_video', 'idle_video', 'idle_bg_image', 'idle_icon_img', 'mic_icon', 'mic_icon_disabled', 'audio_icon', 'audio_icon_disabled'];
  const files = {};
  for (const field of FILE_FIELDS) {
    const rel = avatar[field];
    if (!rel) continue;
    const abs = join(__dirname, 'public', rel);
    if (!fs.existsSync(abs)) continue;
    const data = fs.readFileSync(abs).toString('base64');
    const name = rel.split('/').pop();
    files[field] = { name, data };
  }

  const { id, created_at, updated_at, published, ...params } = avatar;
  const bundle = { version: 1, name: avatar.name, params, files };

  const slug = avatar.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  res.setHeader('Content-Disposition', `attachment; filename="avatar_${slug}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(bundle, null, 2));
});

app.post('/api/admin/avatars/import', requireAdmin, express.json({ limit: '200mb' }), async (req, res) => {
  const bundle = req.body;
  if (!bundle?.version || !bundle?.params) return res.status(400).json({ error: 'File non valido' });

  const newId = uuidv4().split('-')[0];
  const FILE_FIELDS = ['model_file', 'bg_video', 'idle_video', 'idle_bg_image', 'idle_icon_img', 'mic_icon', 'mic_icon_disabled', 'audio_icon', 'audio_icon_disabled'];

  // Ripristina file binari
  const remapped = { ...bundle.params };
  for (const field of FILE_FIELDS) {
    const f = bundle.files?.[field];
    if (!f?.data || !f?.name) { remapped[field] = ''; continue; }
    // Determina sottocartella in base al campo
    const subdir = field === 'model_file'   ? 'models'
      : field === 'bg_video'               ? 'bg-videos'
      : field === 'idle_video'             ? 'idle-videos'
      : field === 'idle_bg_image'          ? 'idle-bgs'
      : 'icons'; // idle_icon_img, mic_icon, mic_icon_disabled, audio_icon, audio_icon_disabled
    const dir = join(__dirname, 'public', subdir);
    fs.mkdirSync(dir, { recursive: true });
    const ext  = f.name.split('.').pop();
    const dest = `${subdir}/${newId}_${field}.${ext}`;
    fs.writeFileSync(join(__dirname, 'public', dest), Buffer.from(f.data, 'base64'));
    remapped[field] = dest;
  }

  // Colonne valide del DB
  const cols = db.prepare("PRAGMA table_info(avatars)").all().map(c => c.name);
  const allowed = cols.filter(c => !['id','created_at','updated_at','published'].includes(c));
  const fields = allowed.filter(c => remapped[c] !== undefined);
  const placeholders = fields.map(c => `${c} = ?`).join(', ');
  const values = fields.map(c => remapped[c]);

  db.prepare(`INSERT INTO avatars (id, name) VALUES (?, ?)`).run(newId, bundle.name || 'Importato');
  if (fields.length) db.prepare(`UPDATE avatars SET ${placeholders} WHERE id = ?`).run(...values, newId);

  res.json({ ok: true, id: newId });
});

// ─── Avvio server ─────────────────────────────────────────────────────────────
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[ERRORE] Porta ${PORT} già in uso.`);
    console.error(`  Controlla con: sudo lsof -i :${PORT}`);
    console.error(`  Oppure ferma il servizio: sudo systemctl stop avatar-kiosk\n`);
    process.exit(1);
  } else {
    throw err;
  }
});

server.listen(PORT, () => {
  console.log(`\n🤖 Avatar Kiosk Platform`);
  console.log(`   → Kiosk:    http://localhost:${PORT}/k/{id}`);
  console.log(`   → Admin:    http://localhost:${PORT}/admin`);
  console.log(`   → Modello AI: ${CLAUDE_MODEL}\n`);
});
