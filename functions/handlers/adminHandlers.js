import { get_text, formatText, sendMessage, sendOrEditMessage, editMessageText, generateRandomKey } from '../utils.js';
import { get_user_language, setUserState, getUserById, getUserByCriteria, isAdmin, setCredits, getUserStats, getUserActivityStats } from '../database.js';
import { createPremiumAccount, deletePremiumAccount, deleteTrialAccount, deleteExpiredAccounts, transferAccount, resetTrafficUsage, modifyAccountDetails, bulkCreateAccounts, runExpiryWarnings, getOptimalPanel, getPanelStats, getOnlineUsers } from '../api.js';
import { SERVER_NAMES, PREMIUM_DEFAULT_DAYS, DEFAULT_LANG, ADMIN_IDS, BOT_USERS_KEY, USER_STATE_KEY } from '../config.js';
import { readKV, updateKV } from '../kv.js';

// =========================================================================
// ADMIN COMMAND HANDLERS
// =========================================================================

export async function handleAdminMenu(chatId, messageId, env) {
    const lang = await get_user_language(chatId, env);

    if (!isAdmin(chatId)) {
        await sendMessage(chatId, get_text('admin_access_denied', lang));
        return;
    }

    const message = get_text('menu_admin_title', lang) + "\n" +
        get_text('welcome_separator', lang) + "\n\n" +
        "👑 *Admin commands are now accessible only via text commands (e.g., /stats, /broadcast, /online, /create, /ban).*";

    const keyboard = {
        inline_keyboard: [
            [
                { text: get_text('button_back_to_start', lang), callback_data: 'menu_start' }
            ]
        ]
    };

    await sendOrEditMessage(chatId, message, messageId, keyboard);
}

export async function handleCreate(chatId, params, env) {
    const lang = await get_user_language(chatId, env);
    if (!isAdmin(chatId)) {
        await sendMessage(chatId, get_text('admin_access_denied', lang));
        return;
    }

    if (params.length < 3 || isNaN(parseFloat(params[0])) || !params[1] || isNaN(parseInt(params[2]))) {
        await sendMessage(chatId, get_text('admin_usage', lang) + " " + get_text('cmd_create', lang));
        return;
    }

    const gbLimit = parseFloat(params[0]);
    const userName = params[1];
    const daysLimit = parseInt(params[2]);
    const panel = parseInt(params[3]);

    if (panel && !isNaN(panel) && panel > 0) {
        await finalizeAdminCreate(chatId, gbLimit, userName, daysLimit, panel, null, env);
        return;
    }

    const message = formatText(get_text('prompt_select_panel_create', lang), userName, gbLimit);

    await setUserState(chatId, 'waiting_for_create_panel', { gb: gbLimit, name: userName, days: daysLimit }, env);

    const keyboardButtons = [];
    for (const panelId in SERVER_NAMES) {
        const panelName = SERVER_NAMES[panelId];
        keyboardButtons.push([{
            text: formatText(get_text('panel_button_name', lang), panelName),
            callback_data: `admin_create_panel_${panelId}_${gbLimit}_${daysLimit}_${userName}`
        }]);
    }

    keyboardButtons.push([{ text: get_text('button_back', lang), callback_data: 'menu_admin' }]);
    const keyboard = { inline_keyboard: keyboardButtons };

    await sendMessage(chatId, message, keyboard);
}

export async function handleAdminPanelSelect(chatId, messageId, panel, gbLimit, daysLimit, userName, env) {
    const adminLang = await get_user_language(chatId, env);

    await setUserState(chatId, 'clear', {}, env);

    if (panel <= 0 || !SERVER_NAMES[panel]) {
        await sendOrEditMessage(chatId, get_text('error_invalid_panel_range', adminLang), messageId);
        return;
    }

    await finalizeAdminCreate(chatId, gbLimit, userName, daysLimit, panel, messageId, env);
}

