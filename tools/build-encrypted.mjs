import { webcrypto as crypto } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const [,, srcPath, outPath, passphrase] = process.argv;
if (!srcPath || !outPath || !passphrase) {
  console.error('usage: node build-encrypted.mjs <src.html> <out/index.html> <passphrase>');
  process.exit(1);
}

const inner = readFileSync(srcPath, 'utf8');
const fullDoc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
${inner}
</body>
</html>`;

const enc = new TextEncoder();
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const ITERATIONS = 600000;

const baseKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
  baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
);
const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(fullDoc)));

const b64 = (u8) => Buffer.from(u8).toString('base64');

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Scotland &amp; London · Private Itinerary</title>
<style>
  :root {
    --paper: #F1F1EC; --card: #FBFBF8; --ink: #22302A; --muted: #647069;
    --line: #D8DAD2; --pine: #2E5945; --err: #A14E33;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --paper: #151C18; --card: #1D2620; --ink: #E4E8E2; --muted: #9AA69E;
      --line: #35403A; --pine: #8FBCA6; --err: #D5967B;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: var(--paper); color: var(--ink); padding: 24px;
    font-family: "Seravek", "Avenir Next", "Gill Sans", "Segoe UI", system-ui, sans-serif;
  }
  .gate {
    background: var(--card); border: 1px solid var(--line); border-top: 3px solid var(--pine);
    border-radius: 10px; padding: 36px 32px; max-width: 380px; width: 100%; text-align: center;
  }
  .eyebrow {
    text-transform: uppercase; letter-spacing: 0.14em; font-size: 0.7rem; font-weight: 600; color: var(--pine);
  }
  h1 { font-family: "Didot", "Bodoni 72", Georgia, serif; font-weight: 400; font-size: 1.9rem; margin: 10px 0 4px; }
  p { color: var(--muted); font-size: 0.9rem; margin: 0 0 20px; }
  input {
    width: 100%; padding: 11px 14px; font-size: 1rem; border: 1px solid var(--line);
    border-radius: 6px; background: var(--paper); color: var(--ink); text-align: center;
  }
  input:focus { outline: 2px solid var(--pine); outline-offset: 1px; border-color: var(--pine); }
  button {
    margin-top: 12px; width: 100%; padding: 11px; font-size: 0.95rem; font-weight: 600;
    border: none; border-radius: 6px; background: var(--pine); cursor: pointer;
    color: #FBFBF8;
  }
  @media (prefers-color-scheme: dark) { button { color: #151C18; } }
  button:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  button[disabled] { opacity: 0.6; cursor: wait; }
  .msg { min-height: 1.2em; font-size: 0.85rem; margin-top: 12px; }
  .msg.err { color: var(--err); }
</style>
</head>
<body>
<form class="gate" id="gate">
  <div class="eyebrow">Private itinerary</div>
  <h1>Scotland &amp; London</h1>
  <p>6–13 September 2026 · Enter the passphrase you were given to open the itinerary.</p>
  <input type="password" id="pass" autocomplete="off" autofocus aria-label="Passphrase" placeholder="passphrase">
  <button type="submit" id="go">Open itinerary</button>
  <div class="msg" id="msg" role="status"></div>
</form>
<script>
const SALT = "${b64(salt)}", IV = "${b64(iv)}", DATA = "${b64(ciphertext)}", ITER = ${ITERATIONS};
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function unlock(pass) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromB64(SALT), iterations: ITER, hash: 'SHA-256' },
    baseKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(IV) }, key, fromB64(DATA));
  return new TextDecoder().decode(plain);
}
const form = document.getElementById('gate'), msg = document.getElementById('msg'),
      input = document.getElementById('pass'), btn = document.getElementById('go');
async function attempt(pass, silent) {
  btn.disabled = true;
  msg.textContent = 'Unlocking…'; msg.className = 'msg';
  try {
    const html = await unlock(pass);
    try { sessionStorage.setItem('trip-pass', pass); } catch (e) {}
    document.open(); document.write(html); document.close();
  } catch (e) {
    btn.disabled = false;
    msg.textContent = silent ? '' : "That passphrase didn't work — check it and try again.";
    msg.className = 'msg err';
    if (!silent) input.select();
  }
}
form.addEventListener('submit', e => { e.preventDefault(); attempt(input.value.trim(), false); });
try {
  const saved = sessionStorage.getItem('trip-pass');
  if (saved) attempt(saved, true);
} catch (e) {}
</script>
</body>
</html>`;

mkdirSync(outPath.replace(/\/[^/]+$/, ''), { recursive: true });
writeFileSync(outPath, page);
console.log('written', outPath, '| payload', (ciphertext.length / 1024).toFixed(1) + 'KB');
