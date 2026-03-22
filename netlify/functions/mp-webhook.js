// ══════════════════════════════════════════════════════════════════
// netlify/functions/mp-webhook.js
// Steel & Deco — Webhook de MercadoPago
//
// Variables de entorno requeridas en Netlify:
//   MP_ACCESS_TOKEN   = APP_USR-3612831531931648-120507-...
//   FIREBASE_PROJECT  = appsteel-a1e3a
//   FIREBASE_SA_KEY   = (JSON completo de la service account, en una línea)
//
// En MP Dashboard → Tu app → Webhooks → agregar:
//   https://tu-sitio.netlify.app/.netlify/functions/mp-webhook
//   Eventos: payment
// ══════════════════════════════════════════════════════════════════

const https = require("https");

// ── Utilidad: fetch nativo (Node 18+ lo tiene built-in) ──────────
async function fetchJSON(url, opts = {}) {
    const res = await fetch(url, opts);
    return res.json();
}

// ── Firebase Admin via REST (sin instalar SDK) ───────────────────
// Usamos la API REST de Firestore con un Service Account JWT
async function getFirestoreToken() {
    const sa = JSON.parse(process.env.FIREBASE_SA_KEY);
    const now = Math.floor(Date.now() / 1000);
    const header  = Buffer.from(JSON.stringify({ alg:"RS256", typ:"JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
        iss: sa.client_email,
        sub: sa.client_email,
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
        scope: "https://www.googleapis.com/auth/datastore"
    })).toString("base64url");

    const { createSign } = require("crypto");
    const sign = createSign("RSA-SHA256");
    sign.update(`${header}.${payload}`);
    const sig = sign.sign(sa.private_key, "base64url");
    const jwt = `${header}.${payload}.${sig}`;

    const tokenRes = await fetchJSON("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: jwt
        })
    });
    return tokenRes.access_token;
}

async function firestoreGet(token, project, docPath) {
    const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${docPath}`;
    return fetchJSON(url, { headers: { Authorization: `Bearer ${token}` } });
}

async function firestorePatch(token, project, docPath, fields) {
    // Convertir objeto JS a formato Firestore
    const firestoreFields = {};
    for (const [k, v] of Object.entries(fields)) {
        if (typeof v === "number")  firestoreFields[k] = { integerValue: v };
        else if (typeof v === "boolean") firestoreFields[k] = { booleanValue: v };
        else if (v === null)        firestoreFields[k] = { nullValue: null };
        else                        firestoreFields[k] = { stringValue: String(v) };
    }
    const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${docPath}`;
    const updateMask = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join("&");
    return fetchJSON(`${url}?${updateMask}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: firestoreFields })
    });
}

// ── Obtener número de un campo Firestore ─────────────────────────
function fsNum(doc, field) {
    return parseInt(doc?.fields?.[field]?.integerValue || doc?.fields?.[field]?.doubleValue || 0);
}
function fsBool(doc, field) {
    return doc?.fields?.[field]?.booleanValue === true;
}

// ── Handler principal ────────────────────────────────────────────
exports.handler = async (event) => {
    // Solo POST
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    let body;
    try { body = JSON.parse(event.body); } 
    catch { return { statusCode: 400, body: "Invalid JSON" }; }

    console.log("MP Webhook received:", JSON.stringify(body));

    // MP envía topic:"payment" con data.id
    if (body.type !== "payment" || !body.data?.id) {
        return { statusCode: 200, body: "ok - ignored" };
    }

    const paymentId = body.data.id;
    const MP_TOKEN  = process.env.MP_ACCESS_TOKEN;
    const PROJECT   = process.env.FIREBASE_PROJECT || "appsteel-a1e3a";

    try {
        // 1. Verificar el pago en MP
        const payment = await fetchJSON(
            `https://api.mercadopago.com/v1/payments/${paymentId}`,
            { headers: { Authorization: `Bearer ${MP_TOKEN}` } }
        );

        console.log("Payment status:", payment.status, "ref:", payment.external_reference);

        if (payment.status !== "approved") {
            return { statusCode: 200, body: `ok - status: ${payment.status}` };
        }

        // 2. Parsear external_reference: "uid|type|credits"
        const [uid, type, creditsStr] = (payment.external_reference || "").split("|");
        if (!uid) {
            console.error("No uid in external_reference");
            return { statusCode: 200, body: "ok - no uid" };
        }

        // 3. Verificar que este pago no fue procesado ya (idempotencia)
        const token    = await getFirestoreToken();
        const userDoc  = await firestoreGet(token, PROJECT, `users/${uid}`);
        const lastPay  = userDoc?.fields?.lastPaymentId?.stringValue;

        if (lastPay === String(paymentId)) {
            console.log("Payment already processed:", paymentId);
            return { statusCode: 200, body: "ok - already processed" };
        }

        // 4. Acreditar según tipo
        let updates = { lastPaymentId: String(paymentId) };

        if (type === "credits") {
            const credits    = parseInt(creditsStr) || 0;
            const current    = fsNum(userDoc, "credits");
            updates.credits  = current + credits;
            updates.lastPaymentType = "credits";
            updates.lastPaymentCredits = credits;
            console.log(`Crediting ${credits} credits to ${uid}. New total: ${updates.credits}`);
        } 
        else if (type === "installer_plan") {
            const current    = fsNum(userDoc, "credits");
            updates.credits  = current + 10;  // 10 créditos al activar
            updates.isRecommended   = true;
            updates.plan            = "destacado";
            updates.lastPaymentType = "installer_plan";
            console.log(`Activating installer plan for ${uid}`);
        }

        // 5. Guardar en Firestore
        await firestorePatch(token, PROJECT, `users/${uid}`, updates);
        console.log("Firestore updated for uid:", uid);

        // 6. Registrar el pago en colección payments (historial)
        const paymentRecord = {
            uid,
            type: type || "unknown",
            credits: parseInt(creditsStr) || 0,
            paymentId: String(paymentId),
            amount: payment.transaction_amount || 0,
            currency: payment.currency_id || "USD",
            status: "approved",
            createdAt: new Date().toISOString()
        };
        await firestorePatch(token, PROJECT, `payments/${paymentId}`, paymentRecord);

        return { statusCode: 200, body: "ok - credited" };

    } catch (err) {
        console.error("Webhook error:", err);
        // Devolver 200 igual para que MP no reintente indefinidamente
        // pero logueamos el error
        return { statusCode: 200, body: "ok - error logged" };
    }
};