async function finalizeAdminCreate(chatId, gbLimit, userName, daysLimit, panel, messageId, env) {
    const adminLang = await get_user_language(chatId, env);

    let loadingMessageId = messageId;
    if (!loadingMessageId) {
        const initialMsg = await sendMessage(chatId, get_text('status_creating_premium', adminLang));
        loadingMessageId = initialMsg.data?.result?.message_id;
    } else {
        await editMessageText(chatId, loadingMessageId, get_text('status_creating_premium', adminLang));
    }

    const result = await createPremiumAccount(gbLimit, userName, daysLimit, panel);

    const panelNameDisplay = SERVER_NAMES[panel] ?? `Panel ${panel}`;
    let finalMessage;

    if (result.success) {
        const data = result.data;
        const expiryText = daysLimit > 0 ? `${daysLimit} days` : "Unlimited";

        finalMessage = get_text('create_success_title', adminLang) + "\n\n" +
                                        get_text('field_email', adminLang) + ` \`${data.email}\`\n` +
                                        get_text('field_password', adminLang) + ` \`${data.password}\`\n` +
                                        get_text('field_data_limit', adminLang) + ` ${gbLimit} GB\n` +
                                        get_text('field_expiry_days', adminLang) + ` ${expiryText}\n` +
                                        get_text('field_panel_id', adminLang) + ` ${panelNameDisplay}\n\n` +
                                        get_text('field_link', adminLang) + `\n\`${data.link}\`\n\n` +
                                        get_text('field_qr', adminLang) + `\n${data.qr_code}`;
    } else {
        finalMessage = get_text('error_admin_create_failed', adminLang) + "\n\n" +
                                        get_text('error_prefix', adminLang) + ` \`${result.error}\``;
    }

    if (loadingMessageId) {
        const editResult = await editMessageText(chatId, loadingMessageId, finalMessage);

        if (!editResult.success) {
            await sendMessage(chatId, finalMessage);
        }
    } else {
        await sendMessage(chatId, finalMessage);
    }
}

export async function handleDelPrem(chatId, params, env) {
    const lang = await get_user_language(chatId, env);
    if (!isAdmin(chatId)) {
        await sendMessage(chatId, get_text('admin_access_denied', lang));
        return;
    }

    if (params.length < 2 || isNaN(parseInt(params[1]))) {
        await sendMessage(chatId, get_text('admin_usage', lang) + " " + get_text('cmd_delprem', lang));
        return;
    }

    const userName = params[0];
    const panel = parseInt(params[1]);

    const initialMsg = await sendMessage(chatId, get_text('status_deleting_premium', lang));
    const messageId = initialMsg.data?.result?.message_id;

    const result = await deletePremiumAccount(userName, panel);

    if (result.success) {
        const data = result.data;

        const message = get_text('delete_prem_success', lang) + "\n\n" +
                                        get_text('field_email', lang) + ` \`${userName}\`\n` +
                                        get_text('field_panel_id', lang) + ` ${data.panel_name}\n` +
                                        get_text('field_status_result', lang) + ` ${data.status}`;

        await sendOrEditMessage(chatId, message, messageId);
    } else {
        const errorMessage = get_text('error_admin_delete_failed', lang) + "\n\n" +
                                        get_text('error_prefix', lang) + ` \`${result.error}\``;
        await sendOrEditMessage(chatId, errorMessage, messageId);
    }
}

export async function handleDelTrial(chatId, telegramId, env) {
    const lang = await get_user_language(chatId, env);
    if (!isAdmin(chatId)) {
        await sendMessage(chatId, get_text('admin_access_denied', lang));
        return;
    }

    const initialMsg = await sendMessage(chatId, get_text('status_deleting_trial', lang));
    const messageId = initialMsg.data?.result?.message_id;

    const result = await deleteTrialAccount(telegramId);

    if (result.success) {
        const data = result.data;

        const message = get_text('delete_trial_success', lang) + "\n\n" +
                                        get_text('field_telegram_id', lang) + ` \`${telegramId}\`\n` +
                                        get_text('field_panel_id', lang) + ` ${data.panel_name}\n` +
                                        get_text('field_status_result', lang) + ` ${data.status}`;

        await sendOrEditMessage(chatId, message, messageId);
    } else {
        const errorMessage = get_text('error_admin_deltrial_failed', lang) + "\n\n" +
                                        get_text('error_prefix', lang) + ` \`${result.error}\``;
        await sendOrEditMessage(chatId, errorMessage, messageId);
    }
}

