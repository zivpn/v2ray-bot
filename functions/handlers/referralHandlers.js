import { get_text, formatText, sendMessage, sendOrEditMessage, editMessageText, generateRandomKey } from '../utils.js';
import { get_user_language, setUserState, getUserById, setCredits, saveUserRedeemedKey, getUserRedeemedKeys, deleteUserRedeemedKey, awardReferralCreditOnVerify } from '../database.js';
import { createPremiumAccount, deletePremiumAccount } from '../api.js';
import { BOT_USERNAME, CHANNEL_URL, CHANNEL_ID, PREMIUM_CREDIT_PLANS, CREDIT_COST_PER_GB, REFERRAL_REWARD, SERVER_NAMES, PREMIUM_DEFAULT_DAYS, DEFAULT_LANG } from '../config.js';

// =========================================================================
// REFERRAL & CREDIT HANDLERS
// =========================================================================

export async function handleReferral(chatId, userId, messageId = null, env) {
    const lang = await get_user_language(chatId, env);
    const user = await getUserById(userId, env);
    const credits = (user?.credits ?? 0.0).toFixed(1);
    const referredCount = user?.referred_count ?? 0;

    const referralLink = `https://t.me/${BOT_USERNAME}?start=r_${userId}`;
    const referralLinkForDisplay = `\`${referralLink}\``;

    const description = formatText(get_text('referral_desc', lang), REFERRAL_REWARD);

    const message = get_text('menu_referral_title', lang) + "\n" +
                        get_text('welcome_separator', lang) + "\n\n" +
                        description + "\n\n" +
                        get_text('field_your_credits', lang) + ` ${credits}\n` +
                        get_text('field_referred_count', lang) + ` ${referredCount}\n\n` +
                        get_text('field_your_link', lang) + referralLinkForDisplay;

    const keyboard = {
        inline_keyboard: [
            [
                {
                    text: formatText(get_text('button_redeem_5gb', lang), PREMIUM_CREDIT_PLANS[5].cost),
                    callback_data: 'redeem_5gb'
                }
            ],
            [
                {
                    text: formatText(get_text('button_redeem_10gb', lang), PREMIUM_CREDIT_PLANS[10].cost),
                    callback_data: 'redeem_10gb'
                }
            ],
            [
                { text: get_text('button_redeem_custom', lang), callback_data: 'redeem_custom_prompt' }
            ],
            [
                { text: get_text('button_view_my_keys', lang), callback_data: 'view_my_keys_page_1' },
            ],
            [
                { text: get_text('button_credit_history', lang), callback_data: 'show_credit_history' },
                { text: get_text('button_verify_join', lang), callback_data: 'verify_channel_join' }
            ]
        ]
    };

    await sendOrEditMessage(chatId, message, messageId, keyboard);
}

export async function handleCreditHistory(chatId, messageId, env) {
    const lang = await get_user_language(chatId, env);
    const user = await getUserById(chatId, env);
    const history = user?.credit_history ?? [];

    let message = get_text('menu_credit_history_title', lang) + "\n" +
                        get_text('welcome_separator', lang) + "\n\n";

    if (history.length === 0) {
        message += get_text('credit_history_empty', lang);
    } else {
        const displayHistory = history.slice(-10).reverse();

        for (const entry of displayHistory) {
            const operationKey = entry.operation === 'add' ? 'credit_history_entry_add' : 'credit_history_entry_deduct';

            let sourceText = entry.source;
            if (entry.source.startsWith('Redeem')) {
                const gbMatch = entry.source.match(/Redeem (\d+)GB/);
                const gb = gbMatch ? parseInt(gbMatch[1]) : 0;
                sourceText = formatText(get_text('credit_source_redeem', lang), gb);
            } else if (entry.source === 'Admin Add') {
                sourceText = get_text('credit_source_admin_add', lang);
            } else if (entry.source === 'Admin Deduct') {
                sourceText = get_text('credit_source_admin_deduct', lang);
            }

            message += formatText(get_text(operationKey, lang), entry.amount, sourceText, entry.timestamp) + "\n";
        }
        message += "\n_Showing last " + Math.min(10, history.length) + " transactions._";
    }

    const keyboard = { inline_keyboard: [[
        { text: get_text('button_back', lang), callback_data: 'referral_back' }
    ]]};

    await sendOrEditMessage(chatId, message, messageId, keyboard);
}

