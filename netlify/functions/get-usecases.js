exports.handler = async function(event, context) {
  try {
    const response = await fetch('https://api.cyberquantic.com/usecases');
    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: 'API error', status: response.status })
      };
    }
    const data = await response.json();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300'
      },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
