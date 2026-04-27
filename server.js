/**
 * Avatar Kiosk Platform - Server Node.js
 */

import 'dotenv/config';
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
const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const sessions  = new Map();

app.use(cors());
app.use(express.json());
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
  // Non esporre dati sensibili
  const { id, name, background, model_file, idle_start, idle_end,
          speech_start, speech_end, avatar_scale, avatar_offset_x,
          avatar_offset_y, avatar_rot_y, camera_z, camera_y, camera_look_at_y,
          overlay_color, overlay_opacity, overlay_height } = avatar;
  res.json({ id, name, background, model_file, idle_start, idle_end,
             speech_start, speech_end, avatar_scale, avatar_offset_x,
             avatar_offset_y, avatar_rot_y, camera_z, camera_y, camera_look_at_y,
             overlay_color, overlay_opacity, overlay_height });
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
  const { id, name, background, model_file, idle_start, idle_end,
          speech_start, speech_end, avatar_scale, avatar_offset_x,
          avatar_offset_y, avatar_rot_y, camera_z, camera_y, camera_look_at_y,
          overlay_color, overlay_opacity, overlay_height } = avatar;
  res.json({ id, name, background, model_file, idle_start, idle_end,
             speech_start, speech_end, avatar_scale, avatar_offset_x,
             avatar_offset_y, avatar_rot_y, camera_z, camera_y, camera_look_at_y,
             overlay_color, overlay_opacity, overlay_height });
});

// ─── Route: Admin page ────────────────────────────────────────────────────────
app.get('/admin', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'admin', 'index.html'));
});

// ─── CRUD Avatar ──────────────────────────────────────────────────────────────
app.get('/api/admin/avatars', (req, res) => {
  const avatars = db.prepare('SELECT * FROM avatars ORDER BY created_at DESC').all();
  res.json(avatars);
});

app.post('/api/admin/avatars', (req, res) => {
  const id = uuidv4().split('-')[0]; // ID corto
  const { name = 'Nuovo Avatar', voice_id = '', system_prompt = DEFAULT_SYSTEM_PROMPT,
          background = '#0a0a0f' } = req.body;
  db.prepare(`INSERT INTO avatars (id, name, voice_id, system_prompt, background)
              VALUES (?, ?, ?, ?, ?)`).run(id, name, voice_id, system_prompt, background);
  res.json(db.prepare('SELECT * FROM avatars WHERE id = ?').get(id));
});

app.put('/api/admin/avatars/:id', (req, res) => {
  const fields = ['name','voice_id','system_prompt','background','idle_start','idle_end',
                  'speech_start','speech_end','avatar_scale','avatar_offset_x','avatar_offset_y',
                  'avatar_rot_y','camera_z','camera_y','camera_look_at_y',
                  'overlay_color','overlay_opacity','overlay_height'];
  const updates = [];
  const values  = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); values.push(req.body[f]); }
  }
  if (!updates.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });
  updates.push("updated_at = datetime('now')");
  values.push(req.params.id);
  db.prepare(`UPDATE avatars SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json(db.prepare('SELECT * FROM avatars WHERE id = ?').get(req.params.id));
});

app.delete('/api/admin/avatars/:id', (req, res) => {
  const avatar = db.prepare('SELECT * FROM avatars WHERE id = ?').get(req.params.id);
  if (!avatar) return res.status(404).json({ error: 'Non trovato' });
  // Elimina file modello e sfondo
  if (avatar.model_file) { try { fs.unlinkSync(join(__dirname, 'public', avatar.model_file)); } catch {} }
  db.prepare('DELETE FROM avatars WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/admin/avatars/:id/publish', (req, res) => {
  const avatar = db.prepare('SELECT * FROM avatars WHERE id = ?').get(req.params.id);
  if (!avatar) return res.status(404).json({ error: 'Non trovato' });
  const published = avatar.published ? 0 : 1;
  db.prepare("UPDATE avatars SET published = ?, updated_at = datetime('now') WHERE id = ?")
    .run(published, req.params.id);
  res.json({ published });
});

// ─── Upload FBX per avatar specifico ─────────────────────────────────────────
const uploadFbx = multer({ storage: multer.diskStorage({
  destination: (req, file, cb) => cb(null, join(__dirname, 'public', 'models')),
  filename:    (req, file, cb) => cb(null, `${req.params.id}_tmp.fbx`),
}) });

app.post('/api/admin/avatars/:id/upload-model', uploadFbx.single('model'), async (req, res) => {
  const tmpFbx = join(__dirname, 'public', 'models', `${req.params.id}_tmp.fbx`);
  const outGlb = join(__dirname, 'public', 'models', `${req.params.id}.glb`);
  try {
    if (!req.file) return res.status(400).json({ error: 'Nessun file ricevuto' });
    const assimp = '/opt/homebrew/bin/assimp';
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    await promisify(execFile)(assimp, ['export', tmpFbx, outGlb]);
    fs.unlinkSync(tmpFbx);
    const modelFile = `models/${req.params.id}.glb`;
    db.prepare("UPDATE avatars SET model_file = ?, updated_at = datetime('now') WHERE id = ?")
      .run(modelFile, req.params.id);
    res.json({ ok: true, model_file: modelFile });
  } catch (err) {
    if (fs.existsSync(tmpFbx)) fs.unlinkSync(tmpFbx);
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

// ─── Route: STT ──────────────────────────────────────────────────────────────
app.post('/api/stt', multer({ storage: multer.memoryStorage() }).single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nessun file audio ricevuto' });
    const formData = new FormData();
    formData.append('file', new Blob([req.file.buffer], { type: req.file.mimetype || 'audio/webm' }), 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', 'it');
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
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

// ─── Route: Chat (con supporto avatar specifico) ──────────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId, avatarId } = req.body;
    if (!message) return res.status(400).json({ error: 'Messaggio mancante' });

    const avatar = getAvatarConfig(avatarId);
    const baseName   = avatar?.name || AVATAR_NAME;
    const basePrompt = avatar?.system_prompt || DEFAULT_SYSTEM_PROMPT;
    const systemPrompt = `Il tuo nome è ${baseName}. Non presentarti ad ogni risposta.\n\n${basePrompt}`;

    const sid = sessionId || uuidv4();
    if (!sessions.has(sid)) sessions.set(sid, []);
    const history = sessions.get(sid);
    history.push({ role: 'user', content: message });
    if (history.length > 10) history.splice(0, history.length - 10);

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL, max_tokens: 512,
      system: systemPrompt, messages: history,
    });
    const reply = response.content[0].text;
    history.push({ role: 'assistant', content: reply });
    res.json({ reply, sessionId: sid });
  } catch (error) {
    console.error('Claude error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Route: TTS (con supporto avatar specifico) ───────────────────────────────
app.post('/api/tts', async (req, res) => {
  try {
    const { text, avatarId } = req.body;
    if (!text) return res.status(400).json({ error: 'Testo mancante' });

    const avatar  = getAvatarConfig(avatarId);
    const voiceId = avatar?.voice_id || DEFAULT_VOICE_ID;
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
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: spokenText, model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
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

// ─── Avvio server ─────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🤖 Avatar Kiosk Platform`);
  console.log(`   → Kiosk:    http://localhost:${PORT}/k/{id}`);
  console.log(`   → Admin:    http://localhost:${PORT}/admin`);
  console.log(`   → Modello AI: ${CLAUDE_MODEL}\n`);
});
