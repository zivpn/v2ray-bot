import { get_text, formatText, getSafeDisplayName, sendMessage, sendOrEditMessage, editMessageText, deleteMessage } from '../utils.js';
import { get_user_language, saveUser, setUserState, getUserById, getUserByCriteria, displayUserInfo, cleanReferrerId } from '../database.js';
import { checkV2RayAccount } from '../api.js';
import { BOT_USERNAME, CHANNEL_URL, OWNER_URL, DEFAULT_LANG } from '../config.js';

// =========================================================================
// USER COMMAND HANDLERS
// =========================================================================

export async function handleAccessDeniedBanned(chatId, env) {
    const lang = await get_user_language(chatId, env);
    const message = get_text('access_denied_banned', lang);

    const keyboard = {
        inline_keyboard: [
            [
                { text: get_text('button_contact_admin', lang), url: OWNER_URL }
            ]
        ]
    };
    await sendMessage(chatId, message, keyboard);
}

export async function getInvitedByLine(referrerId, lang, env) {
    if (!referrerId) return '';

    const finalReferrerId = cleanReferrerId(referrerId);
    if (!finalReferrerId) return '';

    const referrer = await getUserById(finalReferrerId, env);
    if (!referrer) return '';

    const referrerNameDisplay = getSafeDisplayName(referrer);
    const referrerLink = `[${referrerNameDisplay}](tg://user?id=${finalReferrerId})`;

    return formatText(get_text('welcome_invited_by', lang), referrerLink);
}

export async function handleStart(chatId, username, firstName, lastName, messageId, isCallback = false, deepLink = null, env) {
    let referrerId = null;

    if (deepLink && deepLink.startsWith('r_')) {
        const potentialIdString = deepLink.substring(2);
        const potentialId = parseInt(potentialIdString);

        if (!isNaN(potentialId) && potentialId !== chatId) {
            referrerId = potentialId;
        }
    }

    await saveUser(chatId, username, firstName, lastName, null, referrerId, env);

    const user = await getUserById(chatId, env);
    const lang = user?.lang ?? DEFAULT_LANG;

    await setUserState(chatId, 'clear', {}, env);

    const fullName = (firstName + ' ' + (lastName ?? '')).trim();
    let animMessageId = null;

    if (!isCallback) {
        const animText1 = "*Starting V2Ray Manager...*";
        const animText2 = "*Generating Session Keys Please Wait...*";

        const animMsgResult = await sendMessage(chatId, animText1);
        animMessageId = animMsgResult.data?.result?.message_id;

        if (animMessageId) {
            await new Promise(r => setTimeout(r, 400));
            await editMessageText(chatId, animMessageId, animText2);
            await new Promise(r => setTimeout(r, 400));
        }
    }

    const invitedByLine = await getInvitedByLine(referrerId, lang, env);

    const welcomeText = formatText(get_text('welcome_start_line1', lang), fullName) +
                            invitedByLine +
                            "\n" +
                            get_text('welcome_separator', lang) + "\n" +
                            get_text('welcome_bot_desc', lang) + "\n" +
                            get_text('welcome_separator', lang) + "\n" +
                            get_text('welcome_join_prompt', lang) + "\n\n" +
                            get_text('quick_check_tip', lang);

    const keyboardButtons = [
        [
            { text: get_text('button_main_menu', lang), callback_data: 'menu_main' },
        ],
        [
            { text: get_text('button_about_me', lang), callback_data: 'menu_about' },
            { text: get_text('button_policy_terms', lang), callback_data: 'menu_policy' },
        ]
    ];

    const keyboard = { inline_keyboard: keyboardButtons };

    if (isCallback) {
        await sendOrEditMessage(chatId, welcomeText, messageId, keyboard);
    } else {
        if (animMessageId) {
            await deleteMessage(chatId, animMessageId);
        }
        await sendMessage(chatId, welcomeText, keyboard);
    }
}

export async function displayUserInfo(chatId, user, lang, header = "👨‍🦰 User Information") {
    if (!user) {
        await sendMessage(chatId, get_text('error_account_not_found', lang));
        return;
    }

    const fullName = (user.first_name + ' ' + (user.last_name ?? '')).trim();
    const usernameDisplay = user.username ? `@${user.username.replace(/_/g, '\\_')}` : get_text('stats_no_username', lang);

    const finalReferrerId = cleanReferrerId(user.referrer_id);
    const referrerDisplay = finalReferrerId ? `\`${finalReferrerId}\`` : 'N/A';

    const creditsDisplay = (user.credits ?? 0.0).toFixed(1);
    const referredCount = user.referred_count ?? 0;

    const message = `${header}\n━━━━━━━━━━━━━━━━\n` +
        `๏ Full Name: ${fullName || 'N/A'}\n` +
        `๏ Username: ${usernameDisplay}\n` +
        `๏ User ID: \`${user.user_id}\`\n` +
        `๏ Language: ${user.lang.toUpperCase()}\n` +
        `๏ Banned: ${user.is_banned ? 'Yes ❌' : 'No ✅'}\n` +
        `๏ Credits: ${creditsDisplay} 💰\n` +
        `๏ Referred Users: ${referredCount} 👥\n` +
        `๏ Channel Verified: ${user.channel_verified ? 'Yes ✅' : 'No ❌'}\n` +
        `๏ Referred By: ${referrerDisplay}\n` +
        `๏ Joined At: ${user.joined_at}`;

    await sendMessage(chatId, message);
}

