// netlify/functions/gemini-proxy.js
// Proxy seguro para Gemini API — la key nunca sale al frontend

exports.handler = async (event) => {
    // Solo POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const GEMINI_KEY   = process.env.GEMINI_API_KEY;
    const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp-image-generation';

    if (!GEMINI_KEY) {
        return { statusCode: 500, body: JSON.stringify({ error: 'API key no configurada en el servidor' }) };
    }

    try {
        const body = JSON.parse(event.body);

        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            }
        );

        const data = await geminiRes.json();

        if (!geminiRes.ok) {
            return {
                statusCode: geminiRes.status,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        };

    } catch (err) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message })
        };
    }
};
