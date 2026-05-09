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

        let geminiPayload;

        // ── MODO proxy-fetch: el servidor descarga las imágenes de R2 ──
        if (body.mode === 'proxy-fetch') {
            const { ambient, refs, prompt } = body;

            // Descargar cada imagen de referencia desde su URL
            const refParts = [];
            for (const ref of refs) {
                try {
                    const imgRes = await fetch(ref.url);
                    if (!imgRes.ok) throw new Error(`${imgRes.status} ${ref.url}`);
                    const buffer = await imgRes.arrayBuffer();
                    const b64    = Buffer.from(buffer).toString('base64');
                    const mime   = imgRes.headers.get('content-type') || 'image/jpeg';
                    refParts.push({ inline_data: { mime_type: mime, data: b64 } });
                } catch (err) {
                    console.error(`[gemini-proxy] Error descargando ${ref.url}:`, err.message);
                    // Continuar sin esta imagen — mejor resultado parcial que error total
                }
            }

            const parts = [
                { text: prompt },
                { inline_data: { mime_type: ambient.mime, data: ambient.data } },
                ...refParts,
            ];

            geminiPayload = {
                contents: [{ parts }],
                generationConfig: {
                    responseModalities: ['IMAGE', 'TEXT'],
                    temperature: 0.1
                }
            };

        } else {
            // ── MODO estándar: el frontend ya mandó todo como base64 ──
            geminiPayload = body;
        }

        // Timeout de 25s
        const controller = new AbortController();
        const timeoutId  = setTimeout(() => controller.abort(), 25000);

        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
            {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(geminiPayload),
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