export async function handleId(chatId, params, env) {
    const lang = await get_user_language(chatId, env);

    const criteria = params[0];

    if (!criteria || String(criteria) === String(chatId)) {
        const user = await getUserById(chatId, env);
        await displayUserInfo(chatId, user, lang);
        return;
    }

    if (!isAdmin(chatId)) {
        const errorMsg = "❌ *Access Denied*\n\nThis command can only look up your own information. Use `/id` without parameters.";
        await sendMessage(chatId, errorMsg);
        return;
    }

    const targetUser = await getUserByCriteria(criteria, env);

    if (!targetUser) {
        await sendMessage(chatId, formatText(get_text('error_user_not_found', lang), criteria));
        return;
    }

    await displayUserInfo(chatId, targetUser, lang);
}

export async function handleTrial(chatId, userId, env) {
    const lang = await get_user_language(chatId, env);
    const initialMsg = await sendMessage(chatId, get_text('status_creating_trial', lang));
    const messageId = initialMsg.data?.result?.message_id;

    await setUserState(userId, 'clear', {}, env);

    const result = await createTrialAccount(userId);

    if (result.success) {
        const data = result.data;
        const message = get_text('trial_success_title', lang) + "\n━━━━━━━━━━━━━━━━━━━━━━\n\n" +
            get_text('field_email', lang) + ` \`${data.email}\`\n` +
            get_text('field_password', lang) + ` \`${data.password}\`\n` +
            get_text('field_data_limit', lang) + ` ${data.data_limit}\n` +
            get_text('field_expiry', lang) + ` ${data.expiry}\n` +
            get_text('field_panel', lang) + ` ${data.panel_name}\n\n` +
            get_text('field_link', lang) + `\`\`\`${data.link}\`\`\`\n\n` +
            get_text('field_qr', lang) + `\n${data.qr_code}\n\n` +
            get_text('tip_copy_link', lang);

        await sendOrEditMessage(chatId, message, messageId);
    } else {
        let errorMessage = get_text('error_creation_failed', lang) + "\n━━━━━━━━━━━━━━━━━━━━━━\n\n" +
            get_text('error_prefix', lang) + ` \`${result.error}\`\n`;

        if (result.error.includes('already exists')) {
            errorMessage += "\n" + get_text('tip_create_new_trial', lang).replace('/trial', '/mytrial');
        }

        await sendOrEditMessage(chatId, errorMessage, messageId);
    }
}

export async function handleMyTrial(chatId, userId, env) {
    const lang = await get_user_language(chatId, env);
    const initialMsg = await sendMessage(chatId, get_text('status_retrieving_trial', lang));
    const messageId = initialMsg.data?.result?.message_id;

    await setUserState(userId, 'clear', {}, env);

    const result = await getTrialKey(userId);

    if (result.success) {
        const data = result.data;
        let expiryStatusText = data.expiry.status;
        if (data.expiry.status === 'expired') {
            expiryStatusText = get_text('expiry_expired', lang);
        } else if (data.expiry.status === 'expiring_soon') {
            expiryStatusText = get_text('expiry_expiring_soon', lang);
        }

        const message = get_text('trial_account_info_title', lang) + "\n━━━━━━━━━━━━━━━━━━━━━━\n\n" +
            get_text('field_email', lang) + ` \`${data.email}\`\n` +
            get_text('field_password', lang) + ` \`${data.password}\`\n` +
            get_text('field_data_usage', lang) + ` ${data.traffic.used.text} / ${data.traffic.total.text}\n` +
            get_text('field_remaining', lang) + ` ${data.traffic.remaining.text}\n` +
            get_text('field_expiry', lang) + ` ${data.expiry.expiry_date} (${expiryStatusText})\n` +
            get_text('field_panel', lang) + ` ${data.panel_name}\n\n` +
            get_text('field_link', lang) + `\`\`\`${data.link}\`\`\`\n\n` +
            get_text('field_qr', lang) + `\n${data.qr_code}\n\n` +
            get_text('tip_copy_link', lang);

        await sendOrEditMessage(chatId, message, messageId);
    } else {
        const errorMessage = get_text('error_account_not_found', lang) + "\n━━━━━━━━━━━━━━━━━━━━━━\n\n" +
            get_text('error_prefix', lang) + ` \`${result.error}\`\n\n` +
            get_text('tip_create_new_trial', lang);

        await sendOrEditMessage(chatId, errorMessage, messageId);
    }
}