export async function handleVerifyJoin(chatId, userId, messageId, env) {
    const lang = await get_user_language(chatId, env);
    const user = await getUserById(userId, env);

    const isMember = await checkChannelMembership(userId, CHANNEL_ID);
    const alreadyVerified = user?.channel_verified ?? false;

    if (isMember) {
        if (!alreadyVerified) {
            const source = "Channel Verification";
            const { success } = await setCredits(userId, 0, 'add', true, source, env);

            const updatedUser = await getUserById(userId, env);
            if (updatedUser.referrer_id && !updatedUser.referrer_credit_paid) {
                await awardReferralCreditOnVerify(userId, env);
            }
        }

        const confirmationMessage = get_text('status_already_joined', lang);
        await sendOrEditMessage(chatId, confirmationMessage, messageId, { inline_keyboard: [[{ text: get_text('button_back', lang), callback_data: 'referral_back' }]] });
    } else {
        const message = get_text('join_channel_prompt', lang);
        const keyboard = {
            inline_keyboard: [
                [
                    { text: get_text('button_channel_link', lang), url: CHANNEL_URL }
                ],
                [
                    { text: get_text('button_verify_join', lang), callback_data: 'verify_channel_join' }
                ],
                [
                    { text: get_text('button_back', lang), callback_data: 'referral_back' }
                ]
            ]
        };
        await sendOrEditMessage(chatId, get_text('status_not_joined', lang) + "\n\n" + message, messageId, keyboard);
    }
}

export async function handleRedeemSelectPanel(chatId, userId, messageId, gbLimit, env) {
    const lang = await get_user_language(chatId, env);
    const user = await getUserById(userId, env);

    const requiredCost = parseFloat((gbLimit * CREDIT_COST_PER_GB).toFixed(1));

    if ((user?.credits ?? 0) < requiredCost) {
        const errorMsg = formatText(get_text('error_insufficient_credits', lang), requiredCost);
        await sendOrEditMessage(chatId, errorMsg, messageId, { inline_keyboard: [[{ text: get_text('button_back', lang), callback_data: 'referral_back' }]] });
        return;
    }

    if (!user?.channel_verified) {
        await sendOrEditMessage(chatId, get_text('error_unverified_redeem', lang), messageId, { inline_keyboard: [[{ text: get_text('button_back', lang), callback_data: 'referral_back' }]] });
        return;
    }

    await setUserState(userId, 'waiting_for_redeem_panel', { gb: gbLimit, cost: requiredCost }, env);

    const message = formatText(get_text('prompt_select_panel', lang), gbLimit);

    const keyboardButtons = [];
    for (const panelId in SERVER_NAMES) {
        const panelName = SERVER_NAMES[panelId];
        keyboardButtons.push([{
            text: formatText(get_text('panel_button_name', lang), panelName),
            callback_data: `redeem_panel_final_${gbLimit}_${requiredCost}_${panelId}`
        }]);
    }

    keyboardButtons.push([{ text: get_text('button_back', lang), callback_data: 'referral_back' }]);

    const keyboard = { inline_keyboard: keyboardButtons };

    await sendOrEditMessage(chatId, message, messageId, keyboard);
}

