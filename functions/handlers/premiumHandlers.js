import { get_text, formatText, sendMessage, sendOrEditMessage, editMessageText, generateRandomKey } from '../utils.js';
import { get_user_language, setUserState, getUserById, savePremiumKey, isAdmin } from '../database.js';
import { createPremiumAccount } from '../api.js';
import { PREMIUM_PLANS, PAYMENT_METHODS, ADMIN_IDS, DEFAULT_LANG, SERVER_NAMES, PREMIUM_DEFAULT_DAYS, PREMIUM_PANEL_ID } from '../config.js';

// =========================================================================
// PREMIUM & PAYMENT HANDLERS
// =========================================================================

export async function handlePremium(chatId, messageId = null, isCallback = false, env) {
    const lang = await get_user_language(chatId, env);
    await setUserState(chatId, 'clear', {}, env);

    const message = get_text('menu_premium_title', lang) + "\n" +
                        get_text('welcome_separator', lang) + "\n" +
                        get_text('premium_select_plan', lang);

    const keyboard = { inline_keyboard: [] };

    let row = [];
    for (const gb in PREMIUM_PLANS) {
        const plan = PREMIUM_PLANS[gb];
        const buttonText = formatText(get_text('button_plan', lang), plan.gb, plan.price);
        row.push({ text: buttonText, callback_data: 'premium_select_' + gb });

        if (row.length === 1) {
            keyboard.inline_keyboard.push(row);
            row = [];
        }
    }

    if (row.length > 0) {
        keyboard.inline_keyboard.push(row);
    }

    keyboard.inline_keyboard.push([
        { text: get_text('button_view_plans', lang), callback_data: 'menu_premium_desc' }
    ]);

    if (isCallback) {
        await sendOrEditMessage(chatId, message, messageId, keyboard);
    } else {
        await sendMessage(chatId, message, keyboard);
    }
}

export async function handlePremiumDescription(chatId, messageId, env) {
    const lang = await get_user_language(chatId, env);
    const message = get_text('menu_premium_desc_title', lang) + "\n" +
                        get_text('welcome_separator', lang) + "\n" +
                        get_text('menu_premium_desc_content', lang);

    const keyboard = { inline_keyboard: [[
        { text: get_text('button_back', lang), callback_data: 'menu_premium' }
    ]]};

    await sendOrEditMessage(chatId, message, messageId, keyboard);
}

export async function handlePremiumSelect(chatId, userId, messageId, gbLimit, env) {
    const lang = await get_user_language(chatId, env);

    const plan = PREMIUM_PLANS[gbLimit];

    if (!plan) {
        await sendOrEditMessage(chatId, get_text('error_plan_not_found', lang), messageId, { inline_keyboard: [[{ text: get_text('button_back', lang), callback_data: 'menu_premium' }]] });
        return;
    }

    const currentState = await getUserState(userId, env);
    if (currentState?.state === 'waiting_for_txid') {
        await sendOrEditMessage(chatId, formatText(get_text('error_already_waiting', lang), currentState.data.gb), messageId, { inline_keyboard: [[{ text: get_text('button_back', lang), callback_data: 'menu_premium' }]] });
        return;
    }

    await setUserState(userId, 'waiting_for_method', { gb: gbLimit, price: plan.price }, env);

    const message = formatText(get_text('prompt_select_method', lang), plan.gb, plan.price);

    const keyboard = {
        inline_keyboard: [
            [
                { text: get_text('button_wavepay', lang), callback_data: `method_select_${gbLimit}_wavepay` },
            ],
            [
                { text: get_text('button_kbzpay', lang), callback_data: `method_select_${gbLimit}_kbzpay` },
            ],
            [
                { text: get_text('button_ayapay', lang), callback_data: `method_select_${gbLimit}_ayapay` },
            ],
            [{ text: get_text('button_back', lang), callback_data: 'menu_premium' }]
        ]
    };

    await sendOrEditMessage(chatId, message, messageId, keyboard);
}

