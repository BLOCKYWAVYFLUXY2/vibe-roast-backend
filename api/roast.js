import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const BOT_TOKEN = process.env.BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const roasts = [
  "Yo {name}, your vibe is so cold even the penguins said 'damn bro chill' 🥶",
  "{name} out here moving like a main character in a movie nobody asked for 😂",
  "Bro {name} your energy is 100% iced coffee with extra ice 🧊",
  "{name}, your aura is so powerful my phone just went into power-saving mode",
  "Respect {name} — even my WiFi signal got intimidated when you opened the app",
  "{name} walking in like the final boss of chill 🥶",
  "Your vibe so clean even my laundry said 'I can't compete'",
  "{name}, you're not late to the party... the party is late to YOU",
  "Bro your chill level just broke the thermometer 🧪",
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

    let roastText = roasts[Math.floor(Math.random() * roasts.length)].replace('{name}', name);

    const { data: streakData, error } = await supabase.rpc('increment_streak', {
      p_user_id: userId,
      p_first_name: name
    });

    const streak = error ? 1 : streakData;

    const message = `${roastText}\n\n🔥 Roast streak: ${streak} 🔥\n\nTap again for more roasts 🥶`;

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: user.id, text: message })
    });

    res.status(200).json({ success: true, roast: roastText, streak });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
}