export async function handleRedeemPanelSelect(chatId, userId, messageId, gbLimit, cost, panel, env) {
    const lang = await get_user_language(chatId, env);

    await setUserState(userId, 'clear', {}, env);

    await editMessageText(chatId, messageId, formatText(get_text('status_redeeming', lang), gbLimit));

    const premiumAccountName = generateRandomKey(12);

    const result = await createPremiumAccount(gbLimit, premiumAccountName, PREMIUM_DEFAULT_DAYS, panel);
    const panelNameDisplay = SERVER_NAMES[panel] ?? `Panel ${panel}`;

    if (result.success) {
        const source = `Redeem ${gbLimit}GB`;
        const { success: creditSuccess } = await setCredits(userId, cost, 'deduct', false, source, env);
        await saveUserRedeemedKey(userId, premiumAccountName, gbLimit, panel, env);

        const data = result.data;

        const message = formatText(get_text('redeem_success_user', lang), gbLimit, panelNameDisplay, cost) + "\n\n" +
                                        get_text('field_redeemed_account', lang) + "\n" +
                                        get_text('field_account_name', lang) + ` \`${premiumAccountName}\`\n` +
                                        get_text('field_data_limit', lang) + ` ${gbLimit} GB\n` +
                                        get_text('field_expiry_days', lang) + ` ${PREMIUM_DEFAULT_DAYS} days\n` +
                                        get_text('field_panel_name', lang) + ` ${panelNameDisplay}\n\n` +
                                        get_text('field_link', lang) + `\`\`\`${data.link}\`\`\`\n\n` +
                                        get_text('field_qr', lang) + `\n${data.qr_code}`;

        const keyboard = { inline_keyboard: [[{ text: get_text('button_back', lang), callback_data: 'referral_back' }]] };
        await sendOrEditMessage(chatId, message, messageId, keyboard);

    } else {
        const errorMessage = get_text('error_creation_failed', lang) + "\n\n" +
                                        get_text('error_prefix', lang) + ` \`${result.error}\`\n\n` +
                                        "_No credits were deducted due to API failure._";
        await sendOrEditMessage(chatId, errorMessage, messageId, { inline_keyboard: [[{ text: get_text('button_back', lang), callback_data: 'referral_back' }]] });
    }
}

export async function handleCustomRedeemPrompt(chatId, userId, messageId, env) {
    const lang = await get_user_language(chatId, env);

    await setUserState(userId, 'waiting_for_custom_gb', { messageId: messageId }, env);

    const message = formatText(get_text('prompt_redeem_custom_gb', lang), CREDIT_COST_PER_GB);

    const keyboard = { inline_keyboard: [[
        { text: get_text('button_back', lang), callback_data: 'referral_back' }
    ]]};

    await sendOrEditMessage(chatId, message, messageId, keyboard);
}

export async function handleCustomGbRedemptionInput(chatId, userId, gbAmountText, messageId, env) {
    const lang = await get_user_language(chatId, env);

    const gbAmount = parseInt(gbAmountText.trim());

    if (isNaN(gbAmount) || gbAmount < 1) {
        await sendMessage(chatId, get_text('error_invalid_gb_amount', lang));
        await handleCustomRedeemPrompt(chatId, userId, messageId, env);
        return;
    }

    const user = await getUserById(userId, env);
    const requiredCost = parseFloat((gbAmount * CREDIT_COST_PER_GB).toFixed(1));

    if ((user?.credits ?? 0) < requiredCost) {
        const errorMsg = formatText(get_text('error_insufficient_credits_custom', lang), gbAmount, requiredCost);
        await sendMessage(chatId, errorMsg);
        await handleCustomRedeemPrompt(chatId, userId, messageId, env);
        return;
    }

    if (!user?.channel_verified) {
        await sendMessage(chatId, get_text('error_unverified_redeem', lang));
        await setUserState(userId, 'clear', {}, env);
        return;
    }

    await handleRedeemSelectPanel(chatId, userId, null, gbAmount, env);
}

