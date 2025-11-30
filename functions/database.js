import {
    BOT_USERS_KEY,
    USER_STATE_KEY,
    USER_PREMIUM_KEYS_KEY,
    ADMIN_IDS,
    DEFAULT_LANG,
    REFERRAL_REWARD,
} from './config.js';
import { get_text, formatText, formatTimeMMT, sendMessage } from './utils.js';
import { readKV, updateKV } from './kv.js';

// =========================================================================
// USER/STATE DATABASE FUNCTIONS
// =========================================================================

export async function savePremiumKey(userId, key, env) {
    const userKey = String(userId);
    await updateKV(BOT_USERS_KEY, (users) => {
        if (users[userKey]) {
            users[userKey].premium_key = key;
            users[userKey].premium_issue_date = formatTimeMMT(Date.now() / 1000);
        }
        return users;
    }, env);
}

export async function saveUserRedeemedKey(userId, key, gbLimit, panel, env) {
    const userKey = String(userId);
    const now = formatTimeMMT(Date.now() / 1000);

    const success = await updateKV(USER_PREMIUM_KEYS_KEY, (keysData) => {
        if (!keysData[userKey]) {
            keysData[userKey] = [];
        }
        keysData[userKey].push({
            key: key,
            gb: gbLimit,
            panel: panel,
            redeemed_at: now
        });
        return keysData;
    }, env);
    return success;
}

export async function getUserRedeemedKeys(userId, env) {
    const keysData = await readKV(USER_PREMIUM_KEYS_KEY, env);
    return keysData[String(userId)] ?? [];
}

export async function deleteUserRedeemedKey(userId, key, env) {
    const userKey = String(userId);
    let deleted = false;

    const success = await updateKV(USER_PREMIUM_KEYS_KEY, (keysData) => {
        if (keysData[userKey]) {
            const initialLength = keysData[userKey].length;
            keysData[userKey] = keysData[userKey].filter(k => k.key !== key);
            if (keysData[userKey].length < initialLength) {
                deleted = true;
            }
        }
        return keysData;
    }, env);

    return { success: success, deleted: deleted };
}

export async function saveUser(userId, username, firstName, lastName = '', lang = null, referrerId = null, env) {
    const userKey = String(userId);
    const now = formatTimeMMT(Date.now() / 1000);

    await updateKV(BOT_USERS_KEY, (users) => {
        if (!users[userKey]) {
            users[userKey] = {
                user_id: userId,
                username: username,
                first_name: firstName,
                last_name: lastName,
                joined_at: now,
                last_active: now,
                lang: lang ?? DEFAULT_LANG,
                is_banned: false,
                credits: 0.0,
                referred_count: 0,
                credit_history: [],
                referrer_id: referrerId,
                channel_verified: false,
                referrer_credit_paid: false,
            };
        } else {
            users[userKey].last_active = now;
            users[userKey].username = username;
            users[userKey].first_name = firstName;
            users[userKey].last_name = lastName ?? users[userKey].last_name;
            if (lang !== null) {
                users[userKey].lang = lang;
            }
            if (referrerId && !users[userKey].referrer_id && String(referrerId) !== String(userId)) {
                users[userKey].referrer_id = referrerId;
            }
            if (users[userKey].is_banned === undefined) { users[userKey].is_banned = false; }
            if (users[userKey].credits === undefined) { users[userKey].credits = 0.0; }
            if (users[userKey].referred_count === undefined) { users[userKey].referred_count = 0; }
            if (users[userKey].credit_history === undefined) { users[userKey].credit_history = []; }
            if (users[userKey].referrer_credit_paid === undefined) { users[userKey].referrer_credit_paid = false; }
            if (users[userKey].channel_verified === undefined) { users[userKey].channel_verified = false; }
        }
        return users;
    }, env);
}

export async function setCredits(userId, amount, operation = 'add', verified = false, source = 'Manual', env) {
    const userKey = String(userId);
    let newCredit = null;

    const success = await updateKV(BOT_USERS_KEY, (users) => {
        if (users[userKey]) {
            let currentCredits = users[userKey].credits ?? 0.0;
            const now = formatTimeMMT(Date.now() / 1000);

            let amountChanged = false;

            if (operation === 'add') {
                currentCredits += amount;
                amountChanged = amount > 0;
            } else if (operation === 'deduct') {
                currentCredits -= amount;
                amountChanged = amount > 0;
            }

            const historyEntry = {
                amount: amount,
                operation: operation,
                source: source,
                timestamp: now
            };

            if (amountChanged || verified) {
                if (users[userKey].credit_history) {
                    users[userKey].credit_history.push(historyEntry);
                } else {
                    users[userKey].credit_history = [historyEntry];
                }
            }

            newCredit = parseFloat(currentCredits.toFixed(1));
            users[userKey].credits = newCredit;

            if (verified) {
                users[userKey].channel_verified = true;
            }
        }
        return users;
    }, env);
    return { success, newCredit };
}

export function cleanReferrerId(referrerId) {
    if (!referrerId) return null;
    let cleanId = String(referrerId);
    if (cleanId.startsWith('r_')) {
        cleanId = cleanId.substring(2);
    }
    const finalId = parseInt(cleanId);
    return isNaN(finalId) ? null : finalId;
}