export async function handleDelExp(chatId, panelParam, env) {
    const lang = await get_user_language(chatId, env);
    if (!isAdmin(chatId)) {
        await sendMessage(chatId, get_text('admin_access_denied', lang));
        return;
    }

    const panel = panelParam ? parseInt(panelParam) : null;
    const type_key = panel ? 'delete_exp_premium_type' : 'delete_exp_trial_type';
    const type_name = panel ? formatText(get_text(type_key, lang), panel) : get_text(type_key, lang);

    const initialMsg = await sendMessage(chatId, formatText(get_text('status_deleting_expired', lang), type_name));
    const messageId = initialMsg.data?.result?.message_id;

    const result = await deleteExpiredAccounts(panel);

    if (result.success) {
        const data = result.data;

        let message = get_text('delete_exp_complete', lang) + "\n\n" +
                                        get_text('field_deleted_type', lang) + ` ${type_name}\n` +
                                        get_text('field_panel_id', lang) + ` ${data.panel_name}\n` +
                                        get_text('field_deleted_count', lang) + ` ${data.deleted_count} accounts\n` +
                                        get_text('field_total_expired', lang) + ` ${data.total_expired_found} expired\n` +
                                        get_text('field_status_result', lang) + ` ${data.status}`;

        if (data.failed_deletions && data.failed_deletions.length > 0) {
            message += "\n\n" + get_text('field_failed_deletions', lang) + ` ${data.failed_deletions.length}`;
        }

        await sendOrEditMessage(chatId, message, messageId);
    } else {
        const errorMessage = get_text('error_admin_delexp_failed', lang) + "\n\n" +
                                        get_text('error_prefix', lang) + ` \`${result.error}\``;
        await sendOrEditMessage(chatId, errorMessage, messageId);
    }
}

export async function handleTransfer(chatId, params, env) {
    const lang = await get_user_language(chatId, env);
    if (!isAdmin(chatId)) {
        await sendMessage(chatId, get_text('admin_access_denied', lang));
        return;
    }

    if (params.length < 3 || isNaN(parseInt(params[1])) || isNaN(parseInt(params[2]))) {
        await sendMessage(chatId, get_text('usage_transfer', lang));
        return;
    }

    const userName = params[0];
    const fromPanel = parseInt(params[1]);
    const toPanel = parseInt(params[2]);

    if (fromPanel <= 0 || toPanel <= 0) {
        await sendMessage(chatId, get_text('error_invalid_panel_range', lang));
        return;
    }

    const initialMsg = await sendMessage(chatId, formatText(get_text('status_transferring', lang), userName, fromPanel, toPanel));
    const messageId = initialMsg.data?.result?.message_id;

    const result = await transferAccount(userName, fromPanel, toPanel);

    if (result.success) {
        const data = result.data;
        const message = formatText(get_text('transfer_success', lang), data.from_panel, data.to_panel, data.email) + "\n\n" +
            get_text('field_link', lang) + `\`\`\`${data.link}\`\`\`\n\n` +
            get_text('field_qr', lang) + `\n${data.qr_code}`;
        await sendOrEditMessage(chatId, message, messageId);
    } else {
        const errorMessage = get_text('error_prefix', lang) + ` \`${result.error}\`\n\n` +
            (result.data?.status ?? '');
        await sendOrEditMessage(chatId, errorMessage, messageId);
    }
}