export async function handlePaymentMethodSelect(chatId, userId, messageId, gbLimit, methodKey, env) {
    const lang = await get_user_language(chatId, env);

    const plan = PREMIUM_PLANS[gbLimit];
    const method = PAYMENT_METHODS[methodKey];

    if (!plan || !method) {
        await sendOrEditMessage(chatId, get_text('error_plan_not_found', lang), messageId, { inline_keyboard: [[{ text: get_text('button_back', lang), callback_data: 'menu_premium' }]] });
        return;
    }

    await setUserState(userId, 'waiting_for_txid', {
        gb: gbLimit,
        price: plan.price,
        method: methodKey,
        method_name_en: method.name_en,
        account_name: method.account_name,
        account_number: method.number
    }, env);

    const methodName = method[`name_${lang}`];
    const accountName = method.account_name;
    const accountNumber = method.number;

    const paymentDetails = formatText(
        get_text('payment_instructions_detail', lang),
        methodName,
        accountName,
        accountNumber
    );

    const message = formatText(get_text('plan_details_title', lang), plan.gb, plan.price) + "\n\n" +
                        get_text('payment_instructions_title', lang) + "\n" +
                        get_text('welcome_separator', lang) + "\n" +
                        paymentDetails + "\n\n" +
                        get_text('prompt_txid', lang);

    const keyboard = { inline_keyboard: [[
        { text: get_text('button_back', lang), callback_data: 'menu_premium' }
    ]]};

    await sendOrEditMessage(chatId, message, messageId, keyboard);
}

export async function handleTxidSubmission(chatId, userId, txId, state, username, firstName, lastName, env) {
    const lang = await get_user_language(chatId, env);
    const planData = state.data;
    const gbLimit = planData.gb;
    const price = planData.price;
    const methodName = planData.method_name_en ?? 'Unknown Method';

    txId = txId.trim();
    txId = txId.replace(/[^\w\d]/g, '');

    if (txId.length < 1) {
        await sendMessage(chatId, get_text('error_no_txid', lang));
        return;
    }

    const userMessage = formatText(get_text('txid_submitted_user', lang), txId);
    await sendMessage(chatId, userMessage);

    await setUserState(userId, 'clear', {}, env);

    const fullName = (firstName + ' ' + (lastName ?? '')).trim();
    const usernameDisplay = username ? `@${username.replace(/_/g, '\\_')}` : "N/A";
    const adminTime = formatText(get_text('admin_field_time', DEFAULT_LANG), Date.now() / 1000);

    const adminMessage = get_text('admin_new_purchase', DEFAULT_LANG) + "\n\n" +
                        get_text('admin_field_method', DEFAULT_LANG) + ` ${methodName}\n` +
                        get_text('admin_field_txid', DEFAULT_LANG) + ` \`${txId}\`\n` +
                        get_text('admin_field_userid', DEFAULT_LANG) + ` \`${userId}\`\n` +
                        get_text('admin_field_time', DEFAULT_LANG) + ` ${adminTime}\n` +
                        get_text('welcome_separator', DEFAULT_LANG) + "\n\n" +
                        `👤 *User:* [${fullName}](tg://user?id=${userId})\n` +
                        `📧 *UserName:* ${usernameDisplay}\n` +
                        `💰 *Plan:* ${gbLimit}GB (${price})\n\n` +
                        `Use \`/approve ${userId} ${gbLimit}\` or \`/reject ${userId}\` to proceed.`;

    const keyboard = {
        inline_keyboard: [
            [
                { text: formatText(get_text('admin_approve_btn', DEFAULT_LANG), gbLimit), callback_data: `admin_approve_${userId}_${gbLimit}` },
            ],
            [
                { text: get_text('admin_reject_btn', DEFAULT_LANG), callback_data: `admin_reject_${userId}` }
            ]
        ]
    };

    for (const adminId of ADMIN_IDS) {
        await sendMessage(adminId, adminMessage, keyboard);
    }
}

