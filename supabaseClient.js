// supabaseClient.js
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws'); // Import the dependency
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Crucial Error: Supabase connection parameters undefined inside .env configuration file.');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false
    },
    // FIX: Provide the exact implementation transport layer to the Realtime Engine
    realtime: {
        transport: WebSocket
    }
});

module.exports = supabase;