export async function handleResetTraffic(chatId, params, env) {
    const lang = await get_user_language(chatId, env);
    if (!isAdmin(chatId)) {
        await sendMessage(chatId, get_text('admin_access_denied', lang));
        return;
    }

    if (params.length < 2 || isNaN(parseInt(params[1]))) {
        await sendMessage(chatId, get_text('usage_resettraffic', lang));
        return;
    }

    const userName = params[0];
    const panel = parseInt(params[1]);

    if (panel <= 0) {
        await sendMessage(chatId, get_text('error_invalid_panel_range', lang));
        return;
    }

    const initialMsg = await sendMessage(chatId, formatText(get_text('status_resetting', lang), userName, panel));
    const messageId = initialMsg.data?.result?.message_id;

    const result = await resetTrafficUsage(userName, panel);

    if (result.success) {
        const data = result.data;
        const message = formatText(get_text('reset_success', lang), data.email, data.panel_name, data.status);
        await sendOrEditMessage(chatId, message, messageId);
    } else {
        const errorMessage = get_text('error_prefix', lang) + ` \`${result.error}\``;
        await sendOrEditMessage(chatId, errorMessage, messageId);
    }
}

export async function handleModifyAccount(chatId, params, env) {
    const lang = await get_user_language(chatId, env);
    if (!isAdmin(chatId)) {
        await sendMessage(chatId, get_text('admin_access_denied', lang));
        return;
    }

    if (params.length < 4 || isNaN(parseInt(params[1])) || isNaN(parseFloat(params[2])) || isNaN(parseInt(params[3]))) {
        await sendMessage(chatId, get_text('usage_modify', lang));
        return;
    }

    const userName = params[0];
    const panel = parseInt(params[1]);
    const gbLimit = parseFloat(params[2]);
    const daysLimit = parseInt(params[3]);
    const newPassword = params[4] ?? '';

    if (panel <= 0) {
        await sendMessage(chatId, get_text('error_invalid_panel_range', lang));
        return;
    }

    if (gbLimit < 0 || daysLimit < 0) {
        await sendMessage(chatId, "❌ *GB Limit and Days Limit must be non-negative numbers.*");
        return;
    }

    const initialMsg = await sendMessage(chatId, formatText(get_text('status_modifying', lang), userName, panel));
    const messageId = initialMsg.data?.result?.message_id;

    const result = await modifyAccountDetails(userName, panel, gbLimit, daysLimit, newPassword);

    if (result.success) {
        const data = result.data;
        const passwordStatus = newPassword ? 'Updated' : 'Not Changed';
        const message = formatText(get_text('modify_success', lang), data.email, data.panel_name, data.status) +
            `\nChanges:\n- GB Limit: ${gbLimit} GB\n- Days: ${daysLimit} days\n- Password: ${passwordStatus}`;
        await sendOrEditMessage(chatId, message, messageId);
    } else {
        const errorMessage = get_text('error_prefix', lang) + ` \`${result.error}\`\n\nDetails: ${result.data?.details ?? 'N/A'}`;
        await sendOrEditMessage(chatId, errorMessage, messageId);
    }
}

export async function handleBulkCreate(chatId, params, env) {
    const lang = await get_user_language(chatId, env);
    if (!isAdmin(chatId)) {
        await sendMessage(chatId, get_text('admin_access_denied', lang));
        return;
    }

    if (params.length < 4 || isNaN(parseFloat(params[1])) || isNaN(parseInt(params[2])) || isNaN(parseInt(params[3]))) {
        await sendMessage(chatId, get_text('usage_bulkcreate', lang));
        return;
    }

    const namesString = params[0];
    const gbLimit = parseFloat(params[1]);
    const daysLimit = parseInt(params[2]);
    const panel = parseInt(params[3]);
    const names = namesString.split(',').map(name => name.trim()).filter(name => name.length > 0);

    if (panel <= 0) {
        await sendMessage(chatId, get_text('error_invalid_panel_range', lang));
        return;
    }
    if (names.length === 0) {
        await sendMessage(chatId, "❌ No user names provided for bulk creation.");
        return;
    }

    const initialMsg = await sendMessage(chatId, formatText(get_text('status_bulk_create', lang), names.length));
    const messageId = initialMsg.data?.result?.message_id;

    const result = await bulkCreateAccounts(names, gbLimit, daysLimit, panel);

    if (result.success) {
        const message = get_text('bulk_success', lang) + `\n\n*Count:* ${names.length}\n*GB:* ${gbLimit}\n*Panel:* ${panel}\n\n_Note: Individual results are logged on the PHP server side, as the API does not return a full batch response here._`;
        await sendOrEditMessage(chatId, message, messageId);
    } else {
        const errorMessage = get_text('error_prefix', lang) + ` \`${result.error}\``;
        await sendOrEditMessage(chatId, errorMessage, messageId);
    }
}

