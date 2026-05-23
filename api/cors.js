// Vercel Serverless Function to act as a same-domain CORS Proxy
// This allows the frontend to perform POST and GET requests to third-party endpoints securely and without CORS blockages.

module.exports = async (req, res) => {
  // Add CORS headers to allow same-origin or any local/production origin requests
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  // Handle preflight pre-requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'URL parameter "url" is required' });
  }

  try {
    const fetchOptions = {
      method: req.method,
      headers: {
        'Accept': req.headers['accept'] || 'application/json',
        'Content-Type': req.headers['content-type'] || 'application/json'
      }
    };

    // Forward authorization header if it exists
    if (req.headers['authorization']) {
      fetchOptions.headers['Authorization'] = req.headers['authorization'];
    }

    // Forward request body for non-GET/HEAD methods
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (typeof req.body === 'object') {
        fetchOptions.body = JSON.stringify(req.body);
      } else {
        fetchOptions.body = req.body;
      }
    }

    console.log(`[Proxy] Routing ${req.method} request to: ${url}`);
    
    const response = await fetch(url, fetchOptions);
    const contentType = response.headers.get('content-type');
    
    // Forward status code
    res.status(response.status);

    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      return res.json(data);
    } else {
      const data = await response.text();
      return res.send(data);
    }
  } catch (err) {
    console.error('[Proxy Error] Failed to proxy request:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
