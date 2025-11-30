import { get_text, formatText, sendMessage, sendOrEditMessage, editMessageText } from '../utils.js';
import { get_user_language, setUserState, getUserById, setUserLanguage, isAdmin } from '../database.js';
import { handleStart } from './userHandlers.js';
import { handleMainMenu, handleAboutMe, handlePolicyTerms } from './userHandlers.js';
import { handlePremium, handlePremiumDescription, handlePremiumSelect, handlePaymentMethodSelect } from './premiumHandlers.js';
import { handleReferral, handleCreditHistory, handleVerifyJoin, handleRedeemSelectPanel, handleRedeemPanelSelect, handleCustomRedeemPrompt, handleMyRedeemedKeys, handleKeyDeleteConfirm, handleKeyDeleteFinal } from './referralHandlers.js';
import { handleAdminMenu, handleAdminPanelSelect, handleAdminApprove, handleAdminReject } from './adminHandlers.js';
import { handleStatsMenu, handleStats, handleRecentUsers } from './adminHandlers.js';
import { handleApps, handleAppsIos, handleAppsAndroid, handleAppsWindows, handleAppsMacos } from './userHandlers.js';
import { LANG_EN, LANG_MY, SERVER_NAMES, PREMIUM_CREDIT_PLANS, CREDIT_COST_PER_GB } from '../config.js';

// =========================================================================
// CALLBACK QUERY HANDLERS
// =========================================================================

