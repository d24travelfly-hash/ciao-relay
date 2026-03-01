const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
app.get('/', (req, res) => res.json({ status: 'CIAO Running' }));
app.post('/appel-entrant', (req, res) => {
  const host = req.headers.host;
  res.setHeader('Content-Type', 'text/xml');
  res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="wss://' + host + '/media-stream"/></Connect></Response>');
});
const wss = new WebSocket.Server({ server, path: '/media-stream' });
wss.on('connection', (twilioWs) => {
  const openaiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
    headers: { Authorization: 'Bearer ' + OPENAI_API_KEY, 'OpenAI-Beta': 'realtime=v1' }
  });
  let streamSid = null;
  let ready = false;
  const queue = [];
  openaiWs.on('open', () => {
    openaiWs.send(JSON.stringify({ type: 'session.update', session: { turn_detection: { type: 'server_vad', threshold: 0.5, silence_duration_ms: 500 }, input_audio_format: 'g711_ulaw', output_audio_format: 'g711_ulaw', voice: 'shimmer', instructions: 'Tu es CIAO assistant de DIASPORA MEDIAS. Accueille en francais: Bonjour et bienvenue au CIAO de DIASPORA MEDIAS. Comment puis-je vous aider? Ne donne jamais de tarifs. Urgence: dire appeler le 112.', modalities: ['text', 'audio'], input_audio_transcription: { model: 'whisper-1' } }}));
    setTimeout(() => {
      openaiWs.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Commence par le message accueil.' }] }}));
      openaiWs.send(JSON.stringify({ type: 'response.create' }));
      ready = true;
      queue.forEach(a => openaiWs.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: a })));
      queue.length = 0;
    }, 500);
  });
  openaiWs.on('message', (data) => {
    const e = JSON.parse(data);
    if (e.type === 'response.audio.delta' && e.delta && twilioWs.readyState === WebSocket.OPEN && streamSid) {
      twilioWs.send(JSON.stringify({ event: 'media', streamSid, media: { payload: e.delta } }));
    }
  });
  twilioWs.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.event === 'start') streamSid = msg.start.streamSid;
    if (msg.event === 'media') {
      if (ready && openaiWs.readyState === WebSocket.OPEN) openaiWs.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: msg.media.payload }));
      else queue.push(msg.media.payload);
    }
    if (msg.event === 'stop' && openaiWs.readyState === WebSocket.OPEN) openaiWs.close();
  });
  twilioWs.on('close', () => { if (openaiWs.readyState === WebSocket.OPEN) openaiWs.close(); });
});
server.listen(PORT, () => console.log('CIAO Relay on port ' + PORT));