export async function handleV2RayConfig(chatId, config, env) {
    const lang = await get_user_language(chatId, env);
    const initialMsg = await sendMessage(chatId, get_text('status_checking_config', lang));
    const messageId = initialMsg.data?.result?.message_id;

    const result = await checkV2RayAccount(config);

    if (result.success) {
        const data = result.data;
        const status = data.enable ? get_text('status_active', lang) : get_text('status_disabled', lang);

        let expiryStatus = get_text('status_active', lang);
        if (data.expiry.status === 'expired') {
            expiryStatus = get_text('expiry_expired', lang);
        } else if (data.expiry.status === 'expiring_soon') {
            expiryStatus = get_text('expiry_expiring_soon', lang);
        }

        const message = get_text('account_status_title', lang) + "\n━━━━━━━━━━━━━━━━━━━━━━\n" +
            get_text('field_email', lang) + ` \`${data.email}\`\n` +
            get_text('field_protocol', lang) + ` ${data.protocol.charAt(0).toUpperCase() + data.protocol.slice(1)}\n` +
            get_text('field_panel', lang) + ` ${data.panel_name}\n` +
            get_text('field_status', lang) + ` ${status}\n` +
            get_text('field_expiry_status', lang) + ` ${expiryStatus}\n\n` +
            get_text('traffic_usage_title', lang) + "\n━━━━━━━━━━━\n" +
            get_text('field_upload', lang) + ` ${data.traffic.upload.text}\n` +
            get_text('field_download', lang) + ` ${data.traffic.download.text}\n` +
            get_text('field_total', lang) + ` ${data.traffic.total.text}\n` +
            get_text('field_used', lang) + ` ${data.traffic.used.text}\n` +
            get_text('field_remaining_traffic', lang) + ` ${data.traffic.remaining.text}\n` +
            get_text('field_usage_percent', lang) + ` ${data.traffic.usage_percentage}\n\n` +
            get_text('expiry_details_title', lang) + "\n━━━━━━━━━━━\n" +
            get_text('field_remaining_time', lang) + ` ${data.expiry.remaining_time}\n` +
            get_text('field_expiry_date', lang) + ` ${data.expiry.expiry_date}\n` +
            get_text('field_days_left', lang) + ` ${data.expiry.days_remaining} days`;

        await sendOrEditMessage(chatId, message, messageId);
    } else {
        const errorMessage = get_text('error_check_failed', lang) + "\n\n" +
            get_text('error_prefix', lang) + ` \`${result.error}\`\n\n` +
            get_text('tip_check_config', lang);
        await sendOrEditMessage(chatId, errorMessage, messageId);
    }
}

export async function handleApps(chatId, messageId = null, env) {
    const lang = await get_user_language(chatId, env);
    const message = get_text('apps_select_device', lang);

    const keyboard = {
        inline_keyboard: [
            [
                { text: '📱 iOS', callback_data: 'apps_ios' },
                { text: '🤖 Android', callback_data: 'apps_android' }
            ],
            [
                { text: '🖥️ Windows', callback_data: 'apps_windows' },
                { text: '🍎 macOS', callback_data: 'apps_macos' }
            ]
        ]
    };

    await sendOrEditMessage(chatId, message, messageId, keyboard);
}

export async function handleLanguage(chatId, messageId = null, env) {
    const lang = await get_user_language(chatId, env);
    const message = get_text('lang_select_title', lang);

    const keyboard = {
        inline_keyboard: [
            [
                { text: get_text('lang_button_en', LANG_EN), callback_data: 'set_lang_' + LANG_EN },
                { text: get_text('lang_button_my', LANG_MY), callback_data: 'set_lang_' + LANG_MY }
            ]
        ]
    };

    await sendOrEditMessage(chatId, message, messageId, keyboard);
}

