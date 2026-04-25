const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { email, useCaseData, priceId } = JSON.parse(event.body);

    if (!email || !useCaseData) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing email or useCaseData' })
      };
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Roadmap IA CyberQuantic',
              description: 'Votre roadmap d\'implémentation IA personnalisée basée sur votre profil métier',
              images: ['https://cyberquantic.com/roadmap-thumbnail.png']
            },
            unit_amount: 4500, // 45€ in cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.MATCHER_URL || 'https://tools.cyberquantic.com'}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.MATCHER_URL || 'https://tools.cyberquantic.com'}/payment-cancelled`,
      customer_email: email,
      metadata: {
        email: email,
        usecase_summary: JSON.stringify(useCaseData.summary || ''),
        role: useCaseData.role || '',
        sector: useCaseData.sector || '',
        goal: useCaseData.goal || '',
        top_matches: JSON.stringify(useCaseData.topMatches || [])
      }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        sessionId: session.id,
        url: session.url
      })
    };

  } catch (error) {
    console.error('Stripe checkout error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to create checkout session', details: error.message })
    };
  }
};