export async function handleCallbackQuery(callbackQuery, env) {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const userId = callbackQuery.from.id;
    const username = callbackQuery.from.username ?? '';
    const firstName = callbackQuery.from.first_name ?? '';
    const lastName = callbackQuery.from.last_name ?? '';

    await saveUser(userId, username, firstName, lastName, null, null, env);

    await sendMessage(callbackQuery.from.id, "", null, true);

    if (!data.startsWith('stats_') && !data.startsWith('method_select_') && !data.startsWith('premium_select_') && data !== 'redeem_custom_prompt' && !data.startsWith('online_page_') && !data.startsWith('view_my_keys_') && !data.startsWith('key_delete_') && !data.startsWith('admin_create_panel_') && !data.startsWith('redeem_panel_final_')) {
        await setUserState(userId, 'clear', {}, env);
    }

    let match;
    if (match = data.match(/^stats_users_(\d+)_(.*)$/)) {
        const page = parseInt(match[1]);
        const backCallback = match[2];
        await handleRecentUsers(chatId, messageId, page, backCallback, env);
        return;
    }

    if (match = data.match(/^online_page_(\d+)$/)) {
        const page = parseInt(match[1]);
        await handleOnlineUsers(chatId, messageId, page, true, env);
        return;
    }

    if (match = data.match(/^view_my_keys_page_(\d+)$/)) {
        const page = parseInt(match[1]);
        await handleMyRedeemedKeys(chatId, userId, messageId, page, env);
        return;
    }

    if (match = data.match(/^key_delete_confirm_([a-zA-Z0-9]+)_(\d+)$/)) {
        const key = match[1];
        const panel = parseInt(match[2]);
        await handleKeyDeleteConfirm(chatId, userId, messageId, key, panel, env);
        return;
    }

    if (match = data.match(/^key_delete_final_([a-zA-Z0-9]+)_(\d+)$/)) {
        const key = match[1];
        const panel = parseInt(match[2]);
        await handleKeyDeleteFinal(chatId, userId, messageId, key, panel, env);
        return;
    }

    if (match = data.match(/^stats_summary_(.*)$/)) {
        const backCallback = match[1];

        if (backCallback === 'menu_start') {
            await handleStart(chatId, username, firstName, lastName, messageId, true, null, env);
        } else if (backCallback === 'menu_about') {
            await handleAboutMe(chatId, messageId, env);
        } else if (backCallback === 'menu_basic_stats') {
            await handleStatsMenu(chatId, messageId, env);
        } else if (backCallback === 'menu_admin') {
            if (!isAdmin(userId)) return;
            await handleAdminMenu(chatId, messageId, env);
        }
        return;
    }

    if (match = data.match(/^premium_select_(\d+)$/)) {
        const gbLimit = parseInt(match[1]);
        await handlePremiumSelect(chatId, userId, messageId, gbLimit, env);
        return;
    }

    if (match = data.match(/^method_select_(\d+)_([a-z]+)$/)) {
        const gbLimit = parseInt(match[1]);
        const methodKey = match[2];
        await handlePaymentMethodSelect(chatId, userId, messageId, gbLimit, methodKey, env);
        return;
    }

    if (match = data.match(/^admin_create_panel_(\d+)_(\d+)_(\d+)_([a-zA-Z0-9@.-]+)$/)) {
        const panel = parseInt(match[1]);
        const gbLimit = parseInt(match[2]);
        const daysLimit = parseInt(match[3]);
        const userName = match[4];
        await handleAdminPanelSelect(chatId, messageId, panel, gbLimit, daysLimit, userName, env);
        return;
    }

    if (match = data.match(/^redeem_panel_final_(\d+)_([\d\.]+)_(\d+)$/)) {
        const gbLimit = parseInt(match[1]);
        const cost = parseFloat(match[2]);
        const panel = parseInt(match[3]);
        await handleRedeemPanelSelect(chatId, userId, messageId, gbLimit, cost, panel, env);
        return;
    }

    if (match = data.match(/^admin_approve_(\d+)_(\d+)$/)) {
        const targetUserId = parseInt(match[1]);
        const gbLimit = parseInt(match[2]);
        await handleAdminApprove(chatId, targetUserId, gbLimit, messageId, env);
        return;
    }

    if (match = data.match(/^admin_reject_(\d+)$/)) {
        const targetUserId = parseInt(match[1]);
        await handleAdminReject(chatId, targetUserId, messageId, env);
        return;
    }

    switch (data) {
        case 'menu_start':
            await handleStart(chatId, username, firstName, lastName, messageId, true, null, env);
            break;
        case 'menu_main':
            await handleMainMenu(chatId, messageId, env);
            break;
        case 'menu_premium':
            await setUserState(userId, 'clear', {}, env);
            await handlePremium(chatId, messageId, true, env);
            break;
        case 'menu_premium_desc':
            await handlePremiumDescription(chatId, messageId, env);
            break;
        case 'menu_about':
            await handleAboutMe(chatId, messageId, env);
            break;
        case 'menu_policy':
            await handlePolicyTerms(chatId, messageId, env);
            break;
        case 'referral_back':
            await handleReferral(chatId, userId, messageId, env);
            break;
        case 'redeem_5gb':
            await handleRedeemSelectPanel(chatId, userId, messageId, 5, env);
            break;
        case 'redeem_10gb':
            await handleRedeemSelectPanel(chatId, userId, messageId, 10, env);
            break;
        case 'redeem_custom_prompt':
            await handleCustomRedeemPrompt(chatId, userId, messageId, env);
            break;
        case 'show_credit_history':
            await handleCreditHistory(chatId, messageId, env);
            break;
        case 'view_my_keys_page_1':
            await handleMyRedeemedKeys(chatId, userId, messageId, 1, env);
            break;
        case 'verify_channel_join':
            await handleVerifyJoin(chatId, userId, messageId, env);
            break;

        case 'menu_admin':
            if (!isAdmin(userId)) return;
            await handleAdminMenu(chatId, messageId, env);
            break;

        case 'admin_online_users':
            if (!isAdmin(userId)) return;
            await handleOnlineUsers(chatId, messageId, env);
            break;

        case 'admin_run_warnings':
            if (!isAdmin(userId)) return;
            await handleRunWarnings(chatId, env);
            break;

        case 'admin_stats_full':
            if (!isAdmin(userId)) return;
            await handleStats(chatId, messageId, true, 'menu_admin', env);
            break;

        case 'admin_broadcast_prompt':
            if (!isAdmin(userId)) return;
            const lang = await get_user_language(chatId, env);
            await sendMessage(chatId, get_text('broadcast_usage', lang));
            break;

        case 'menu_stats_btn':
            await handleStatsMenu(chatId, messageId, env);
            break;
        case 'menu_server_btn':
            await handleServerInfo(chatId, messageId, env);
            break;

        case 'stats_usage_report':
            await handleStats(chatId, messageId, true, 'menu_basic_stats', env);
            break;

        case 'menu_basic_stats':
            await handleStatsMenu(chatId, messageId, env);
            break;

        case 'ignore':
            break;

        case 'set_lang_' + LANG_EN:
            await handleSetLanguage(chatId, userId, LANG_EN, messageId, env);
            break;
        case 'set_lang_' + LANG_MY:
            await handleSetLanguage(chatId, userId, LANG_MY, messageId, env);
            break;

        case 'apps_ios':
            await handleAppsIos(chatId, messageId, env);
            break;
        case 'apps_android':
            await handleAppsAndroid(chatId, messageId, env);
            break;
        case 'apps_windows':
            await handleAppsWindows(chatId, messageId, env);
            break;
        case 'apps_macos':
            await handleAppsMacos(chatId, messageId, env);
            break;
        case 'apps_back':
            await handleApps(chatId, messageId, env);
            break;
    }
}

export async function handleSetLanguage(chatId, userId, langCode, messageId, env) {
    if (langCode !== LANG_EN && langCode !== LANG_MY) {
        return;
    }

    await setUserLanguage(userId, langCode, env);

    const langNameKey = 'lang_name_' + langCode;
    const langName = get_text(langNameKey, langCode);

    const confirmation = formatText(get_text('lang_confirmed', langCode), langName);

    await sendOrEditMessage(chatId, confirmation, messageId);
}

// Import dependencies
import { saveUser } from '../database.js';
import { handleRunWarnings, handleOnlineUsers, handleStatsMenu, handleServerInfo, handleRecentUsers } from './adminHandlers.js';
