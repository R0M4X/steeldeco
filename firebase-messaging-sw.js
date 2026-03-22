// firebase-messaging-sw.js
// Debe estar en la RAÍZ del proyecto (mismo nivel que index.html)
// Maneja notificaciones push cuando la app está en background o cerrada

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
    apiKey: "AIzaSyBzSk9LTu8ifjJBk0yYzO4_IMFub2GGVDw",
    authDomain: "appsteel-a1e3a.firebaseapp.com",
    projectId: "appsteel-a1e3a",
    storageBucket: "appsteel-a1e3a.appspot.com",
    messagingSenderId: "907112975827",
    appId: "1:907112975827:web:93ab290d891bec55f1f326"
});

const messaging = firebase.messaging();

// Notificación cuando la app está en background/cerrada
messaging.onBackgroundMessage((payload) => {
    console.log("[SW] Background message:", payload);

    const { title, body, icon } = payload.notification || {};
    const data = payload.data || {};

    const options = {
        body:  body  || "Tenés novedades en Steel & Deco",
        icon:  icon  || "/logo.jpeg",
        badge: "/logo.jpeg",
        tag:   data.type || "general",
        data:  data,
        vibrate: [100, 50, 100],
        actions: data.type === "credits" ? [
            { action:"open", title:"Ver mis créditos" }
        ] : data.type === "installer_plan" ? [
            { action:"open", title:"Ver mi perfil" }
        ] : [
            { action:"open", title:"Abrir app" }
        ]
    };

    self.registration.showNotification(
        title || "Steel & Deco",
        options
    );
});

// Click en la notificación → abrir la app
self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const data = event.notification.data || {};
    const url  = data.url || "/";
    event.waitUntil(
        clients.matchAll({ type:"window", includeUncontrolled:true }).then(list => {
            const existing = list.find(c => c.url.includes(self.location.origin));
            if (existing) { existing.focus(); existing.postMessage({ type:"notif_click", data }); }
            else clients.openWindow(url);
        })
    );
});
