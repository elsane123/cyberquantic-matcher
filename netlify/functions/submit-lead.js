const https = require('https');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFY_EMAIL  = process.env.NOTIFY_EMAIL  || 'elsane.tiberini@gmail.com';
const FROM_EMAIL    = process.env.FROM_EMAIL    || 'CyberQuantic <onboarding@resend.dev>';
const NOTION_TOKEN  = process.env.NOTION_TOKEN;
const NOTION_DB_ID  = process.env.NOTION_DB_ID;
const MATCHER_URL   = 'https://cyberquantic-matcher.netlify.app';

// ─── HTTP helper ──────────────────────────────────────────────────────────────
function httpReq(method, hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const buf = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = https.request({
      hostname, path, method,
      headers: buf ? { ...headers, 'Content-Length': buf.byteLength } : headers
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    if (buf) req.write(buf);
    req.end();
  });
}

// ─── Resend email ─────────────────────────────────────────────────────────────
async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY) return;
  return httpReq('POST', 'api.resend.com', '/emails',
    { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    { from: FROM_EMAIL, to: [to], subject, html }
  );
}

// ─── Notion: create lead page ─────────────────────────────────────────────────
async function createNotionLead(data) {
  if (!NOTION_TOKEN || !NOTION_DB_ID) return null;
  const { email, firstname, company, role, sector, goal, usecases } = data;

  const properties = {
    'Email':           { title:     [{ text: { content: email || '' } }] },
    'societe':         { rich_text: [{ text: { content: company || '' } }] },
    'use case':        { rich_text: [{ text: { content: (usecases || '').substring(0, 1900) } }] },
    'date signup':     { date: { start: new Date().toISOString().split('T')[0] } },
    'email 2 envoué':  { rich_text: [] },
    'email 3 envoyé':  { rich_text: [] },
  };

  // Select fields — only set if non-empty (Notion auto-creates options)
  if (firstname) properties['prenom']   = { select: { name: firstname.substring(0, 100) } };
  if (role)      properties['role']     = { select: { name: role.substring(0, 100) } };
  if (sector)    properties['secteur']  = { select: { name: sector.substring(0, 100) } };
  if (goal)      properties['objectif'] = { select: { name: goal.substring(0, 100) } };

  const res = await httpReq('POST', 'api.notion.com', '/v1/pages',
    {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    { parent: { database_id: NOTION_DB_ID }, properties }
  );
  return res;
}

// ─── Email 1 template ─────────────────────────────────────────────────────────
function buildEmail1(data) {
  const { firstname, role, sector, goal, usecases } = data;
  const name = firstname || 'là';
  const ucList = (usecases || '').split('||').filter(Boolean).slice(0, 3);
  const ucItems = ucList.map(uc => {
    const [title, desc] = uc.split(':::');
    return `
      <tr>
        <td style="padding:16px;background:#f8faff;border-left:4px solid #4F46E5;border-radius:0 8px 8px 0">
          <strong style="color:#1e293b;font-size:15px">✦ ${title || uc}</strong>
          ${desc ? `<p style="margin:6px 0 0;color:#64748b;font-size:13px;line-height:1.5">${desc}</p>` : ''}
        </td>
      </tr>
      <tr><td style="height:10px"></td></tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <tr><td style="background:linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%);padding:40px 48px;text-align:center">
          <h1 style="margin:0;color:#fff;font-size:28px;font-weight:700">CyberQuantic</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px">Votre rapport IA personnalisé</p>
        </td></tr>
        <tr><td style="padding:40px 48px">
          <p style="margin:0 0 24px;color:#1e293b;font-size:18px;font-weight:600">Bonjour ${name} 👋</p>
          <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.7">
            Merci d'avoir utilisé le <strong>Use Case Matcher CyberQuantic</strong>.
            Voici vos cas d'usage IA sélectionnés parmi <strong>368 références</strong> selon votre profil.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
            <tr>
              ${role   ? `<td style="padding:7px 13px;background:#ede9fe;border-radius:20px;color:#6D28D9;font-size:13px;font-weight:600">${role}</td><td width="8"></td>` : ''}
              ${sector ? `<td style="padding:7px 13px;background:#dbeafe;border-radius:20px;color:#1D4ED8;font-size:13px;font-weight:600">${sector}</td><td width="8"></td>` : ''}
              ${goal   ? `<td style="padding:7px 13px;background:#dcfce7;border-radius:20px;color:#166534;font-size:13px;font-weight:600">${goal}</td>` : ''}
            </tr>
          </table>
          <h2 style="margin:0 0 16px;color:#1e293b;font-size:16px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">🎯 Vos top use cases</h2>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${ucItems || '<tr><td style="color:#64748b;font-size:14px">Consultez vos résultats sur le Matcher.</td></tr>'}
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px">
            <tr><td align="center">
              <a href="${MATCHER_URL}" style="display:inline-block;background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:600;font-size:15px">Explorer la base CyberQuantic →</a>
            </td></tr>
          </table>
          <p style="margin:32px 0 0;color:#94a3b8;font-size:13px;line-height:1.6">
            Dans 2 jours, je vous enverrai un guide d'implémentation pour votre cas d'usage prioritaire.<br>
            <strong style="color:#4F46E5">L'équipe CyberQuantic</strong>
          </p>
        </td></tr>
        <tr><td style="padding:20px 48px;background:#f8faff;border-top:1px solid #e2e8f0;text-align:center">
          <p style="margin:0;color:#94a3b8;font-size:12px">© 2026 CyberQuantic · <a href="https://www.cyberquantic.com" style="color:#4F46E5;text-decoration:none">cyberquantic.com</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ─── Admin notification ───────────────────────────────────────────────────────
function buildAdminEmail(data) {
  const { email, firstname, company, role, sector, goal, usecases } = data;
  const ucRows = (usecases || '').split('||').filter(Boolean).map(uc => {
    const [title] = uc.split(':::');
    return `<tr><td style="padding:6px 8px;border:1px solid #e2e8f0;font-size:13px">✦ ${title}</td></tr>`;
  }).join('');
  return `
    <h2 style="color:#4F46E5">🎯 Nouveau lead — Use Case Matcher</h2>
    <table style="border-collapse:collapse;width:100%;font-family:sans-serif;margin-bottom:16px">
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;background:#f8faff;width:130px">Email</td><td style="padding:8px;border:1px solid #e2e8f0">${email}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;background:#f8faff">Prénom</td><td style="padding:8px;border:1px solid #e2e8f0">${firstname || '-'}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;background:#f8faff">Société</td><td style="padding:8px;border:1px solid #e2e8f0">${company || '-'}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;background:#f8faff">Rôle</td><td style="padding:8px;border:1px solid #e2e8f0">${role || '-'}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;background:#f8faff">Secteur</td><td style="padding:8px;border:1px solid #e2e8f0">${sector || '-'}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;background:#f8faff">Objectif</td><td style="padding:8px;border:1px solid #e2e8f0">${goal || '-'}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;background:#f8faff">Date</td><td style="padding:8px;border:1px solid #e2e8f0">${new Date().toLocaleString('fr-FR')}</td></tr>
    </table>
    ${ucRows ? `<h3>Use cases matchés :</h3><table style="border-collapse:collapse;width:100%">${ucRows}</table>` : ''}
    <p style="margin-top:12px;color:#64748b;font-size:13px">✅ Lead sauvegardé dans Notion · Email J+2 et J+7 planifiés</p>`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' },
    body: ''
  };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let data = {};
  try {
    const ct = event.headers['content-type'] || '';
    data = ct.includes('application/json')
      ? JSON.parse(event.body)
      : Object.fromEntries(new URLSearchParams(event.body));
  } catch (e) { return { statusCode: 400, body: 'Invalid body' }; }

  const { email } = data;
  if (!email) return { statusCode: 400, body: JSON.stringify({ error: 'Email required' }) };

  await Promise.allSettled([
    sendEmail(NOTIFY_EMAIL, `🎯 Nouveau lead Matcher — ${email}`, buildAdminEmail(data)),
    sendEmail(email, `🎯 Vos use cases IA personnalisés — CyberQuantic`, buildEmail1(data)),
    createNotionLead(data)
  ]);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ success: true })
  };
};
