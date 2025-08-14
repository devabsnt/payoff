const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Simple in-memory rate limiting (resets on server restart)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS_PER_HOUR = 10; // Per IP

// Simple cache to reduce API calls
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// API key MUST be set as environment variable - no fallbacks  
const API_KEY = process.env.COINGECKO_API_KEY;
const BASE_URL = 'https://api.coingecko.com/api/v3';

// Enable CORS
app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static('.'));

// Rate limiting middleware
function checkRateLimit(req, res, next) {
  const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
  const now = Date.now();
  
  if (!rateLimitMap.has(clientIP)) {
    rateLimitMap.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }
  
  const clientData = rateLimitMap.get(clientIP);
  
  if (now > clientData.resetTime) {
    // Reset the window
    rateLimitMap.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }
  
  if (clientData.count >= MAX_REQUESTS_PER_HOUR) {
    const timeLeft = Math.ceil((clientData.resetTime - now) / 1000 / 60); // minutes
    return res.status(429).json({ 
      error: `Rate limit exceeded. ${MAX_REQUESTS_PER_HOUR} requests per hour allowed. Try again in ${timeLeft} minutes.`,
      retryAfter: clientData.resetTime
    });
  }
  
  clientData.count++;
  next();
}

// Proxy endpoint for CoinGecko API
app.get('/api/proxy', checkRateLimit, async (req, res) => {
  const { endpoint } = req.query;
  
  if (!endpoint) {
    return res.status(400).json({ error: 'Missing endpoint parameter' });
  }
  
  if (!API_KEY) {
    console.error('COINGECKO_API_KEY environment variable not set');
    return res.status(500).json({ error: 'API key not configured. Set COINGECKO_API_KEY environment variable.' });
  }
  
  // Check cache first
  const cacheKey = endpoint;
  const cachedData = cache.get(cacheKey);
  if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL) {
    console.log('Returning cached data for:', endpoint);
    return res.json(cachedData.data);
  }

  try {
    // CoinGecko Demo API uses header authentication
    const url = `${BASE_URL}/${endpoint}`;
    console.log('Full URL being requested:', url);
    console.log('Endpoint received:', endpoint);
    console.log('API key length:', API_KEY ? API_KEY.length : 'undefined');
    
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(url, {
      headers: {
        'x-cg-demo-api-key': API_KEY,
        'Accept': 'application/json'
      }
    });
    
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
    
    // Cache successful responses
    cache.set(cacheKey, {
      data: data,
      timestamp: Date.now()
    });
    console.log('Cached data for:', endpoint);
    
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