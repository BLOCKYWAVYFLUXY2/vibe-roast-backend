import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';
import crypto from 'crypto';

const BOT_TOKEN = process.env.BOT_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const groq = new Groq({ apiKey: GROQ_API_KEY });

const fallbackRoasts = [
  "Yo {name}, your vibe is so cold even the penguins said 'damn bro chill' 🥶",
  // ... (your old 10 roasts here - kept as fallback)
  "{name} out here serving main character energy with a side of ice"
];

function validateInitData(initData, botToken) {
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) return false;

    urlParams.delete('hash');
    const dataCheckArr = Array.from(urlParams.entries())
      .map(([key, value]) => `${key}=${value}`)
      .sort()
      .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckArr).digest('hex');

    const authDate = parseInt(urlParams.get('auth_date') || '0');
    if (Date.now() / 1000 - authDate > 86400) return false;

    return computedHash === hash;
  } catch (e) { return false; }
}

async function generateRoast(name) {
  if (!GROQ_API_KEY) {
    // fallback if no key yet
    return fallbackRoasts[Math.floor(Math.random() * fallbackRoasts.length)].replace('{name}', name);
  }

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are the ultimate Vibe Roast Master 🥶. Roast the user's vibe in a short, hilarious, savage-but-friendly way. 1-2 sentences max. Always use their name naturally. Add emojis. Keep it light-hearted and fun - never mean."
        },
        {
          role: "user",
          content: `Roast the vibe of ${name} who just opened the Vibe Roast Telegram Mini App. Make it fresh and unique.`
        }
      ],
      model: "llama-3.3-70b-versatile",   // or "llama-3.1-70b-versatile" if you prefer
      temperature: 0.95,
      max_tokens: 120
    });

    return completion.choices[0]?.message?.content?.trim() 
      || `Yo ${name}, your vibe is straight fire but the AI glitched 🥶`;
  } catch (err) {
    console.error("Groq error, using fallback", err);
    return fallbackRoasts[Math.floor(Math.random() * fallbackRoasts.length)].replace('{name}', name);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { init_data } = req.body;

  if (!init_data || !validateInitData(init_data, BOT_TOKEN)) {
    return res.status(403).json({ error: 'Invalid init data' });
  }

  try {
    const params = new URLSearchParams(init_data);
    const user = JSON.parse(params.get('user') || '{}');
    const name = user.first_name || 'legend';
    const userId = String(user.id);

    const roastText = await generateRoast(name);

    const { data: streakData, error } = await supabase.rpc('increment_streak', {
      p_user_id: userId,
      p_first_name: name
    });

    const streak = (error || !streakData) ? 1 : streakData;

    const message = `${roastText}\n\n🔥 Roast streak: ${streak} 🔥\n\nTap again for more roasts 🥶`;

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        chat_id: user.id, 
        text: message,
        parse_mode: 'HTML'
      })
    });

    res.status(200).json({ 
      success: true, 
      roast: roastText, 
      streak 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
}
