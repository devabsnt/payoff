const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// API key MUST be set as environment variable - no fallbacks
const API_KEY = process.env.COINGECKO_API_KEY;
const BASE_URL = 'https://pro-api.coingecko.com/api/v3';

// Enable CORS
app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static('.'));

// Proxy endpoint for FreeCryptoAPI
app.get('/api/proxy', async (req, res) => {
  const { endpoint } = req.query;
  
  if (!endpoint) {
    return res.status(400).json({ error: 'Missing endpoint parameter' });
  }
  
  if (!API_KEY) {
    console.error('COINGECKO_API_KEY environment variable not set');
    return res.status(500).json({ error: 'API key not configured. Set COINGECKO_API_KEY environment variable.' });
  }

  try {
    // CoinGecko uses API key as query parameter
    const separator = endpoint.includes('?') ? '&' : '?';
    const url = `${BASE_URL}/${endpoint}${separator}x_cg_demo_api_key=${API_KEY}`;
    console.log('Full URL being requested:', url);
    console.log('Endpoint received:', endpoint);
    console.log('API key length:', API_KEY ? API_KEY.length : 'undefined');
    
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(url);
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers));
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.log('Non-JSON response:', text.substring(0, 500));
      return res.status(500).json({ 
        error: 'API returned non-JSON response', 
        contentType,
        preview: text.substring(0, 200)
      });
    }
    
    const data = await response.json();
    console.log('API Response Body:', JSON.stringify(data, null, 2));
    
    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || 'API request failed' });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Serve index.html for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});