import { handleUpdate } from './handlers/commandHandlers.js';

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('V2Ray Bot Worker is running. Send updates via POST.', { status: 200 });
    }

    try {
      const update = await request.json();
      ctx.waitUntil(handleUpdate(update, env));
      return new Response('OK', { status: 200 });
    } catch (e) {
      console.error('Worker Error:', e);
      return new Response('Error processing update', { status: 200 });
    }
  }
};