export async function handleAdminApprove(chatId, targetUserId, gbLimit, messageId, env) {
    const adminLang = await get_user_language(chatId, env);

    if (!isAdmin(chatId)) {
        await sendMessage(chatId, get_text('admin_access_denied', adminLang));
        return;
    }

    const user = await getUserById(targetUserId, env);
    const plan = PREMIUM_PLANS[gbLimit];

    if (!user || (!plan && gbLimit !== PREMIUM_CREDIT_PLANS[5]?.gb && gbLimit !== PREMIUM_CREDIT_PLANS[10]?.gb && gbLimit < 100)) {
        await sendMessage(chatId, get_text('error_admin_approval_failed', adminLang) + "\nInvalid User ID or Plan.");
        if (messageId) { await editMessageText(chatId, messageId, "*✅ Approved (Error: User/Plan not found)*", { inline_keyboard: [] }); }
        return;
    }

    const premiumAccountName = generateRandomKey(12);

    const startingMessage = `🔄 *Creating Premium Account:* \`${premiumAccountName}\` for user \`${targetUserId}\`...`;
    const initialMsg = await sendMessage(chatId, startingMessage);
    const loadingMessageId = messageId ?? initialMsg.data?.result?.message_id;
    if (messageId && loadingMessageId !== messageId) {
        await editMessageText(chatId, messageId, startingMessage, { inline_keyboard: [] });
    }

    const result = await createPremiumAccount(gbLimit, premiumAccountName, PREMIUM_DEFAULT_DAYS, PREMIUM_PANEL_ID);

    if (result.success) {
        await savePremiumKey(targetUserId, premiumAccountName, env);

        const data = result.data;
        const userLang = user.lang ?? DEFAULT_LANG;

        const panelNameDisplay = SERVER_NAMES[PREMIUM_PANEL_ID] ?? `Panel ${PREMIUM_PANEL_ID}`;

        const messageToUser = formatText(get_text('approval_success_user', userLang), gbLimit) + "\n\n" +
                                        get_text('field_account_name', userLang) + ` \`${premiumAccountName}\`\n` +
                                        get_text('field_email', userLang) + ` \`${data.email}\`\n` +
                                        get_text('field_password', userLang) + ` \`${data.password}\`\n` +
                                        get_text('field_data_limit', userLang) + ` ${gbLimit} GB\n` +
                                        get_text('field_expiry_days', userLang) + ` ${PREMIUM_DEFAULT_DAYS} days\n` +
                                        get_text('field_panel_id', userLang) + ` ${panelNameDisplay}\n\n` +
                                        get_text('field_link', userLang) + `\`\`\`${data.link}\`\`\`\n\n` +
                                        get_text('field_qr', userLang) + `\n${data.qr_code}`;

        await sendMessage(targetUserId, messageToUser);

        const adminConfirm = get_text('create_success_title', adminLang) + "\n\n" +
                                        get_text('field_account_name', adminLang) + ` \`${premiumAccountName}\`\n` +
                                        get_text('field_telegram_id', adminLang) + ` \`${targetUserId}\`\n` +
                                        get_text('field_data_limit', adminLang) + ` ${gbLimit} GB\n` +
                                        get_text('field_panel_id', adminLang) + ` ${panelNameDisplay}`;

        await sendOrEditMessage(chatId, adminConfirm, loadingMessageId);

    } else {
        const errorMessage = get_text('error_admin_create_failed', adminLang) + "\n\n" +
                                        get_text('error_prefix', adminLang) + ` \`${result.error}\` (User: ${targetUserId})`;
        await sendOrEditMessage(chatId, errorMessage, loadingMessageId);
    }
}

export async function handleAdminReject(chatId, targetUserId, messageId, env) {
    const adminLang = await get_user_language(chatId, env);

    if (!isAdmin(chatId)) {
        await sendMessage(chatId, get_text('admin_access_denied', adminLang));
        return;
    }

    const user = await getUserById(targetUserId, env);

    if (!user) {
        await sendMessage(chatId, formatText(get_text('error_user_not_found', adminLang), targetUserId));
        if (messageId) { await editMessageText(chatId, messageId, "*❌ Rejected (Error: User not found)*", { inline_keyboard: [] }); }
        return;
    }

    if (messageId) { await editMessageText(chatId, messageId, `*❌ Rejected: User ${targetUserId}*`, { inline_keyboard: [] }); }

    const userLang = user.lang ?? DEFAULT_LANG;
    const txId = 'N/A';
    const messageToUser = formatText(get_text('approval_rejected_user', userLang), txId);

    await sendMessage(targetUserId, messageToUser);

    const adminConfirm = formatText(get_text('admin_rejection_done', adminLang), targetUserId);
    await sendMessage(chatId, adminConfirm);
}

// Import dependencies
import { PREMIUM_CREDIT_PLANS } from '../config.js';
import { getUserState } from '../database.js';
