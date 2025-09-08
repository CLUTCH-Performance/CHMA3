// netlify/functions/survey-query.js
const surveyData = require('../../complete-survey-data.js'); // Your existing data file

exports.handler = async (event, context) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
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
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { queryType, filters, columns, limit = 20 } = JSON.parse(event.body);
    
    let result;
    
    switch (queryType) {
      case 'filter':
        result = filterData(filters, columns, limit);
        break;
      case 'summary':
        result = getSummary(columns);
        break;
      case 'stats':
        result = getColumnStats(columns);
        break;
      case 'sample':
        result = getSample(limit);
        break;
      default:
        throw new Error('Invalid query type');
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(result)
    };

  } catch (error) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message })
    };
  }
};

function filterData(filters, columns, limit) {
  let filtered = surveyData.responses;
  
  // Apply filters
  if (filters) {
    Object.entries(filters).forEach(([column, value]) => {
      filtered = filtered.filter(row => {
        if (typeof value === 'object' && value.operator) {
          const cellValue = row[column];
          switch (value.operator) {
            case 'equals':
              return cellValue === value.value;
            case 'contains':
              return cellValue && cellValue.toString().toLowerCase().includes(value.value.toLowerCase());
            case 'gte':
              return parseFloat(cellValue) >= parseFloat(value.value);
            case 'lte':
              return parseFloat(cellValue) <= parseFloat(value.value);
            default:
              return cellValue === value.value;
          }
        }
        return row[column] === value;
      });
    });
  }
  
  // Select specific columns or all
  if (columns && columns.length > 0) {
    filtered = filtered.map(row => {
      const selected = {};
      columns.forEach(col => {
        selected[col] = row[col];
      });
      return selected;
    });
  }
  
  return {
    data: filtered.slice(0, limit),
    totalCount: filtered.length,
    limit: limit
  };
}

function getSummary(columns) {
  const responses = surveyData.responses;
  const summary = {
    totalResponses: responses.length,
    columnCount: Object.keys(responses[0] || {}).length
  };
  
  if (columns) {
    summary.columnSummaries = {};
    columns.forEach(col => {
      summary.columnSummaries[col] = getColumnStats([col]);
    });
  }
  
  return summary;
}

function getColumnStats(columns) {
  const responses = surveyData.responses;
  const stats = {};
  
  columns.forEach(col => {
    const values = responses.map(r => r[col]).filter(v => v !== null && v !== undefined && v !== '');
    
    stats[col] = {
      totalResponses: values.length,
      uniqueValues: [...new Set(values)].length,
      topValues: getTopValues(values, 5)
    };
    
    // If numeric, add numeric stats
    const numericValues = values.map(v => parseFloat(v)).filter(v => !isNaN(v));
    if (numericValues.length > values.length * 0.5) {
      stats[col].isNumeric = true;
      stats[col].average = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
      stats[col].min = Math.min(...numericValues);
      stats[col].max = Math.max(...numericValues);
    }
  });
  
  return stats;
}

function getTopValues(values, limit) {
  const counts = {};
  values.forEach(v => {
    counts[v] = (counts[v] || 0) + 1;
  });
  
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count, percentage: (count / values.length * 100).toFixed(1) }));
}

function getSample(limit) {
  const responses = surveyData.responses;
  
  // Get balanced sample across member types
  const memberTypes = {};
  responses.forEach(response => {
    const memberType = response["Please indicate the category which best describes your company's membership."];
    if (!memberTypes[memberType]) {
      memberTypes[memberType] = [];
    }
    memberTypes[memberType].push(response);
  });
  
  const sample = [];
  const types = Object.keys(memberTypes);
  const perType = Math.ceil(limit / types.length);
  
  types.forEach(type => {
    const typeResponses = memberTypes[type].slice(0, perType);
    sample.push(...typeResponses);
  });
  
  return {
    data: sample.slice(0, limit),
    sampleInfo: {
      totalSample: Math.min(sample.length, limit),
      memberTypeDistribution: Object.fromEntries(
        types.map(type => [type, Math.min(memberTypes[type].length, perType)])
      )
    }
  };
}
