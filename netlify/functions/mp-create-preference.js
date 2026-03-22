// netlify/functions/mp-create-preference.js
// Crea la preferencia de pago en MercadoPago desde el servidor
// El Access Token NUNCA toca el frontend — vive solo aquí como variable de entorno

exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
    if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: "Method Not Allowed" };

    const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
    if (!MP_TOKEN) return { statusCode: 500, headers, body: JSON.stringify({ error: "MP token not configured" }) };

    let body;
    try { body = JSON.parse(event.body); }
    catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) }; }

    const { title, price, metadata, uid } = body;
    if (!title || !price || !uid) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "title, price and uid required" }) };
    }

    const origin = event.headers.origin || event.headers.referer?.split("/").slice(0,3).join("/") || "https://steeldeco.netlify.app";

    try {
        const preference = {
            items: [{ title, quantity: 1, currency_id: "USD", unit_price: parseFloat(price) }],
            metadata,
            back_urls: {
                success: `${origin}?mp=success`,
                failure: `${origin}?mp=failure`,
                pending: `${origin}?mp=pending`,
            },
            auto_return: "approved",
            external_reference: `${uid}|${metadata?.type || "credits"}|${metadata?.credits || 0}`,
            statement_descriptor: "STEEL & DECO",
        };

        const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${MP_TOKEN}`
            },
            body: JSON.stringify(preference)
        });

        const data = await res.json();

        if (!res.ok) {
            console.error("MP API error:", data);
            return { statusCode: 502, headers, body: JSON.stringify({ error: data?.message || "MP API error" }) };
        }

        return {
            statusCode: 200, headers,
            body: JSON.stringify({ init_point: data.init_point, preference_id: data.id })
        };

    } catch (err) {
        console.error("mp-create-preference error:", err);
        return { statusCode: 500, headers, body: JSON.stringify({ error: "internal error" }) };
    }
};