export async function handleRunWarnings(chatId, env) {
    const lang = await get_user_language(chatId, env);
    if (!isAdmin(chatId)) {
        await sendMessage(chatId, get_text('admin_access_denied', lang));
        return;
    }

    const initialMsg = await sendMessage(chatId, get_text('status_running_warnings', lang));
    const messageId = initialMsg.data?.result?.message_id;

    const result = await runExpiryWarnings();

    if (result.success) {
        const message = get_text('warnings_success', lang) + `\n\nStatus: ${result.data?.status ?? 'Completed successfully.'}`;
        await sendOrEditMessage(chatId, message, messageId);
    } else {
        const errorMessage = get_text('error_prefix', lang) + ` \`${result.error}\``;
        await sendOrEditMessage(chatId, errorMessage, messageId);
    }
}

export async function handleOptimalPanel(chatId, params, env) {
    const lang = await get_user_language(chatId, env);
    if (!isAdmin(chatId)) {
        await sendMessage(chatId, get_text('admin_access_denied', lang));
        return;
    }

    const type = params[0] === 'trial' ? 'trial' : 'premium';

    const initialMsg = await sendMessage(chatId, formatText(get_text('status_optimal_panel', lang), type));
    const messageId = initialMsg.data?.result?.message_id;

    const result = await getOptimalPanel(type);

    if (result.success) {
        const data = result.data;
        const message = formatText(get_text('optimal_success', lang), data.optimal_panel, data.panel_name, data.account_type.toUpperCase());
        await sendOrEditMessage(chatId, message, messageId);
    } else {
        const errorMessage = get_text('error_prefix', lang) + ` \`${result.error}\``;
        await sendOrEditMessage(chatId, errorMessage, messageId);
    }
}

export async function handleCreditControl(chatId, params, operation, env) {
    const lang = await get_user_language(chatId, env);
    if (!isAdmin(chatId)) {
        await sendMessage(chatId, get_text('admin_access_denied', lang));
        return;
    }

    if (params.length < 2) {
        const usageKey = operation === 'add' ? 'admin_credit_usage_add' : 'admin_credit_usage_remove';
        await sendMessage(chatId, get_text('admin_usage', lang) + " " + get_text(usageKey, lang));
        return;
    }

    const criteria = params[0];
    const amount = parseFloat(params[1]);

    if (isNaN(amount) || amount <= 0) {
        await sendMessage(chatId, get_text('admin_credit_value_error', lang));
        return;
    }

    const targetUser = await getUserByCriteria(criteria, env);
    if (!targetUser) {
        await sendMessage(chatId, formatText(get_text('error_user_not_found', lang), criteria));
        return;
    }

    const loadingText = `🔄 *${operation === 'add' ? 'Adding' : 'Removing'} ${amount.toFixed(1)} Credits* for user \`${targetUser.user_id}\`...`;
    const initialMsg = await sendMessage(chatId, loadingText);
    const messageId = initialMsg.data?.result?.message_id;

    const targetUserId = targetUser.user_id;
    const targetName = targetUser.username ? `@${targetUser.username.replace(/_/g, '\\_')}` : String(targetUserId);

    const source = operation === 'add' ? get_text('credit_source_admin_add', lang) : get_text('credit_source_admin_deduct', lang);
    const { success, newCredit } = await setCredits(targetUserId, amount, operation, false, source, env);

    if (success) {
        const successKey = operation === 'add' ? 'admin_add_credit_success' : 'admin_remove_credit_success';
        const finalMessage = formatText(get_text(successKey, lang), amount, targetName, newCredit);
        await sendOrEditMessage(chatId, finalMessage, messageId);
    } else {
        const errorMessage = get_text('error_admin_approval_failed', lang);
        await sendOrEditMessage(chatId, errorMessage, messageId);
    }
}

