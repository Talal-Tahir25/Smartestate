const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Mock prediction endpoint
// Proxy endpoint to Python Flask Model
app.post('/api/predict', (req, res) => {
    const http = require('http');
    const postData = JSON.stringify(req.body);

    const options = {
        hostname: '127.0.0.1',
        port: 5000,
        path: '/predict',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const request = http.request(options, (response) => {
        let data = '';

        response.on('data', (chunk) => {
            data += chunk;
        });

        response.on('end', () => {
            try {
                const result = JSON.parse(data);
                res.status(response.statusCode).json(result);
            } catch (e) {
                console.error("Error parsing Python response:", e);
                res.status(500).json({ error: "Invalid response from AI model" });
            }
        });
    });

    request.on('error', (e) => {
        console.error(`Problem with AI request: ${e.message}`);
        res.status(502).json({ error: "AI Model Service Unavailable. Is app.py running?" });
    });

    // Write data to request body
    request.write(postData);
    request.end();
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
