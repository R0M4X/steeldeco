// ══════════════════════════════════════════════════════════════════
// netlify/functions/verify-payment.js
// Steel & Deco — Verificar si un pago fue acreditado
//
// El frontend llama a:
//   GET /.netlify/functions/verify-payment?paymentId=XXX&uid=YYY
//
// Responde con: { credited: true/false, credits: N, type: "credits"|"installer_plan" }
// ══════════════════════════════════════════════════════════════════

async function fetchJSON(url, opts = {}) {
    const res = await fetch(url, opts);
    return res.json();
}

async function getFirestoreToken() {
    const sa = JSON.parse(process.env.FIREBASE_SA_KEY);
    const now = Math.floor(Date.now() / 1000);
    const header  = Buffer.from(JSON.stringify({ alg:"RS256", typ:"JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
        iss: sa.client_email, sub: sa.client_email,
        aud: "https://oauth2.googleapis.com/token",
        iat: now, exp: now + 3600,
        scope: "https://www.googleapis.com/auth/datastore"
    })).toString("base64url");
    const { createSign } = require("crypto");
    const sign = createSign("RSA-SHA256");
    sign.update(`${header}.${payload}`);
    const sig = sign.sign(sa.private_key, "base64url");
    return (await fetchJSON("https://oauth2.googleapis.com/token", {
        method:"POST",
        headers:{"Content-Type":"application/x-www-form-urlencoded"},
        body: new URLSearchParams({ grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer", assertion:`${header}.${payload}.${sig}` })
    })).access_token;
}

exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json"
    };
    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

    const { paymentId, uid } = event.queryStringParameters || {};
    if (!paymentId || !uid) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "paymentId and uid required" }) };
    }

    const PROJECT = process.env.FIREBASE_PROJECT || "appsteel-a1e3a";
    const MP_TOKEN = process.env.MP_ACCESS_TOKEN;

    try {
        // Verificar si el pago está en nuestra colección payments (fue procesado por webhook)
        const token = await getFirestoreToken();
        const payDoc = await fetchJSON(
            `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/payments/${paymentId}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        const credited = !payDoc.error && payDoc?.fields?.status?.stringValue === "approved";

        if (credited) {
            // Obtener créditos actuales del usuario
            const userDoc = await fetchJSON(
                `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/users/${uid}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const currentCredits = parseInt(userDoc?.fields?.credits?.integerValue || 0);
            const type = payDoc?.fields?.type?.stringValue || "credits";
            const creditsAdded = parseInt(payDoc?.fields?.credits?.integerValue || 0);
            return {
                statusCode: 200, headers,
                body: JSON.stringify({ credited: true, credits: currentCredits, type, creditsAdded })
            };
        }

        // Si no está en payments, verificar directo en MP como fallback
        const mpPayment = await fetchJSON(
            `https://api.mercadopago.com/v1/payments/${paymentId}`,
            { headers: { Authorization: `Bearer ${MP_TOKEN}` } }
        );

        return {
            statusCode: 200, headers,
            body: JSON.stringify({
                credited: false,
                mpStatus: mpPayment.status || "unknown",
                pending: mpPayment.status === "in_process" || mpPayment.status === "pending"
            })
        };
    } catch (err) {
        console.error("verify-payment error:", err);
        return { statusCode: 500, headers, body: JSON.stringify({ error: "internal error" }) };
    }
};