export async function handleHelp(chatId, env) {
    const lang = await get_user_language(chatId, env);

    let adminCommands = "";
    if (isAdmin(chatId)) {
        adminCommands = "\n\n" +
            get_text('admin_commands', lang) + "\n" +
            get_text('cmd_admin', lang) + "\n" +
            get_text('cmd_online', lang) + "\n" +
            get_text('cmd_stats', lang) + "\n" +
            get_text('cmd_broadcast', lang) + "\n" +
            get_text('cmd_reply', lang) + "\n" +
            get_text('cmd_approve', lang) + "\n" +
            get_text('cmd_reject', lang) + "\n" +
            get_text('cmd_ban_full', lang) + "\n" +
            get_text('cmd_unban_full', lang) + "\n" +
            get_text('cmd_create', lang) + "\n" +
            get_text('cmd_delprem', lang) + "\n" +
            get_text('cmd_deltrial', lang) + "\n" +
            get_text('cmd_delexp', lang) + "\n" +
            get_text('cmd_transfer', lang) + "\n" +
            get_text('cmd_resettraffic', lang) + "\n" +
            get_text('cmd_modify', lang) + "\n" +
            get_text('cmd_bulkcreate', lang) + "\n" +
            get_text('cmd_runwarnings', lang) + "\n" +
            get_text('cmd_optimal', lang) + "\n" +
            get_text('admin_credit_usage_add', lang) + "\n" +
            get_text('admin_credit_usage_remove', lang) + "\n" +
            get_text('cmd_getkv', lang) + "\n" +
            get_text('cmd_setkv', lang);
    }

    const helpText = get_text('cmd_help', lang) + "\n\n" +
        get_text('available_commands', lang) + "\n" +
        get_text('cmd_premium', lang) + "\n" +
        get_text('cmd_referral', lang) + "\n" +
        get_text('cmd_trial', lang) + "\n" +
        get_text('cmd_mytrial', lang) + "\n" +
        get_text('cmd_apps', lang) + "\n" +
        get_text('cmd_id', lang) + "\n" +
        get_text('cmd_language', lang) + "\n" +
        get_text('cmd_help', lang) + "\n" +
        adminCommands + "\n\n" +
        get_text('quick_check_tip', lang) + "\n\n" +
        "🔧 *Support:*\nFor technical issues, contact @nkka404";

    await sendMessage(chatId, helpText);
}

export async function handleRequestCommand(chatId, messageText, username, userId, env) {
    const lang = await get_user_language(chatId, env);

    const command_prefix = '/request';
    const messageContent = messageText.substring(messageText.indexOf(command_prefix) + command_prefix.length).trim();

    if (messageContent.length === 0) {
        await sendMessage(chatId, get_text('request_usage', lang));
        return;
    }

    let adminMessage = "🚨 *NEW USER REQUEST* 🚨\n\n";
    const safeUsername = username ? `@${username.replace(/_/g, '\\_')}` : "No Username";
    adminMessage += `👤 *User:* ${safeUsername} (\`${userId}\`)\n`;
    adminMessage += `📝 *Message:* ${messageContent}\n`;
    adminMessage += `🕒 *Time:* ${formatText(get_text('admin_field_time', DEFAULT_LANG), Date.now() / 1000)}`;

    for (const adminId of ADMIN_IDS) {
        await sendMessage(adminId, adminMessage);
    }

    await sendMessage(chatId, get_text('request_admin_sent', lang));
}

export async function handleReply(chatId, params, env) {
    const lang = await get_user_language(chatId, env);
    if (!isAdmin(chatId)) {
        await sendMessage(chatId, get_text('admin_access_denied', lang));
        return;
    }

    if (params.length < 2 || isNaN(parseInt(params[0]))) {
        await sendMessage(chatId, get_text('admin_usage', lang) + " " + get_text('cmd_reply', lang));
        return;
    }

    const targetUserId = parseInt(params[0]);
    const replyMessage = params.slice(1).join(' ');

    const user = await getUserById(targetUserId, env);
    if (!user) {
        await sendMessage(chatId, formatText(get_text('error_user_not_found', lang), targetUserId));
        return;
    }

    const targetLang = user.lang ?? DEFAULT_LANG;
    const messageToUser = get_text('reply_from_admin', targetLang) + `\n\n${replyMessage}\n\n` + get_text('reply_tip', targetLang);
    const sendResult = await sendMessage(targetUserId, messageToUser);

    if (sendResult.success) {
        let confirmMessage = get_text('reply_success_admin', lang) + "\n\n";
        confirmMessage += get_text('admin_to', lang) + ` ${user.first_name}`;
        if (user.username) {
            confirmMessage += ` (@${user.username.replace(/_/g, '\\_')})`;
        }
        confirmMessage += ` (\`${targetUserId}\`)\n`;
        confirmMessage += get_text('admin_message_content', lang) + ` ${replyMessage}`;

        await sendMessage(chatId, confirmMessage);
    } else {
        await sendMessage(chatId, get_text('reply_fail_admin', lang));
    }
}

// Import dependencies
import { createTrialAccount, getTrialKey } from '../api.js';
import { isAdmin } from '../database.js';
import { ADMIN_IDS, LANG_EN, LANG_MY } from '../config.js';
