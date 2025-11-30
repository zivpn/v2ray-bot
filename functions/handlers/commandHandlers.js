import { get_text, extractCommand, getSafeDisplayName } from '../utils.js';
import { saveUser, get_user_language, setUserState, isUserBanned, isAdmin } from '../database.js';
import { handleStart } from './userHandlers.js';
import { handleTrial, handleMyTrial } from './userHandlers.js';
import { handlePremium } from './premiumHandlers.js';
import { handleReferral } from './referralHandlers.js';
import { handleApps } from './userHandlers.js';
import { handleId } from './userHandlers.js';
import { handleLanguage } from './userHandlers.js';
import { handleHelp } from './userHandlers.js';
import { handleV2RayConfig } from './userHandlers.js';
import { handleAdminMenu } from './adminHandlers.js';
import { handleCreate, handleDelPrem, handleDelTrial, handleDelExp } from './adminHandlers.js';
import { handleTransfer, handleResetTraffic, handleModifyAccount } from './adminHandlers.js';
import { handleBulkCreate, handleRunWarnings, handleOptimalPanel } from './adminHandlers.js';
import { handleCreditControl, handleGetKV, handleSetKV } from './adminHandlers.js';
import { handleBan, handleUnban } from './adminHandlers.js';
import { handleRequestCommand, handleReply } from './userHandlers.js';
import { handleStats, handleOnlineUsers } from './adminHandlers.js';
import { handleBroadcast } from './broadcastHandler.js';

// =========================================================================
// MAIN UPDATE HANDLER
// =========================================================================

