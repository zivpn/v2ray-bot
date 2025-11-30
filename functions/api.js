import { V2RAY_API_URL } from './config.js';
import { sendRequest } from './utils.js';

// =========================================================================
// V2RAY API FUNCTIONS
// =========================================================================

export async function createTrialAccount(telegramId) {
    const data = { 'trial': telegramId };
    const response = await sendRequest(V2RAY_API_URL, data);
    if (response.success && (response.data?.success ?? false)) {
        return { success: true, data: response.data.data ?? {} };
    }
    return { success: false, error: response.data?.data?.error ?? 'Unknown error occurred' };
}

export async function getTrialKey(telegramId) {
    const data = { 'trialkey': telegramId };
    const response = await sendRequest(V2RAY_API_URL, data);
    if (response.success && (response.data?.success ?? false)) {
        return { success: true, data: response.data.data ?? {} };
    }
    return { success: false, error: response.data?.data?.error ?? 'Unknown error occurred' };
}

export async function createPremiumAccount(gbLimit, userName, daysLimit, panel) {
    const data = {
        'key': gbLimit,
        'name': userName,
        'exp': daysLimit,
        'panel': panel
    };
    const response = await sendRequest(V2RAY_API_URL, data);
    if (response.success && (response.data?.success ?? false)) {
        return { success: true, data: response.data.data ?? {} };
    }
    return { success: false, error: response.data?.data?.error ?? 'Unknown error occurred' };
}

export async function deletePremiumAccount(userName, panel) {
    const data = { 'delete': userName, 'panel': panel };
    const response = await sendRequest(V2RAY_API_URL, data);
    if (response.success && (response.data?.success ?? false)) {
        return { success: true, data: response.data.data ?? {} };
    }
    return { success: false, error: response.data?.data?.error ?? 'Unknown error occurred' };
}

export async function deleteTrialAccount(telegramId) {
    const data = { 'delete': telegramId };
    const response = await sendRequest(V2RAY_API_URL, data);
    if (response.success && (response.data?.success ?? false)) {
        return { success: true, data: response.data.data ?? {} };
    }
    return { success: false, error: response.data?.data?.error ?? 'Unknown error occurred' };
}

export async function deleteExpiredAccounts(panel = null) {
    const data = { 'delexp': true };
    if (panel !== null) {
        data.panel = panel;
    }
    const response = await sendRequest(V2RAY_API_URL, data);
    if (response.success && (response.data?.success ?? false)) {
        return { success: true, data: response.data.data ?? {} };
    }
    return { success: false, error: response.data?.data?.error ?? 'Unknown error occurred' };
}

export async function checkV2RayAccount(config) {
    const data = { 'config': config };
    const response = await sendRequest(V2RAY_API_URL, data);
    if (response.success && (response.data?.success ?? false)) {
        return { success: true, data: response.data.data ?? {} };
    }
    return { success: false, error: response.data?.data?.error ?? 'Unknown error occurred' };
}

export async function transferAccount(userName, fromPanel, toPanel) {
    const data = { 'transfer': userName, 'from_panel': fromPanel, 'to_panel': toPanel };
    const response = await sendRequest(V2RAY_API_URL, data);
    if (response.success && (response.data?.success ?? false)) {
        return { success: true, data: response.data.data ?? {} };
    }
    return { success: false, error: response.data?.data?.error ?? 'Unknown API error during transfer.' };
}

export async function resetTrafficUsage(userName, panel) {
    const data = { 'reset_traffic': userName, 'panel': panel };
    const response = await sendRequest(V2RAY_API_URL, data);
    if (response.success && (response.data?.success ?? false)) {
        return { success: true, data: response.data.data ?? {} };
    }
    return { success: false, error: response.data?.data?.error ?? 'Unknown API error during reset.' };
}

export async function modifyAccountDetails(userName, panel, gbLimit, daysLimit, newPassword = '') {
    const data = { 'mod': userName, 'panel': panel, 'key': gbLimit, 'exp': daysLimit, 'mod_pass': newPassword };
    const response = await sendRequest(V2RAY_API_URL, data);
    if (response.success && (response.data?.success ?? false)) {
        return { success: true, data: response.data.data ?? {} };
    }
    return { success: false, error: response.data?.data?.error ?? 'Unknown API error during modification.' };
}

export async function bulkCreateAccounts(names, gbLimit, daysLimit, panel) {
    const data = {
        'bulk': names.join(','),
        'key': gbLimit,
        'exp': daysLimit,
        'panel': panel
    };
    const response = await sendRequest(V2RAY_API_URL, data);
    if (response.success && (response.data?.success ?? false)) {
        return { success: true, data: response.data.data ?? { status: 'Bulk creation request processed by API.', names_count: names.length } };
    }
    return { success: false, error: response.data?.data?.error ?? 'API error during bulk create.' };
}

export async function runExpiryWarnings() {
    const data = { 'run_warnings': true };
    const response = await sendRequest(V2RAY_API_URL, data);
    if (response.success && (response.data?.success ?? false)) {
        return { success: true, data: response.data.data ?? {} };
    }
    return { success: false, error: response.data?.data?.error ?? 'Unknown API error during warnings run.' };
}

export async function getOptimalPanel(type = 'premium') {
    const data = { 'optimal': true, 'type': type };
    const response = await sendRequest(V2RAY_API_URL, data);
    if (response.success && (response.data?.success ?? false)) {
        return { success: true, data: response.data.data ?? {} };
    }
    return { success: false, error: response.data?.data?.error ?? 'Unknown API error during optimal panel check.' };
}

export async function getPanelStats() {
    const data = { 'stats': true };
    const response = await sendRequest(V2RAY_API_URL, data);
    if (response.success && (response.data?.success ?? false)) {
        return { success: true, data: response.data.data ?? {} };
    }
    return { success: false, error: response.data?.data?.error ?? 'Error connecting to V2Ray API.' };
}

export async function getOnlineUsers() {
    const data = { 'online': true };
    const response = await sendRequest(V2RAY_API_URL, data);
    if (response.success && (response.data?.success ?? false)) {
        return { success: true, data: response.data.data ?? {} };
    }
    return { success: false, error: response.data?.data?.error ?? 'Unknown error occurred' };
}
