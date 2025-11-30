import { handleUpdate } from './handlers/commandHandlers.js';

/**
 * Main worker request handler for Cloudflare Functions
 */
async function handleRequest(request, event) {
    if (request.method !== 'POST') {
        return new Response('V2Ray Bot Worker is running. Send updates via POST.', { status: 200 });
    }

    try {
        const update = await request.json();
        // Use event.waitUntil() to keep the worker alive for asynchronous operations.
        event.waitUntil(handleUpdate(update));
        return new Response('OK', { status: 200 });
    } catch (e) {
        console.error('Worker Error:', e);
        // Respond with OK even on error to prevent Telegram from retrying endlessly
        return new Response('Error processing update', { status: 200 });
    }
}

// Global listener setup for Cloudflare Functions
export default {
    async fetch(request, env, ctx) {
        const event = {
            waitUntil: ctx.waitUntil.bind(ctx)
        };
        return handleRequest(request, event);
    }
};
