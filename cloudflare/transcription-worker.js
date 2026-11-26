// Cloudflare Worker: bind Workers AI as AI and set MBH_TRANSCRIPTION_TOKEN as a secret.
const ORIGIN = 'https://snowsences.github.io';
const MAX_BYTES = 8 * 1024 * 1024;
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const headers = {
      'Access-Control-Allow-Origin': ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Vary': 'Origin',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json'
    };
    const reply = (value, status = 200) => new Response(JSON.stringify(value), {status, headers});
    if (origin && origin !== ORIGIN) return reply({error:'Origin not allowed'}, 403);
    if (request.method === 'OPTIONS') return new Response(null, {status:204, headers});
    if (request.method !== 'POST') return reply({error:'POST required'}, 405);
    if (!env.MBH_TRANSCRIPTION_TOKEN || request.headers.get('Authorization') !== 'Bearer ' + env.MBH_TRANSCRIPTION_TOKEN)
      return reply({error:'Unauthorized'}, 401);
    if (Number(request.headers.get('Content-Length')) > MAX_BYTES + 65536)
      return reply({error:'Audio too large'}, 413);
    try {
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File) || !file.size || file.size > MAX_BYTES)
        return reply({error:'A nonempty audio file up to 8 MiB is required'}, 400);
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (let i=0; i<bytes.length; i+=8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
      const result = await env.AI.run('@cf/openai/whisper-large-v3-turbo', {
        audio: btoa(binary), task:'transcribe'
      });
      if (typeof result.text !== 'string') return reply({error:'No transcription returned'}, 502);
      return reply({text:result.text.trim()});
    } catch (e) {
      return reply({error:'Transcription unavailable or free allowance exhausted'}, 502);
    }
  }
};
