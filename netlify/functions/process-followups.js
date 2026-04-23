const https = require('https');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFY_EMAIL  = process.env.NOTIFY_EMAIL  || 'elsane.tiberini@gmail.com';
const FROM_EMAIL    = process.env.FROM_EMAIL    || 'CyberQuantic <onboarding@resend.dev>';
const NOTION_TOKEN  = process.env.NOTION_TOKEN;
const NOTION_DB_ID  = process.env.NOTION_DB_ID;
const MATCHER_URL   = 'https://cyberquantic-matcher.netlify.app';
const CQ_URL        = 'https://www.cyberquantic.com';

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

const notionHeaders = () => ({
  'Authorization': `Bearer ${NOTION_TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json'
});

async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY) return null;
  return httpReq('POST', 'api.resend.com', '/emails',
    { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    { from: FROM_EMAIL, to: [to], subject, html }
  );
}

// ─── Notion helpers ───────────────────────────────────────────────────────────
async function queryPendingLeads(emailField) {
  // Query leads where the email sent field is empty
  const res = await httpReq('POST', 'api.notion.com',
    `/v1/databases/${NOTION_DB_ID}/query`,
    notionHeaders(),
    {
      filter: { property: emailField, rich_text: { is_empty: true } },
      page_size: 100
    }
  );
  if (res.status !== 200) return [];
  return JSON.parse(res.body).results || [];
}

async function markEmailSent(pageId, emailField) {
  const sentDate = new Date().toLocaleDateString('fr-FR');
  return httpReq('PATCH', 'api.notion.com', `/v1/pages/${pageId}`,
    notionHeaders(),
    { properties: { [emailField]: { rich_text: [{ text: { content: sentDate } }] } } }
  );
}

function getLeadData(page) {
  const props = page.properties || {};
  const getText  = (k) => props[k]?.rich_text?.[0]?.plain_text || '';
  const getTitle = (k) => props[k]?.title?.[0]?.plain_text || '';
  const getSelect = (k) => props[k]?.select?.name || '';
  const getDate  = (k) => props[k]?.date?.start || '';
  return {
    pageId:    page.id,
    email:     getTitle('Email'),
    firstname: getSelect('prenom'),
    company:   getText('societe'),
    role:      getSelect('role'),
    sector:    getSelect('secteur'),
    goal:      getSelect('objectif'),
    usecases:  getText('use case'),
    signupDate: getDate('date signup')
  };
}

function daysOld(signupDate) {
  if (!signupDate) return 999;
  return (Date.now() - new Date(signupDate).getTime()) / (24 * 60 * 60 * 1000);
}

// ─── Email 2 template (J+2) ───────────────────────────────────────────────────
function buildEmail2(lead) {
  const { firstname, usecases, sector } = lead;
  const name  = firstname || 'là';
  const topUC = (usecases || '').split('||')[0] || '';
  const [ucTitle, ucDesc] = topUC.split(':::');

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <tr><td style="background:linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%);padding:32px 48px;text-align:center">
          <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700">CyberQuantic</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px">Guide d'implémentation personnalisé</p>
        </td></tr>
        <tr><td style="padding:40px 48px">
          <p style="margin:0 0 20px;color:#1e293b;font-size:17px;font-weight:600">Bonjour ${name} 💡</p>
          <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.7">
            Il y a 2 jours, vous avez identifié vos priorités IA avec le Matcher CyberQuantic.
            Voici comment passer à l'action sur votre cas d'usage prioritaire.
          </p>
          ${ucTitle ? `
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px 24px;margin-bottom:28px">
            <p style="margin:0 0 8px;color:#166534;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">🎯 Votre priorité #1</p>
            <p style="margin:0 0 6px;color:#1e293b;font-size:16px;font-weight:600">${ucTitle}</p>
            ${ucDesc ? `<p style="margin:0;color:#64748b;font-size:13px;line-height:1.5">${ucDesc.substring(0,150)}...</p>` : ''}
          </div>` : ''}
          <h2 style="margin:0 0 16px;color:#1e293b;font-size:15px;font-weight:700">🗺️ Feuille de route recommandée</h2>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:12px 16px;border-left:3px solid #4F46E5;background:#f8faff;border-radius:0 8px 8px 0">
              <strong style="color:#4F46E5;font-size:13px">Étape 1 — Audit (Semaine 1)</strong>
              <p style="margin:4px 0 0;color:#64748b;font-size:13px">Cartographier les données disponibles et identifier les parties prenantes clés.</p>
            </td></tr>
            <tr><td style="height:8px"></td></tr>
            <tr><td style="padding:12px 16px;border-left:3px solid #7C3AED;background:#f8faff;border-radius:0 8px 8px 0">
              <strong style="color:#7C3AED;font-size:13px">Étape 2 — Pilote (Mois 1)</strong>
              <p style="margin:4px 0 0;color:#64748b;font-size:13px">Déployer un POC sur un périmètre limité avec des KPIs mesurables dès le départ.</p>
            </td></tr>
            <tr><td style="height:8px"></td></tr>
            <tr><td style="padding:12px 16px;border-left:3px solid #059669;background:#f0fdf4;border-radius:0 8px 8px 0">
              <strong style="color:#059669;font-size:13px">Étape 3 — Déploiement (Mois 2-3)</strong>
              <p style="margin:4px 0 0;color:#64748b;font-size:13px">Étendre à l'ensemble de l'organisation après validation du ROI sur le pilote.</p>
            </td></tr>
          </table>
          <div style="background:#fafafa;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px;margin:28px 0">
            <p style="margin:0 0 12px;color:#1e293b;font-size:14px;font-weight:600">📚 Ressources CyberQuantic</p>
            <p style="margin:4px 0"><a href="${CQ_URL}/fr/knowledge/APIs" style="color:#4F46E5;font-size:14px">→ 246 APIs IA par fonctionnalité</a></p>
            <p style="margin:4px 0"><a href="${CQ_URL}/fr/knowledge/autonomous-agents" style="color:#4F46E5;font-size:14px">→ 61 agents IA B2B prêts à déployer</a></p>
            <p style="margin:4px 0"><a href="${CQ_URL}/fr/knowledge/ai-prompt-directory" style="color:#4F46E5;font-size:14px">→ 82 prompts métier prêts à l'emploi</a></p>
          </div>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <a href="${MATCHER_URL}" style="display:inline-block;background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#fff;text-decoration:none;padding:13px 32px;border-radius:8px;font-weight:600;font-size:14px">Voir tous mes use cases →</a>
            </td></tr>
          </table>
          <p style="margin:28px 0 0;color:#94a3b8;font-size:13px;line-height:1.6">
            Dans 5 jours, je reviens avec une proposition concrète pour accélérer votre passage à l'action.<br>
            <strong style="color:#4F46E5">L'équipe CyberQuantic</strong>
          </p>
        </td></tr>
        <tr><td style="padding:20px 48px;background:#f8faff;border-top:1px solid #e2e8f0;text-align:center">
          <p style="margin:0;color:#94a3b8;font-size:12px">© 2026 CyberQuantic · <a href="${CQ_URL}" style="color:#4F46E5;text-decoration:none">cyberquantic.com</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ─── Email 3 template (J+7) ───────────────────────────────────────────────────
function buildEmail3(lead) {
  const { firstname, sector } = lead;
  const name = firstname || 'là';
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <tr><td style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);padding:32px 48px;text-align:center">
          <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700">CyberQuantic</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.6);font-size:13px">Passez à l'action sur votre stratégie IA</p>
        </td></tr>
        <tr><td style="padding:40px 48px">
          <p style="margin:0 0 20px;color:#1e293b;font-size:17px;font-weight:600">Bonjour ${name} 🚀</p>
          <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.7">
            Il y a une semaine, vous avez identifié vos priorités IA${sector ? ` dans le secteur <strong>${sector}</strong>` : ''}.
            Les entreprises qui agissent dans les 30 premiers jours obtiennent des résultats <strong>3× plus rapidement</strong>.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
            <tr>
              <td style="width:30%;padding:16px;text-align:center;background:#f0fdf4;border-radius:12px">
                <div style="font-size:26px;font-weight:700;color:#166534">73%</div>
                <div style="font-size:11px;color:#64748b;margin-top:4px">ROI positif dès la 1ère année</div>
              </td>
              <td width="3%"></td>
              <td style="width:37%;padding:16px;text-align:center;background:#ede9fe;border-radius:12px">
                <div style="font-size:26px;font-weight:700;color:#6D28D9">×3.2</div>
                <div style="font-size:11px;color:#64748b;margin-top:4px">productivité sur tâches répétitives</div>
              </td>
              <td width="3%"></td>
              <td style="width:27%;padding:16px;text-align:center;background:#dbeafe;border-radius:12px">
                <div style="font-size:26px;font-weight:700;color:#1D4ED8">-38%</div>
                <div style="font-size:11px;color:#64748b;margin-top:4px">coûts opérationnels en 6 mois</div>
              </td>
            </tr>
          </table>
          <div style="background:linear-gradient(135deg,#4F46E5,#7C3AED);border-radius:16px;padding:28px;text-align:center;margin-bottom:28px">
            <p style="margin:0 0 8px;color:rgba(255,255,255,0.8);font-size:12px;text-transform:uppercase;letter-spacing:1px">Offre limitée</p>
            <p style="margin:0 0 12px;color:#fff;font-size:20px;font-weight:700">Consultation Stratégie IA offerte</p>
            <p style="margin:0 0 20px;color:rgba(255,255,255,0.85);font-size:14px;line-height:1.6">
              30 minutes avec un expert CyberQuantic pour définir votre feuille de route IA et prioriser vos 3 chantiers à fort ROI.
            </p>
            <a href="mailto:contact@cyberquantic.com?subject=Consultation%20IA%20-%20${encodeURIComponent(sector || 'Général')}" style="display:inline-block;background:#fff;color:#4F46E5;text-decoration:none;padding:13px 32px;border-radius:8px;font-weight:700;font-size:15px">Réserver ma consultation gratuite →</a>
          </div>
          <div style="background:#fafafa;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px">
            <p style="margin:0 0 12px;color:#1e293b;font-size:14px;font-weight:600">Explorer en autonomie :</p>
            <p style="margin:4px 0"><a href="${MATCHER_URL}" style="color:#4F46E5;font-size:14px">→ Relancer le Use Case Matcher</a></p>
            <p style="margin:4px 0"><a href="${CQ_URL}/fr/knowledge/AI-Companies" style="color:#4F46E5;font-size:14px">→ 829 entreprises IA en Europe</a></p>
            <p style="margin:4px 0"><a href="${CQ_URL}/fr/knowledge/autonomous-agents" style="color:#4F46E5;font-size:14px">→ 61 agents IA prêts à déployer</a></p>
          </div>
          <p style="margin:28px 0 0;color:#94a3b8;font-size:13px;line-height:1.6">
            Dernier email de notre séquence. Contactez-nous : <a href="mailto:contact@cyberquantic.com" style="color:#4F46E5">contact@cyberquantic.com</a><br>
            <strong style="color:#4F46E5">L'équipe CyberQuantic</strong>
          </p>
        </td></tr>
        <tr><td style="padding:20px 48px;background:#f8faff;border-top:1px solid #e2e8f0;text-align:center">
          <p style="margin:0;color:#94a3b8;font-size:12px">© 2026 CyberQuantic · <a href="${CQ_URL}" style="color:#4F46E5;text-decoration:none">cyberquantic.com</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ─── Scheduled handler ────────────────────────────────────────────────────────
exports.handler = async () => {
  if (!NOTION_TOKEN || !NOTION_DB_ID) return { statusCode: 500, body: 'Missing Notion config' };

  let email2Count = 0, email3Count = 0;

  // ── Email 2 (J+2) ──
  const pending2 = await queryPendingLeads('email 2 envoué').catch(() => []);
  for (const page of pending2) {
    const lead = getLeadData(page);
    if (!lead.email || daysOld(lead.signupDate) < 2) continue;
    const res = await sendEmail(
      lead.email,
      `💡 ${lead.firstname || 'Votre'} guide d'implémentation IA — CyberQuantic`,
      buildEmail2(lead)
    ).catch(() => null);
    if (res && res.status < 400) {
      await markEmailSent(lead.pageId, 'email 2 envoué').catch(() => {});
      email2Count++;
    }
  }

  // ── Email 3 (J+7) ──
  const pending3 = await queryPendingLeads('email 3 envoyé').catch(() => []);
  for (const page of pending3) {
    const lead = getLeadData(page);
    if (!lead.email || daysOld(lead.signupDate) < 7) continue;
    const res = await sendEmail(
      lead.email,
      `🚀 Passez à l'action sur votre stratégie IA — CyberQuantic`,
      buildEmail3(lead)
    ).catch(() => null);
    if (res && res.status < 400) {
      await markEmailSent(lead.pageId, 'email 3 envoyé').catch(() => {});
      email3Count++;
    }
  }

  // Admin summary
  if (email2Count + email3Count > 0) {
    await sendEmail(NOTIFY_EMAIL,
      `📬 Follow-ups CyberQuantic — J+2: ${email2Count} · J+7: ${email3Count}`,
      `<h2>Rapport quotidien follow-ups</h2>
       <p>Emails J+2 envoyés : <strong>${email2Count}</strong></p>
       <p>Emails J+7 envoyés : <strong>${email3Count}</strong></p>
       <p>Date : ${new Date().toLocaleString('fr-FR')}</p>`
    ).catch(() => {});
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ email2Sent: email2Count, email3Sent: email3Count })
  };
};
