const { Resend } = require('resend');
const pdf = require('html-pdf-node');

const resend = new Resend(process.env.RESEND_API_KEY);

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { email, metadata, sessionId } = JSON.parse(event.body);

    if (!email || !metadata) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing email or metadata' })
      };
    }

    // Parse metadata
    const role = metadata.role || 'Professionnel';
    const sector = metadata.sector || 'Entreprise';
    const goal = metadata.goal || 'Productivité';
    const topMatches = JSON.parse(metadata.top_matches || '[]');

    console.log('Generating roadmap for:', email);
    console.log('Profile:', { role, sector, goal });

    // Generate content with Claude via OpenRouter
    const roadmapContent = await generateRoadmapWithClaude({
      role,
      sector,
      goal,
      topMatches
    });

    // Generate PDF from HTML
    const pdfBuffer = await generatePDF(roadmapContent, email);

    // Send email with PDF attachment
    await sendRoadmapEmail(email, pdfBuffer, sessionId);

    console.log('Roadmap successfully generated and sent to:', email);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Roadmap generated and sent'
      })
    };

  } catch (error) {
    console.error('Roadmap generation error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to generate roadmap', details: error.message })
    };
  }
};

async function generateRoadmapWithClaude({ role, sector, goal, topMatches }) {
  const useCaseList = topMatches.slice(0, 3).map((uc, i) => 
    `${i + 1}. ${uc.title || uc.name || 'Use Case IA'} - ${uc.description || 'Application IA métier'}`
  ).join('\n');

  const prompt = `Tu es un consultant senior en stratégie IA pour entreprises européennes.

PROFIL DU CLIENT:
- Rôle: ${role}
- Secteur: ${sector}
- Objectif principal: ${goal}

USE CASES IDENTIFIÉS COMME PRIORITAIRES:
${useCaseList}

CRÉE UN DOCUMENT PDF PROFESSIONNEL EN FRANÇAIS (3-4 pages) au format HTML stylisé.

Structure du document:
1. PAGE DE GARDE: Titre "Votre Roadmap d'Implémentation IA", sous-titre personnalisé avec le secteur et le rôle du client
2. SOMMAIRE: 3 phases d'implémentation
3. PHASE 1 - FONDATION (Mois 1-2): Audit rapide, choix des outils, formation équipe
4. PHASE 2 - PILOTAGE (Mois 3-4): Déploiement des 3 use cases identifiés avec KPIs
5. PHASE 3 - SCALING (Mois 5-6): Extension, automation, ROI mesuré
6. BUDGET ESTIMATIF: Fourchettes réalistes pour ce profil
7. PROCHAINES ÉTAPES: Checklist actionnable immédiate
8. CONTACT: Tu DOIS terminer le document EXACTEMENT par ce texte : "<p><strong>Pour démarrer immédiatement ou pour toute question :<br>sales@cyberquantic.com / +33 (0)6 89 06 86 68</strong></p>"

IMPORTANT : NE PAS ajouter de fausses coordonnees de contact a la fin du fichier.

STYLE CSS INLINE professionnel:
- Font-family: Arial, sans-serif
- Couleurs: #4F46E5 (indigo) pour les titres, #1e293b pour le texte
- Marges généreuses, typographie aérée
- Boxes avec bordures légères pour les phases

HTML complet (uniquement le body, style inline uniquement):`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://cyberquantic.com',
        'X-Title': 'CyberQuantic Roadmap Generator'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.7-sonnet',
        messages: [
          { role: 'system', content: 'Tu es un expert en stratégie IA B2B. Tu crées des roadmaps professionnelles en HTML.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 4000,
        temperature: 0.7
      })
    });

    const data = await response.json();
    const htmlContent = data.choices?.[0]?.message?.content || '';
    
    // Wrap in proper HTML document
    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Roadmap IA CyberQuantic</title>
  <style>
    @page { margin: 40px; }
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; }
    h1 { color: #4F46E5; font-size: 28px; border-bottom: 3px solid #4F46E5; padding-bottom: 10px; }
    h2 { color: #4F46E5; font-size: 20px; margin-top: 30px; }
    h3 { color: #7C3AED; font-size: 16px; margin-top: 20px; }
    .phase-box { background: #f8fafc; border-left: 4px solid #4F46E5; padding: 20px; margin: 20px 0; }
    .highlight { background: #ede9fe; padding: 15px; border-radius: 8px; margin: 15px 0; }
    .budget-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .budget-table th, .budget-table td { border: 1px solid #e2e8f0; padding: 12px; text-align: left; }
    .budget-table th { background: #4F46E5; color: white; }
  </style>
</head>
<body>
  ${htmlContent.replace(/```html/g, '').replace(/```/g, '')}
  <div style="margin-top: 40px; padding: 20px; background: #f1f5f9; text-align: center; font-size: 12px; color: #64748b;">
    Roadmap générée par CyberQuantic - Votre partenaire IA européen<br><br>Pour démarrer immédiatement ou pour toute question :<br><strong>sales@cyberquantic.com / +33 (0)6 89 06 86 68</strong>
  </div>
</body>
</html>`;

  } catch (error) {
    console.error('Claude API error:', error);
    // Fallback template
    return generateFallbackTemplate({ role, sector, goal, topMatches });
  }
}

function generateFallbackTemplate({ role, sector, goal, topMatches }) {
  const useCases = topMatches.slice(0, 3).map(uc => uc.title || uc.name || 'Use Case IA').join(', ');
  
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Roadmap IA CyberQuantic</title>
  <style>
    @page { margin: 40px; }
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; }
    h1 { color: #4F46E5; font-size: 28px; border-bottom: 3px solid #4F46E5; padding-bottom: 10px; }
    h2 { color: #4F46E5; font-size: 20px; margin-top: 30px; }
    .phase-box { background: #f8fafc; border-left: 4px solid #4F46E5; padding: 20px; margin: 20px 0; }
    .highlight { background: #ede9fe; padding: 15px; border-radius: 8px; margin: 15px 0; }
  </style>
</head>
<body>
  <div style="text-align: center; margin-bottom: 40px;">
    <h1 style="margin: 0;">Votre Roadmap d'Implémentation IA</h1>
    <p style="font-size: 18px; color: #64748b; margin-top: 10px;">${role} • ${sector}</p>
  </div>
  
  <div class="highlight">
    <strong>Objectif stratégique:</strong> ${goal}
  </div>
  
  <h2>🎯 Use Cases Prioritaires Identifiés</h2>
  <p>${useCases}</p>
  
  <h2>📅 Phase 1: Fondation (Mois 1-2)</h2>
  <div class="phase-box">
    <ul>
      <li>Audit de maturité IA de l'équipe ${role}</li>
      <li>Sélection des outils adaptés au secteur ${sector}</li>
      <li>Formation initiale des collaborateurs clés</li>
    </ul>
  </div>
  
  <h2>🚀 Phase 2: Pilotage (Mois 3-4)</h2>
  <div class="phase-box">
    <ul>
      <li>Déploiement des 3 use cases prioritaires</li>
      <li>Mise en place des KPIs de suivi</li>
      <li>Itération et optimisation</li>
    </ul>
  </div>
  
  <h2>📈 Phase 3: Scaling (Mois 5-6)</h2>
  <div class="phase-box">
    <ul>
      <li>Extension à d'autres équipes</li>
      <li>Automation des processus récurrents</li>
      <li>Mesure du ROI global</li>
    </ul>
  </div>
  
  <h2>💰 Budget Estimatif</h2>
  <p><strong>Phase 1:</strong> 2 000€ - 5 000€ (outils + formation)<br>
  <strong>Phase 2-3:</strong> 5 000€ - 15 000€ (déploiement + support)</p>
  
  <div style="margin-top: 40px; padding: 20px; background: #f1f5f9; text-align: center; font-size: 12px; color: #64748b;">
    Roadmap générée par CyberQuantic - Votre partenaire IA européen<br><br>Pour démarrer immédiatement ou pour toute question :<br><strong>sales@cyberquantic.com / +33 (0)6 89 06 86 68</strong>
  </div>
</body>
</html>`;
}

async function generatePDF(htmlContent, email) {
  try {
    const file = { content: htmlContent };
    const options = {
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
    };
    
    const pdfBuffer = await pdf.generatePdf(file, options);
    return pdfBuffer;
  } catch (error) {
    console.error('PDF generation error:', error);
    throw error;
  }
}

async function sendRoadmapEmail(email, pdfBuffer, sessionId) {
  try {
    await resend.emails.send({
      from: 'CyberQuantic <contact@cyberquantic.com>',
      to: email,
      subject: 'Votre Roadmap d\'Implémentation IA personnalisée',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">Votre Roadmap IA est prête ! 🚀</h2>
          <p>Bonjour,</p>
          <p>Merci d'avoir utilisé le <strong>Use Case Matcher</strong> de CyberQuantic.</p>
          <p>Vous trouverez ci-joint votre <strong>Roadmap d'Implémentation IA personnalisée</strong>, élaborée spécialement pour votre profil métier et vos objectifs.</p>
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #4F46E5;">Ce que contient votre roadmap:</h3>
            <ul>
              <li>✅ Analyse de vos 3 use cases prioritaires</li>
              <li>✅ Plan d'action sur 6 mois (3 phases)</li>
              <li>✅ Budget estimatif réaliste</li>
              <li>✅ Checklist des prochaines étapes</li>
            </ul>
          </div>
          <p><strong>Une question ?</strong> Répondez simplement à cet email ou réservez un appel de 15 minutes avec nos experts.</p>
          <p style="margin-top: 30px;">À bientôt,<br>L'équipe CyberQuantic</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
          <p style="font-size: 12px; color: #64748b;">
            Commande #${sessionId?.slice(-8) || 'XXXX'}<br>
            CyberQuantic - L'intelligence IA européenne pour les entreprises
          </p>
        </div>
      `,
      attachments: [
        {
          filename: 'roadmap-ia-cyberquantic.pdf',
          content: pdfBuffer.toString('base64')
        }
      ]
    });
  } catch (error) {
    console.error('Email sending error:', error);
    throw error;
  }
}