export async function handleUpdate(update, env) {
    if (!update.message && !update.callback_query) {
        return;
    }

    const source = update.message ?? update.callback_query?.message;
    const from = update.message?.from ?? update.callback_query?.from;

    if (!source || !from) {
        return;
    }

    const chatId = source.chat.id;
    const userId = from.id;
    const username = from.username ?? '';
    const firstName = from.first_name ?? '';
    const lastName = from.last_name ?? '';
    const text = source.text ? source.text.trim() : '';
    const messageId = source.message_id ?? update.callback_query?.message?.message_id ?? null;
    let deepLink = null;

    if (update.message?.text?.startsWith('/start ')) {
        deepLink = update.message.text.split(' ')[1];
    }

    // Global ban check
    if (await isUserBanned(userId, env)) {
        if (update.message && text.length > 0) {
            await handleAccessDeniedBanned(chatId, env);
        }
        return;
    }

    // Handle callback queries
    if (update.callback_query) {
        await handleCallbackQuery(update.callback_query, env);
        return;
    }

    // Check for user state
    const currentState = await getUserState(userId, env);

    if (update.message) {
        // Handle TxID Submission
        if (currentState?.state === 'waiting_for_txid' && text.length > 0 && !text.startsWith('/')) {
            await handleTxidSubmission(chatId, userId, text, currentState, username, firstName, lastName, env);
            return;
        }

        // Handle Custom GB Redemption Input
        if (currentState?.state === 'waiting_for_custom_gb' && text.length > 0 && !text.startsWith('/')) {
            await handleCustomGbRedemptionInput(chatId, userId, text, messageId, env);
            return;
        }

        // Clear state if user sends non-command text while waiting for panel selection
        if (currentState?.state === 'waiting_for_redeem_panel' || currentState?.state === 'waiting_for_create_panel') {
            if (!text.startsWith('/')) {
                await setUserState(userId, 'clear', {}, env);
                const lang = await get_user_language(chatId, env);
                await sendMessage(chatId, get_text('error_redemption_state_fail', lang));
                return;
            }
        }
    }

    // Handle V2Ray config directly (quick check)
    if (text.length > 0 && !text.startsWith('/')) {
        let isV2RayConfig = false;

        if (text.startsWith('vmess://') ||
            text.startsWith('vless://') ||
            text.startsWith('trojan://') ||
            text.startsWith('ss://')) {
            isV2RayConfig = true;
        }

        if (/\S+@\S+\.\S+/.test(text)) {
            isV2RayConfig = true;
        }

        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) {
            isV2RayConfig = true;
        }

        if (isV2RayConfig) {
            await saveUser(userId, username, firstName, lastName, null, null, env);
            await handleV2RayConfig(chatId, text, env);
            return;
        }
        return;
    }

    // Handle commands
    const commandInfo = extractCommand(text);

    if (commandInfo) {
        const baseCommand = commandInfo.base;
        const paramString = commandInfo.params;
        const params = paramString.split(/\s+/).filter(p => p.length > 0);

        // Save user for command processing
        await saveUser(userId, username, firstName, lastName, null, null, env);

        // Clear user state on callback that changes menu flow
        const stateSensitiveCommands = ['approve', 'reject'];
        if (baseCommand !== 'start' && !stateSensitiveCommands.includes(baseCommand)) {
            if (currentState?.state !== 'waiting_for_txid' && currentState?.state !== 'waiting_for_custom_gb' && 
                currentState?.state !== 'waiting_for_create_panel' && currentState?.state !== 'waiting_for_redeem_panel') {
                await setUserState(userId, 'clear', {}, env);
            }
        } else if (baseCommand === 'start') {
            await setUserState(userId, 'clear', {}, env);
        }

        switch (baseCommand) {
            case 'start':
                await handleStart(chatId, username, firstName, lastName, messageId, false, deepLink, env);
                break;

            case 'premium':
                await handlePremium(chatId, env);
                break;

            case 'referral':
                await handleReferral(chatId, userId, env);
                break;

            case 'apps':
                await handleApps(chatId, env);
                break;

            case 'language':
                await handleLanguage(chatId, env);
                break;

            case 'trial':
                await handleTrial(chatId, userId, env);
                break;

            case 'mytrial':
                await handleMyTrial(chatId, userId, env);
                break;

            case 'id':
                await handleId(chatId, params, env);
                break;

            case 'check':
                const config = paramString;
                if (config) {
                    await handleV2RayConfig(chatId, config, env);
                } else {
                    const lang = await get_user_language(chatId, env);
                    await sendMessage(chatId, get_text('check_usage', lang));
                }
                break;

            case 'create':
                await handleCreate(chatId, params, env);
                break;

            case 'delprem':
                await handleDelPrem(chatId, params, env);
                break;

            case 'deltrial':
                const trialId = params[0];
                if (trialId) {
                    await handleDelTrial(chatId, trialId, env);
                } else {
                    const lang = await get_user_language(chatId, env);
                    await sendMessage(chatId, get_text('admin_usage', lang) + " " + get_text('cmd_deltrial', lang));
                }
                break;

            case 'delexp':
                const panel = params[0];
                await handleDelExp(chatId, panel, env);
                break;

            case 'request':
                await handleRequestCommand(chatId, text, username, userId, env);
                break;

            case 'reply':
                await handleReply(chatId, params, env);
                break;

            case 'stats':
                await handleStats(chatId, messageId, false, 'menu_start', env);
                break;

            case 'online':
                await handleOnlineUsers(chatId, messageId, env);
                break;

            case 'broadcast':
                await handleBroadcast(chatId, update, env);
                break;

            case 'admin':
                await handleAdminMenu(chatId, messageId, env);
                break;

            case 'transfer':
                await handleTransfer(chatId, params, env);
                break;

            case 'reset':
                await handleResetTraffic(chatId, params, env);
                break;

            case 'mod':
                await handleModifyAccount(chatId, params, env);
                break;

            case 'bulk':
                await handleBulkCreate(chatId, params, env);
                break;

            case 'runwarnings':
                await handleRunWarnings(chatId, env);
                break;

            case 'optimal':
                await handleOptimalPanel(chatId, params, env);
                break;

            case 'approve':
                if (params.length >= 2 && !isNaN(parseInt(params[0])) && !isNaN(parseInt(params[1]))) {
                    await handleAdminApprove(chatId, parseInt(params[0]), parseInt(params[1]), null, env);
                } else {
                    const lang = await get_user_language(chatId, env);
                    await sendMessage(chatId, get_text('admin_usage_approve', lang) + "\n\nExample: `/approve 123456789 150`");
                }
                break;

            case 'reject':
                if (params.length >= 1 && !isNaN(parseInt(params[0]))) {
                    await handleAdminReject(chatId, parseInt(params[0]), null, env);
                } else {
                    const lang = await get_user_language(chatId, env);
                    await sendMessage(chatId, get_text('admin_usage_reject', lang) + "\n\nExample: `/reject 123456789`");
                }
                break;

            case 'ban':
                if (paramString) {
                    await handleBan(chatId, paramString, env);
                } else {
                    const lang = await get_user_language(chatId, env);
                    await sendMessage(chatId, get_text('admin_usage', lang) + " " + get_text('cmd_ban', lang));
                }
                break;

            case 'unban':
                if (paramString) {
                    await handleUnban(chatId, paramString, env);
                } else {
                    const lang = await get_user_language(chatId, env);
                    await sendMessage(chatId, get_text('admin_usage', lang) + " " + get_text('cmd_unban', lang));
                }
                break;

            case 'addcredit':
                await handleCreditControl(chatId, params, 'add', env);
                break;

            case 'removecredit':
                await handleCreditControl(chatId, params, 'deduct', env);
                break;

            case 'getkv':
                await handleGetKV(chatId, params[0], env);
                break;

            case 'setkv':
                const kvKey = params[0];
                const kvValue = paramString.substring(kvKey.length).trim();
                await handleSetKV(chatId, kvKey, kvValue, env);
                break;

            case 'help':
                await handleHelp(chatId, env);
                break;
        }
    }
    return;
}

// Import these from other handler files
import { handleCallbackQuery } from './callbackHandlers.js';
import { handleAccessDeniedBanned } from './userHandlers.js';
import { handleTxidSubmission } from './premiumHandlers.js';
import { handleCustomGbRedemptionInput } from './referralHandlers.js';
import { handleAdminApprove, handleAdminReject } from './adminHandlers.js';
import { sendMessage } from '../utils.js';
