// V2Ray Telegram Bot Configuration and Localization

// =========================================================================
// CONFIGURATION
// =========================================================================

// Global Keys for KV Storage
export const BOT_USERS_KEY = 'bot_users';
export const USER_STATE_KEY = 'user_state';
export const USER_PREMIUM_KEYS_KEY = 'user_premium_keys';

// Timezone handling for Asia/Yangon (UTC + 6 hours 30 minutes)
export const MMT_OFFSET_SECONDS = 6.5 * 3600;

// Bot Configuration (UPDATED WITH NEW CREDENTIALS)
export const BOT_TOKEN = '8544055287:AAGMqVU-6FkxzbDSRIp7rIeJCOIO8NtvXFo';
export const BOT_USERNAME = 'V2RayChecker404Bot';
export const API_URL = 'https://api.telegram.org/bot' + BOT_TOKEN + '/';

// Admin Configuration (UPDATED WITH NEW ID)
export const ADMIN_IDS = [7240495054];
export const OWNER_ID = 7240495054;
export const OWNER_URL = 'tg://user?id=' + OWNER_ID;

// V2Ray API Configuration
export const V2RAY_API_URL = 'https://channel404.serv00.net/api.php';

// Channel URL and ID (UPDATED WITH NEW CHAT ID)
export const CHANNEL_URL = 'https://t.me/premium_channel_404';
export const CHANNEL_ID = '-5090710008';

// Server Configuration
export const SERVER_NAMES = {
    1: '🇸🇬 Singapore #1',
    2: '🇸🇬 Singapore #2',
    // Add more panels as needed
};
export const PREMIUM_DEFAULT_PANEL = 1; // Default panel if not specified for credit redemption

// Stats configuration
export const USERS_PER_PAGE = 9;
export const ONLINE_USERS_PER_PAGE = 10;
export const REDEEMED_KEYS_PER_PAGE = 5;
export const BROADCAST_BATCH_SIZE = 10;
export const BROADCAST_DELAY_MS = 2500; // ⚠️ Delay between batches (2.5 seconds)

// --- PREMIUM PLAN CONFIGURATION ---
export const PREMIUM_PLANS = {
    150: { gb: 150, price: '4,000 MMK' },
    250: { gb: 250, price: '5,500 MMK' },
    500: { gb: 500, price: '7,500 MMK' },
};
export const PREMIUM_DEFAULT_DAYS = 30;
export const PREMIUM_PANEL_ID = 2; // Kept for legacy non-configurable premium

// --- REFERRAL & CREDIT CONFIGURATION ---
export const PREMIUM_CREDIT_PLANS = {
    5: { gb: 5, cost: 0.5 },
    10: { gb: 10, cost: 1.0 }
};
export const CREDIT_COST_PER_GB = 0.1;
export const REFERRAL_REWARD = 0.5; // 0.5 Credits awarded to REFERRER

// --- PAYMENT METHOD CONFIGURATION ---
export const PAYMENT_METHODS = {
    'wavepay': { name_en: 'Wave Pay', name_my: 'Wave Pay', account_name: 'Nyein Ko Ko Aung', number: '09651600998' },
    'kbzpay': { name_en: 'KBZ Pay', name_my: 'KBZ Pay', account_name: 'Nyein KoKoAung', number: '09651600998' },
    'ayapay': { name_en: 'AYA Pay', name_my: 'AYA Pay', account_name: 'Nyein Ko Ko Aung', number: '09651600998' },
};

// --- Localization Constants ---
export const LANG_MY = 'my';
export const LANG_EN = 'en';
export const DEFAULT_LANG = LANG_EN;

// =========================================================================
// LOCALIZATION DATA
// =========================================================================

export const MESSAGES = {
    // --- General / Welcome ---
    'welcome_start_line1': { [LANG_EN]: "Hi %s! Welcome to this bot", [LANG_MY]: "မင်္ဂလာပါ %s! ဤဘော့သို့ ကြိုဆိုပါတယ်" },
    'welcome_separator': { [LANG_EN]: "━━━━━━━━━━━━━━━━━━━━━━", [LANG_MY]: "━━━━━━━━━━━━━━━━━━━━━━" },
    'welcome_bot_desc': { [LANG_EN]: "V2Ray Manager Bot is your reliable V2Ray account management assistant!\nUse /premium to view our plans.", [LANG_MY]: "V2Ray Manager Bot သည် သင်၏ ယုံကြည်စိတ်ချရသော V2Ray အကောင့် စီမံခန့်ခွဲမှု လက်ထောက်ဖြစ်ပါသည်။\nPlan များကို ကြည့်ရန် /premium ကို အသုံးပြုပါ။" },
    'welcome_join_prompt': {
        [LANG_EN]: `Don't forget to [join](${CHANNEL_URL}) for updates!`,
        [LANG_MY]: `သတင်းအချက်အလက်များအတွက် [join](${CHANNEL_URL}) ထားဖို့ မမေ့ပါနဲ့!`
    },
    'welcome_invited_by': { [LANG_EN]: "\n\n🤝 You were invited by %s!", [LANG_MY]: "\n\n🤝 သင့်ကို %s မှ ဖိတ်ခေါ်ထားပါတယ်!" },

    // --- Command Descriptions (Main Menu) ---
    'available_commands': { [LANG_EN]: "📋 *Available Commands:*", [LANG_MY]: "📋 *အသုံးပြုနိုင်သည့် Command များ*:" },
    'quick_check_tip': { [LANG_EN]: "⚡ *Quick Check:* Just send your V2Ray config to check account status!", [LANG_MY]: "⚡ *အမြန်စစ်ဆေးခြင်း:* သင်၏ V2Ray config ကို ပို့ရုံဖြင့် အကောင့်အခြေအနေကို စစ်ဆေးနိုင်ပါသည်။" },
    'powered_by': { [LANG_EN]: "⚡ Powered by Channel 404 Team", [LANG_MY]: "⚡ Channel 404 Team မှ ပံ့ပိုးသည်" },
    
    // ... (ကျန်တဲ့ localization messages တွေ အားလုံး ဒီအတိုင်းဆက်ထားမယ်)
    // ဒီနေရာမှာ messages တွေအားလုံး ရှိနေမယ်၊ အကိုချုံ့မပို့တော့ဘူး
};

// Default export for compatibility
export default {
    BOT_TOKEN,
    BOT_USERNAME,
    ADMIN_IDS,
    OWNER_ID,
    CHANNEL_ID,
    CHANNEL_URL,
    V2RAY_API_URL,
    MESSAGES,
    LANG_EN,
    LANG_MY,
    DEFAULT_LANG
};
