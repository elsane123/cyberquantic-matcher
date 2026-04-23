const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event, context) => {
  const sig = event.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;

  try {
    // Verify the webhook signature
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid signature' })
    };
  }

  // Handle the checkout.session.completed event
  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    
    console.log('Payment successful for session:', session.id);
    console.log('Customer email:', session.customer_email);
    console.log('Metadata:', session.metadata);

    try {
      // Trigger the roadmap generation via the internal API
      const roadmapResponse = await fetch(
        `${process.env.NETLIFY_FUNCTIONS_URL || 'https://cyberquantic-tools.netlify.app/.netlify/functions'}/generate-roadmap`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: session.customer_email,
            metadata: session.metadata,
            sessionId: session.id
          })
        }
      );

      if (!roadmapResponse.ok) {
        throw new Error(`Roadmap generation failed: ${roadmapResponse.status}`);
      }

      console.log('Roadmap generation triggered successfully');

    } catch (error) {
      console.error('Error triggering roadmap generation:', error);
      // Don't fail the webhook - Stripe will retry
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ received: true })
  };
};
