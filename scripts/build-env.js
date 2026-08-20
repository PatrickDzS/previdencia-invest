/**
 * Gera o arquivo supabase-config.js a partir das variáveis de ambiente
 * configuradas no backend (Vercel: Settings -> Environment Variables).
 *
 * Uso:
 *   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... node scripts/build-env.js
 *
 * O arquivo gerado injeta window.SUPABASE_CONFIG no HTML, permitindo que o
 * app conecte automaticamente no banco sem modal de login/UI.
 */
const fs = require('fs');
const path = require('path');

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

function escapeString(v) {
  return v ? v.replace(/\\/g, '\\\\').replace(/'/g, "\\'") : '';
}

const output = `// Gerado automaticamente por scripts/build-env.js - NAO editar manualmente.
// Origem: variaveis de ambiente do backend (Vercel/Supabase).
(function (window) {
  window.SUPABASE_CONFIG = {
    url: '${escapeString(URL)}',
    anonKey: '${escapeString(ANON_KEY)}'
  };
})(typeof window !== 'undefined' ? window : {});
`;

const dest = path.join(__dirname, '..', 'src', 'config', 'supabase-config.js');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, output, 'utf8');

if (URL && ANON_KEY) {
  console.log('supabase-config.js gerado com credenciais do ambiente.');
} else {
  console.warn('ATENCAO: NEXT_PUBLIC_SUPABASE_URL/ANON_KEY nao definidas. O app rodara apenas em modo local (sem nuvem).');
}