export async function awardReferralCreditOnVerify(referredUserId, env) {
    const referredUser = await getUserById(referredUserId, env);

    if (!referredUser || referredUser.referrer_credit_paid) {
        return false;
    }

    const finalReferrerId = cleanReferrerId(referredUser.referrer_id);

    if (!finalReferrerId || String(finalReferrerId) === String(referredUserId)) {
        return false;
    }

    const referrer = await getUserById(finalReferrerId, env);
    if (!referrer) {
        return false;
    }

    const referrerLang = referrer.lang ?? DEFAULT_LANG;
    const referredNameDisplay = referredUser.first_name;
    const source = formatText(get_text('credit_source_referral', referrerLang), `[${referredNameDisplay}](tg://user?id=${referredUserId})`);

    const { success: creditSuccess } = await setCredits(finalReferrerId, REFERRAL_REWARD, 'add', false, source, env);

    await updateKV(BOT_USERS_KEY, (users) => {
        const userKey = String(referredUserId);
        const referrerKey = String(finalReferrerId);

        if (users[userKey]) {
            users[userKey].referrer_credit_paid = true;
        }

        if (users[referrerKey]) {
            users[referrerKey].referred_count = (users[referrerKey].referred_count ?? 0) + 1;
        }

        return users;
    }, env);

    if (creditSuccess) {
        const rewardMsg = formatText(get_text('status_credit_rewarded_referrer', referrerLang), REFERRAL_REWARD, referredNameDisplay) +
                             `\n_Referred ID: \`${referredUserId}\`_`;
        await sendMessage(finalReferrerId, rewardMsg);
    }

    return creditSuccess;
}

export async function setUserLanguage(userId, lang, env) {
    const user = await getUserById(userId, env);
    await saveUser(userId, user?.username ?? '', user?.first_name ?? '', user?.last_name ?? '', lang, null, env);
}

export async function getUserStats(env) {
    const users = await readKV(BOT_USERS_KEY, env);
    const userList = Object.values(users);

    userList.sort((a, b) => {
        const timeA = new Date(a.last_active ?? a.joined_at ?? '1970-01-01').getTime();
        const timeB = new Date(b.last_active ?? b.joined_at ?? '1970-01-01').getTime();
        return timeB - timeA;
    });

    return {
        total_users: userList.length,
        users: userList
    };
}

export function getUserActivityStats(users) {
    const now = Date.now() / 1000;
    const dayAgo = now - (24 * 3600);
    const weekAgo = now - (7 * 24 * 3600);
    const monthAgo = now - (30 * 24 * 3600);
    const yearAgo = now - (365 * 24 * 3600);

    const stats = { day: 0, week: 0, month: 0, year: 0, total: users.length };

    for (const user of users) {
        const lastActiveTimestamp = new Date(user.last_active ?? user.joined_at ?? '1970-01-01').getTime() / 1000;
        if (lastActiveTimestamp >= dayAgo) { stats.day++; }
        if (lastActiveTimestamp >= weekAgo) { stats.week++; }
        if (lastActiveTimestamp >= monthAgo) { stats.month++; }
        if (lastActiveTimestamp >= yearAgo) { stats.year++; }
    }
    stats.year = stats.total;
    return stats;
}

export async function getUserById(userId, env) {
    const users = await readKV(BOT_USERS_KEY, env);
    return users[String(userId)] ?? null;
}

export async function getUserByUsername(username, env) {
    username = username.startsWith('@') ? username.substring(1) : username;
    const users = await readKV(BOT_USERS_KEY, env);

    for (const key in users) {
        const user = users[key];
        if (user.username && user.username.toLowerCase() === username.toLowerCase()) {
            return user;
        }
    }
    return null;
}

export async function getUserByCriteria(criteria, env) {
    if (!isNaN(parseInt(criteria)) && String(parseInt(criteria)) === criteria) {
        return getUserById(parseInt(criteria), env);
    }
    if (/^@?\w+$/.test(criteria)) {
        return getUserByUsername(criteria, env);
    }
    return null;
}

export async function get_user_language(userId, env) {
    const user = await getUserById(userId, env);
    return user?.lang ?? DEFAULT_LANG;
}

export async function isUserBanned(userId, env) {
    const user = await getUserById(userId, env);
    return user?.is_banned ?? false;
}

export function isAdmin(userId) {
    return ADMIN_IDS.includes(userId);
}

export async function setBanStatus(userId, status, env) {
    const userKey = String(userId);
    return updateKV(BOT_USERS_KEY, (users) => {
        if (users[userKey]) {
            users[userKey].is_banned = status;
        }
        return users;
    }, env);
}

export async function getUserState(userId, env) {
    const states = await readKV(USER_STATE_KEY, env);
    return states[String(userId)] ?? null;
}

export async function setUserState(userId, state, data = {}, env) {
    const userKey = String(userId);
    await updateKV(USER_STATE_KEY, (states) => {
        if (state === 'clear') {
            delete states[userKey];
        } else {
            states[userKey] = {
                state: state,
                data: data,
                timestamp: Math.floor(Date.now() / 1000)
            };
        }
        return states;
    }, env);
}
