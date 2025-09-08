// netlify/functions/claude-proxy.js
exports.handler = async (event, context) => {
  console.log('Claude Proxy Function Called');
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: `Method ${event.httpMethod} not allowed` })
    };
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY_CMHA_SURVEY;
    
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'API key not configured' })
      };
    }

    const requestData = JSON.parse(event.body || '{}');
    const { messages, maxTokens } = requestData;

    // Define function tools for Claude
    const tools = [
      {
        name: "query_survey_data",
        description: "Query the CMHA survey dataset with filters and return specific data",
        input_schema: {
          type: "object",
          properties: {
            queryType: {
              type: "string",
              enum: ["filter", "summary", "stats", "sample"],
              description: "Type of query to perform"
            },
            filters: {
              type: "object",
              description: "Filters to apply to the data"
            },
            columns: {
              type: "array",
              items: { type: "string" },
              description: "Specific columns to return"
            },
            limit: {
              type: "integer",
              description: "Maximum number of rows to return (default 20)"
            }
          },
          required: ["queryType"]
        }
      }
    ];

    // Make the API call with function calling enabled
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens || 4000,
        messages: messages,
        tools: tools
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        statusCode: response.status,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Anthropic API Error', details: errorText })
      };
    }

    const data = await response.json();

    // Check if Claude wants to use tools
    if (data.content && data.content.some(block => block.type === 'tool_use')) {
      const results = await handleToolCalls(data.content);
      
      // Send results back to Claude
      const followUpMessages = [
        ...messages,
        { role: 'assistant', content: data.content },
        { role: 'user', content: results }
      ];

      const followUpResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: maxTokens || 4000,
          messages: followUpMessages,
          tools: tools
        })
      });

      const followUpData = await followUpResponse.json();
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(followUpData)
      };
    }

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
      body: JSON.stringify({ error: 'Internal Server Error', message: error.message })
    };
  }
};

async function handleToolCalls(content) {
  const toolResults = [];
  
  for (const block of content) {
    if (block.type === 'tool_use') {
      try {
        // Call our survey-query function
        const queryResponse = await fetch(`${process.env.URL}/.netlify/functions/survey-query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(block.input)
        });
        
        const queryData = await queryResponse.json();
        
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(queryData)
        });
      } catch (error) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify({ error: error.message })
        });
      }
    }
  }
  
  return toolResults;
}
