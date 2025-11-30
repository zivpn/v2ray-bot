// KV Storage Utilities for Cloudflare Functions
export async function readKV(key, env) {
    try {
        const content = await env.BOT_KV.get(key);
        return content ? JSON.parse(content) : {};
    } catch (e) {
        console.error(`KV Read Error for ${key}:`, e);
        return {};
    }
}

export async function updateKV(key, modifierCallback, env) {
    try {
        const data = await readKV(key, env);
        const updatedData = modifierCallback(data);
        await env.BOT_KV.put(key, JSON.stringify(updatedData));
        return true;
    } catch (e) {
        console.error(`KV Update Error for ${key}:`, e);
        return false;
    }
}