export async function handleMyRedeemedKeys(chatId, userId, messageId, page, env) {
    const lang = await get_user_language(chatId, env);
    const allKeys = await getUserRedeemedKeys(userId, env);

    if (allKeys.length === 0) {
        const message = get_text('menu_my_keys_title', lang) + "\n" + get_text('welcome_separator', lang) + "\n\n" + get_text('no_redeemed_keys', lang);
        const keyboard = { inline_keyboard: [[{ text: get_text('button_back', lang), callback_data: 'referral_back' }]] };
        await sendOrEditMessage(chatId, message, messageId, keyboard);
        return;
    }

    const totalKeys = allKeys.length;
    const totalPages = Math.ceil(totalKeys / REDEEMED_KEYS_PER_PAGE);
    page = Math.max(1, Math.min(page, totalPages));
    const offset = (page - 1) * REDEEMED_KEYS_PER_PAGE;

    const sortedKeys = allKeys.sort((a, b) => new Date(b.redeemed_at).getTime() - new Date(a.redeemed_at).getTime());
    const currentPageKeys = sortedKeys.slice(offset, offset + REDEEMED_KEYS_PER_PAGE);

    let message = get_text('menu_my_keys_title', lang) + "\n" +
                        get_text('welcome_separator', lang) + "\n\n" +
                        `*Page ${page}/${totalPages}*\n\n`;

    const keyboardButtons = [];

    currentPageKeys.forEach((keyData, index) => {
        const globalIndex = offset + index + 1;
        const panel = keyData.panel;
        const panelName = SERVER_NAMES[panel] ?? `Panel ${panel}`;

        message += `*${globalIndex}.* ${keyData.gb}GB on ${panelName}\n`;
        message += get_text('field_account_key', lang) + ` \`${keyData.key}\`\n`;
        message += get_text('field_key_date', lang) + ` ${keyData.redeemed_at}\n\n`;

        const keySnippet = keyData.key.length > 10 ? keyData.key.substring(0, 6) + '...' + keyData.key.slice(-4) : keyData.key;
        const deleteButtonText = formatText(get_text('button_delete_key', lang), keySnippet);

        keyboardButtons.push([{
            text: deleteButtonText,
            callback_data: `key_delete_confirm_${keyData.key}_${panel}`
        }]);
    });

    const navRow = [];
    if (page > 1) {
        navRow.push({ text: get_text('nav_key_prev', lang), callback_data: `view_my_keys_page_${page - 1}` });
    }
    if (page < totalPages) {
        navRow.push({ text: get_text('nav_key_next', lang), callback_data: `view_my_keys_page_${page + 1}` });
    }
    if (navRow.length > 0) {
        keyboardButtons.push(navRow);
    }

    keyboardButtons.push([{ text: get_text('button_back', lang), callback_data: 'referral_back' }]);

    const keyboard = { inline_keyboard: keyboardButtons };

    await sendOrEditMessage(chatId, message, messageId, keyboard);
}

export async function handleKeyDeleteConfirm(chatId, userId, messageId, key, panel, env) {
    const lang = await get_user_language(chatId, env);
    const keys = await getUserRedeemedKeys(userId, env);
    const keyData = keys.find(k => k.key === key && String(k.panel) === String(panel));

    if (!keyData) {
        await sendOrEditMessage(chatId, get_text('error_key_not_found', lang), messageId, { inline_keyboard: [[{ text: get_text('button_back', lang), callback_data: 'view_my_keys_page_1' }]] });
        return;
    }

    const panelName = SERVER_NAMES[panel] ?? `Panel ${panel}`;

    const message = formatText(get_text('confirm_delete_key', lang), key, panelName);

    const keyboard = {
        inline_keyboard: [
            [
                { text: `✅ Yes, Delete`, callback_data: `key_delete_final_${key}_${panel}` },
                { text: `❌ Cancel`, callback_data: 'view_my_keys_page_1' }
            ]
        ]
    };

    await sendOrEditMessage(chatId, message, messageId, keyboard);
}

export async function handleKeyDeleteFinal(chatId, userId, messageId, key, panel, env) {
    const lang = await get_user_language(chatId, env);
    await editMessageText(chatId, messageId, `🔄 *Deleting key* \`${key}\` *from Panel ${panel}...*`);

    const deleteResult = await deletePremiumAccount(key, panel);

    if (deleteResult.success) {
        await deleteUserRedeemedKey(userId, key, env);

        const panelName = SERVER_NAMES[panel] ?? `Panel ${panel}`;
        const message = formatText(get_text('key_deleted_success', lang), key, panelName);
        await sendOrEditMessage(chatId, message, messageId, { inline_keyboard: [[{ text: get_text('button_back', lang), callback_data: 'view_my_keys_page_1' }]] });
    } else {
        const errorMessage = formatText(get_text('key_delete_fail', lang), key, deleteResult.error);
        await sendOrEditMessage(chatId, errorMessage, messageId, { inline_keyboard: [[{ text: get_text('button_back', lang), callback_data: 'view_my_keys_page_1' }]] });
    }
}

// Import dependencies
import { checkChannelMembership } from '../utils.js';
import { REDEEMED_KEYS_PER_PAGE } from '../config.js';
