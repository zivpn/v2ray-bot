import { get_text, formatText, sendMessage, sendOrEditMessage, sendPhoto, sendDocument, sendVideo } from '../utils.js';
import { get_user_language, getUserStats } from '../database.js';
import { BROADCAST_BATCH_SIZE, BROADCAST_DELAY_MS } from '../config.js';

// =========================================================================
// BROADCAST HANDLER
// =========================================================================

export async function processBroadcast(message, totalUsers, userList, loadingMessageId, chatId, lang, env) {
    let messageType = 'text';
    let content = '';
    let media = null;

    if (message.text) {
        content = message.text;
        messageType = 'text';
    } else if (message.photo) {
        const photo = message.photo.slice(-1)[0];
        const fileId = photo.file_id;
        content = message.caption ?? '';
        messageType = 'photo';
        media = { url: fileId };
    } else if (message.document) {
        const fileId = message.document.file_id;
        content = message.caption ?? '';
        messageType = 'document';
        media = { url: fileId };
    } else if (message.video) {
      const fileId = message.video.file_id;
      content = message.caption ?? '';
      messageType = 'video';
      media = { url: fileId };
    }

    let successCount = 0;
    let failedCount = 0;
    const totalBatches = Math.ceil(totalUsers / BROADCAST_BATCH_SIZE);

    for (let i = 0; i < totalUsers; i += BROADCAST_BATCH_SIZE) {
        const batch = userList.slice(i, i + BROADCAST_BATCH_SIZE);

        const statusText = formatText(get_text('status_broadcasting', lang), totalUsers, Math.min(i + batch.length, totalUsers), totalUsers);
        await sendOrEditMessage(chatId, statusText, loadingMessageId);

        const batchPromises = batch.map(async (user) => {
            try {
                let result = { success: false, http_code: 0 };
                let maxRetries = 2;
                let attempt = 0;

                while (attempt < maxRetries) {
                    attempt++;

                    const dataToSend = {
                        chat_id: user.user_id,
                        parse_mode: 'Markdown',
                        disable_web_page_preview: true,
                        caption: content,
                        text: content,
                        photo: media?.url,
                        document: media?.url,
                        video: media?.url
                    };

                    switch (messageType) {
                        case 'photo':
                            result = await sendPhoto(user.user_id, dataToSend.photo, dataToSend.caption);
                            break;
                        case 'document':
                            result = await sendDocument(user.user_id, dataToSend.document, dataToSend.caption);
                            break;
                        case 'video':
                            result = await sendVideo(user.user_id, dataToSend.video, dataToSend.caption);
                            break;
                        case 'text':
                        default:
                            result = await sendMessage(user.user_id, dataToSend.text);
                            break;
                    }

                    if (result.success) {
                        return 'success';
                    }

                    if (result.http_code === 429) {
                        const retryAfter = result.data?.parameters?.retry_after || 5;
                        console.warn(`Rate limit (429) hit for user ${user.user_id}. Waiting for ${retryAfter}s...`);
                        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000 + 500));
                    } else if (result.http_code === 403) {
                         return 'blocked';
                    } else {
                        console.error(`Broadcast API failed for user ${user.user_id} (${messageType}, HTTP ${result.http_code}):`, result.data);
                        break;
                    }
                }

                return 'failed';

            } catch (e) {
                console.error(`Broadcast exception for user ${user.user_id}:`, e);
                return 'failed';
            }
        });

        const results = await Promise.allSettled(batchPromises);

        for (const result of results) {
            if (result.status === 'fulfilled' && result.value === 'success') {
                successCount++;
            } else if (result.status === 'fulfilled' && (result.value === 'failed' || result.value === 'blocked')) {
                failedCount++;
            } else if (result.status === 'rejected') {
                failedCount++;
            }
        }

        if (i + BROADCAST_BATCH_SIZE < totalUsers) {
            await new Promise(resolve => setTimeout(resolve, BROADCAST_DELAY_MS));
        }
    }

    return {
        success: true,
        success_count: successCount,
        failed_count: failedCount,
        total_users: totalUsers
    };
}

export async function handleBroadcast(chatId, update, env) {
    const lang = await get_user_language(chatId, env);
    if (!isAdmin(chatId)) {
        await sendMessage(chatId, get_text('admin_access_denied', lang));
        return;
    }

    const replyToMessage = update.message.reply_to_message;

    if (!replyToMessage) {
        const helpText = get_text('broadcast_usage', lang);
        await sendMessage(chatId, helpText);
        return;
    }

    const stats = await getUserStats(env);
    const totalUsers = stats.total_users;
    const userList = stats.users;

    const initialText = formatText(get_text('status_broadcasting', lang), totalUsers, 0, totalUsers);
    const initialMsg = await sendMessage(chatId, initialText);
    const messageId = initialMsg.data?.result?.message_id;

    const broadcastResult = await processBroadcast(replyToMessage, totalUsers, userList, messageId, chatId, lang, env);

    if (broadcastResult.success) {
        let message = get_text('broadcast_complete', lang) + "\n\n";
        message += get_text('broadcast_success', lang) + ` ${broadcastResult.success_count}\n`;
        message += get_text('broadcast_failed', lang) + ` ${broadcastResult.failed_count}\n`;
        message += get_text('broadcast_total', lang) + ` ${broadcastResult.total_users}`;

        await sendOrEditMessage(chatId, message, messageId);
    } else {
        const message = get_text('broadcast_failed_error', lang) + "\n\n" + get_text('error_prefix', lang) + " [Unknown Error during processing]";
        await sendOrEditMessage(chatId, message, messageId);
    }
}

// Import dependencies
import { isAdmin } from '../database.js';
