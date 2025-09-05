// netlify/functions/claude-proxy.js
exports.handler = async (event, context) => {
  console.log('Claude Proxy Function Called');
  console.log('Method:', event.httpMethod);
  console.log('Origin:', event.headers.origin);
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: `Method ${event.httpMethod} not allowed` })
    };
  }

  try {
    // Get API key from environment variable
    const apiKey = process.env.ANTHROPIC_API_KEY_CMHA_SURVEY;
    
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY_CMHA_SURVEY environment variable not set');
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Server configuration error: API key not configured. Please set ANTHROPIC_API_KEY_CMHA_SURVEY environment variable in Netlify.' 
        })
      };
    }

    let requestData;
    
    try {
      requestData = JSON.parse(event.body || '{}');
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid JSON body' })
      };
    }

    const { messages, maxTokens } = requestData;

    if (!messages || !Array.isArray(messages)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing or invalid messages array' })
      };
    }

    console.log(`Making request to Anthropic with ${messages.length} messages`);

    // Using Claude Sonnet 4 - the latest and most capable model for survey analysis
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', // Latest Claude Sonnet 4
        max_tokens: maxTokens || 4000,
        messages: messages
      })
    });

    console.log('Anthropic API Status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API Error:', errorText);
      
      return {
        statusCode: response.status,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Anthropic API Error',
          status: response.status,
          details: errorText
        })
      };
    }

    const data = await response.json();
    console.log('Success! Response received from Anthropic');

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(data)
    };

  } catch (error) {
    console.error('Function Error:', error);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: error.message
      })
    };
  }
};
