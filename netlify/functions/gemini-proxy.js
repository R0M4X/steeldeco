// netlify/functions/gemini-proxy.js
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const GEMINI_KEY   = process.env.GEMINI_API_KEY;
    const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-image-preview';

    if (!GEMINI_KEY) {
        return { statusCode: 500, body: JSON.stringify({ error: 'API key no configurada' }) };
    }

    try {
        const body = JSON.parse(event.body);

        // Timeout manual de 25s para no llegar al límite de Netlify
        const controller = new AbortController();
        const timeoutId  = setTimeout(() => controller.abort(), 25000);

        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
            {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(body),
                signal:  controller.signal
            }
        );
        clearTimeout(timeoutId);

        const data = await geminiRes.json();

        return {
            statusCode: geminiRes.status,
            headers:    { 'Content-Type': 'application/json' },
            body:       JSON.stringify(data)
        };

    } catch (err) {
        const isTimeout = err.name === 'AbortError';
        return {
            statusCode: isTimeout ? 504 : 500,
            body: JSON.stringify({
                error: isTimeout
                    ? 'La generación tardó demasiado. Intentá con menos superficies.'
                    : err.message
            })
        };
    }
};