export async function handleGetKV(chatId, key, env) {
    const lang = await get_user_language(chatId, env);
    if (!isAdmin(chatId)) {
        await sendMessage(chatId, get_text('admin_access_denied', lang));
        return;
    }

    if (!key) {
        await sendMessage(chatId, get_text('admin_kv_usage_get', lang));
        return;
    }

    try {
        const value = await env.BOT_KV.get(key);
        let content = value ?? 'null';

        try {
            if (content && typeof content === 'string' && (content.startsWith('{') || content.startsWith('['))) {
                content = JSON.stringify(JSON.parse(content), null, 2);
            }
        } catch (e) {
            // Ignore JSON parsing error
        }

        const message = formatText(get_text('admin_kv_get_success', lang), key) + `\n\n\`\`\`json\n${content}\n\`\`\``;
        await sendMessage(chatId, message);
    } catch (e) {
        const errorMsg = formatText(get_text('admin_kv_error', lang), e.message);
        await sendMessage(chatId, errorMsg);
    }
}

export async function handleSetKV(chatId, key, jsonValue, env) {
    const lang = await get_user_language(chatId, env);
    if (!isAdmin(chatId)) {
        await sendMessage(chatId, get_text('admin_access_denied', lang));
        return;
    }

    if (!key || !jsonValue) {
        await sendMessage(chatId, get_text('admin_kv_usage_set', lang));
        return;
    }

    try {
        let parsedValue = jsonValue.trim();
        let valueToStore = parsedValue;

        if (parsedValue.startsWith('{') || parsedValue.startsWith('[')) {
            try {
                valueToStore = JSON.stringify(JSON.parse(parsedValue));
            } catch (e) {
                await sendMessage(chatId, `⚠️ Warning: Input for key \`${key}\` was sent as a raw string because JSON parsing failed: ${e.message}`);
                valueToStore = parsedValue;
            }
        }

        await env.BOT_KV.put(key, valueToStore);

        let confirmationValue = valueToStore;
        try {
            confirmationValue = JSON.stringify(JSON.parse(valueToStore), null, 2);
        } catch (e) {
            // Keep original value if not JSON
        }

        const message = formatText(get_text('admin_kv_set_success', lang), key) +
                            `\n\n*Set Value:* \n\`\`\`json\n${confirmationValue}\n\`\`\``;

        await sendMessage(chatId, message);
    } catch (e) {
        const errorMsg = formatText(get_text('admin_kv_error', lang), e.message);
        await sendMessage(chatId, errorMsg);
    }
}

export async function handleBan(chatId, criteria, env) {
    const lang = await get_user_language(chatId, env);
    if (!isAdmin(chatId)) {
        await sendMessage(chatId, get_text('admin_access_denied', lang));
        return;
    }

    const targetUser = await getUserByCriteria(criteria, env);
    if (!targetUser) {
        await sendMessage(chatId, formatText(get_text('error_user_not_found', lang), criteria));
        return;
    }

    const targetUserId = targetUser.user_id;
    const targetName = getSafeDisplayName(targetUser);

    if (isAdmin(targetUserId)) {
        await sendMessage(chatId, get_text('error_cannot_ban_admin', lang));
        return;
    }

    if (targetUser.is_banned ?? false) {
        await sendMessage(chatId, get_text('error_user_already_banned', lang));
        return;
    }

    if (await setBanStatus(targetUserId, true, env)) {
        await sendMessage(chatId, formatText(get_text('ban_success_admin', lang), targetName));

        const userLang = targetUser.lang ?? DEFAULT_LANG;
        const keyboard = {
            inline_keyboard: [
                [
                    { text: get_text('button_contact_admin', userLang), url: OWNER_URL }
                ]
            ]
        };
        await sendMessage(targetUserId, get_text('user_banned_notification', userLang), keyboard);
    } else {
        await sendMessage(chatId, get_text('error_admin_approval_failed', lang));
    }
}

