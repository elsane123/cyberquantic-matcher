require('dotenv').config();
const { handler } = require('./netlify/functions/create-checkout.js');

(async () => {
  const event = {
    httpMethod: 'POST',
    body: JSON.stringify({
      email: 'test@example.com',
      useCaseData: { summary: 'test', role: 'tester', sector: 'IT', goal: 'test', topMatches: [] }
    })
  };
  
  try {
    const response = await handler(event, {});
    console.log(response);
  } catch (e) {
    console.error('Unhandled Exception:', e);
  }
})();
