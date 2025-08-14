const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// API key MUST be set as environment variable - no fallbacks
const API_KEY = process.env.FREECRYPTO_API_KEY;
const BASE_URL = 'https://api.freecryptoapi.com/v1';

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
    console.error('FREECRYPTO_API_KEY environment variable not set');
    return res.status(500).json({ error: 'API key not configured. Set FREECRYPTO_API_KEY environment variable.' });
  }

  try {
    const url = `${BASE_URL}/${endpoint}?apikey=${API_KEY}`;
    
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(url);
    const data = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || 'API request failed' });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve index.html for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});