export async function handleUnban(chatId, criteria, env) {
    const lang = await get_user_language(chatId, env);
    if (!isAdmin(chatId)) {
        await sendMessage(chatId, get_text('admin_access_denied', lang));
        return;
    }

    const targetUser = await getUserByCriteria(criteria, env);
    if (!targetUser) {
        await sendMessage(chatId, formatText(get_text('error_user_not_found', lang), criteria));
        return;
    }

    const targetUserId = targetUser.user_id;
    const targetName = getSafeDisplayName(targetUser);

    if (!(targetUser.is_banned ?? false)) {
        await sendMessage(chatId, get_text('error_user_not_banned', lang));
        return;
    }

    if (await setBanStatus(targetUserId, false, env)) {
        await sendMessage(chatId, formatText(get_text('unban_success_admin', lang), targetName));

        const userLang = targetUser.lang ?? DEFAULT_LANG;
        await sendMessage(targetUserId, get_text('user_unbanned_notification', userLang));
    } else {
        await sendMessage(chatId, get_text('error_admin_approval_failed', lang));
    }
}

export async function handleStats(chatId, messageId, isCallback = false, backTarget = 'menu_start', env) {
    const lang = await get_user_language(chatId, env);

    if (!isCallback && !isAdmin(chatId)) {
             await sendMessage(chatId, get_text('admin_access_denied', lang));
             return;
    }

    let loadingMessageId = messageId;

    if (!isCallback) {
        const initialMsg = await sendMessage(chatId, get_text('status_retrieving_stats', lang));
        loadingMessageId = initialMsg.data?.result?.message_id;
    }

    const stats = await getUserStats(env);
    const activityStats = getUserActivityStats(stats.users);

    let message = get_text('stats_report_title', lang) + "\n" +
                        get_text('welcome_separator', lang) + "\n";

    message += formatText(get_text('stats_active_day', lang), activityStats.day) + "\n";
    message += formatText(get_text('stats_active_week', lang), activityStats.week) + "\n";
    message += formatText(get_text('stats_active_month', lang), activityStats.month) + "\n";
    message += formatText(get_text('stats_active_year', lang), activityStats.year) + "\n";

    message += get_text('welcome_separator', lang) + "\n";

    message += formatText(get_text('stats_total_users_line', lang), activityStats.total);

    const keyboardButtons = [];

    if (backTarget === 'menu_basic_stats') {
        keyboardButtons.push([{ text: get_text('button_back', lang), callback_data: 'menu_basic_stats' }]);
    } else if (backTarget === 'menu_admin') {
        keyboardButtons.push([{ text: get_text('button_back', lang), callback_data: 'menu_admin' }]);
    }

    const keyboard = { inline_keyboard: keyboardButtons };

    await sendOrEditMessage(chatId, message, loadingMessageId, keyboard);
}

export async function handleOnlineUsers(chatId, messageId = null, env) {
    const lang = await get_user_language(chatId, env);

    if (!isAdmin(chatId)) {
        if (!isCallback) {
             await sendMessage(chatId, get_text('admin_access_denied', lang));
        }
        return;
    }

    let loadingMessageId = messageId;
    let initialMessage = null;

    if (!isCallback) {
        initialMessage = await sendMessage(chatId, get_text('status_fetching_online', lang));
        loadingMessageId = initialMessage.data?.result?.message_id;
    }

    const onlineDataKey = `online_users_data_${chatId}`;
    let cachedData = JSON.parse(await env.BOT_KV.get(onlineDataKey)) || {};
    let flattenedList = cachedData.list;
    let totalOnlineUsers = 0;
    let errorOccurred = false;
    let errorMessageText = '';
    let fetchedFresh = false;

    if (!flattenedList || cachedData.timestamp < (Date.now() - 60000)) {
        fetchedFresh = true;

        if (isCallback && loadingMessageId) {
             await editMessageText(chatId, loadingMessageId, get_text('status_fetching_online', lang), { inline_keyboard: [] });
        }

        const result = await getOnlineUsers();

        if (!result.success || result.data.total_online_users === 0) {
            errorOccurred = true;
            errorMessageText = result.success ? get_text('no_online_users_found', lang) : get_text('error_prefix', lang) + ` \`${result.error}\``;
        } else {
            totalOnlineUsers = result.data.total_online_users;
            flattenedList = prepareOnlineUsersForPagination(result.data);

            await env.BOT_KV.put(onlineDataKey, JSON.stringify({
                list: flattenedList,
                total: totalOnlineUsers,
                timestamp: Date.now()
            }), { expirationTtl: 120 });
        }
    } else {
        totalOnlineUsers = cachedData.total;
    }

    if (errorOccurred && (fetchedFresh || !flattenedList)) {
        const finalMessage = get_text('menu_online_users_title', lang) + "\n" +
                             get_text('welcome_separator', lang) + "\n\n" +
                             errorMessageText;
        await sendOrEditMessage(chatId, finalMessage, loadingMessageId, { inline_keyboard: [] });
        return;
    }

    const totalUsers = flattenedList.length;
    const totalPages = totalUsers > 0 ? Math.ceil(totalUsers / ONLINE_USERS_PER_PAGE) : 1;
    page = Math.max(1, Math.min(page, totalPages));
    const offset = (page - 1) * ONLINE_USERS_PER_PAGE;

    const currentPageUsers = flattenedList.slice(offset, offset + ONLINE_USERS_PER_PAGE);

    let message = get_text('menu_online_users_title', lang) + "\n" +
                        get_text('welcome_separator', lang) + "\n\n" +
                        formatText(get_text('field_total_online', lang), totalOnlineUsers) + "\n" +
                        formatText(get_text('stats_top_title', lang), page, totalPages) + "\n" +
                        get_text('welcome_separator', lang) + "\n\n";

    const usersByPanel = {};
    currentPageUsers.forEach(user => {
        if (!usersByPanel[user.panel]) usersByPanel[user.panel] = [];
        usersByPanel[user.panel].push(user);
    });

    const sortedPanelNames = Object.keys(usersByPanel).sort();

    for (const panelName of sortedPanelNames) {
        const panelUsers = usersByPanel[panelName];
        message += formatText(get_text('field_online_on_panel', lang), panelName, panelUsers.length) + "\n";

        for (const user of panelUsers) {
            message += `\`${user.email}\`\n`;
        }
        message += "\n";
    }

    message = message.trim();

    const keyboardButtons = [];
    const navRow = [];

    if (page > 1) {
        navRow.push({ text: get_text('nav_online_prev', lang), callback_data: `online_page_${page - 1}` });
    }

    if (page < totalPages) {
        navRow.push({ text: get_text('nav_online_next', lang), callback_data: `online_page_${page + 1}` });
    }

    if (navRow.length > 0) {
        keyboardButtons.push(navRow);
    }

    const keyboard = { inline_keyboard: keyboardButtons };

    await sendOrEditMessage(chatId, message, loadingMessageId, keyboard);
}

function prepareOnlineUsersForPagination(apiData) {
    const flattenedList = [];
    const onlineByPanel = apiData.online_users_by_panel || {};

    for (const panelName in onlineByPanel) {
        const users = onlineByPanel[panelName];
        for (let i = 0; i < users.length; i++) {
            flattenedList.push({
                email: users[i],
                panel: panelName,
                index: flattenedList.length + 1
            });
        }
    }
    return flattenedList;
}

// Import dependencies
import { getSafeDisplayName } from '../utils.js';
import { setBanStatus } from '../database.js';
import { OWNER_URL, ONLINE_USERS_PER_PAGE } from '../config.js';
