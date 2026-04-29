// ============================================================
// products-firestore.js — Steel & Deco (hariaapp)
// Carga placas y uniones desde Firestore
// Expone: window.PLACAS_DB, window.JOINS_DB, window.loadProductsFromFirestore()
// ============================================================

const FIREBASE_CONFIG = {
    apiKey:            "AIzaSyBVzCEm_SLNfv_c0vo_DtfUTOHM6YtjQcs",
    authDomain:        "appsteel-a1e3a.firebaseapp.com",
    projectId:         "appsteel-a1e3a",
    storageBucket:     "appsteel-a1e3a.firebasestorage.app",
    messagingSenderId: "907112975827",
    appId:             "1:907112975827:web:3b648205863fcf0ef1f326"
};

if (!firebase.apps.length) {
    firebase.initializeApp(FIREBASE_CONFIG);
}
const _db = firebase.firestore();

// Formato que espera visualizador.html de producción
window.PLACAS_DB = [];
window.JOINS_DB  = [];

window.loadProductsFromFirestore = async function() {
    try {
        const [placasSnap, joinsSnap] = await Promise.all([
            _db.collection('placas').get(),
            _db.collection('joins').get()
        ]);

        window.PLACAS_DB = placasSnap.docs.map(doc => {
            const d = doc.data();
            return {
                id:     doc.id,
                nombre: d.nombre || 'Sin nombre',
                img:    d.imagen || '',   // campo 'imagen' en Firestore
                desc:   d.acabado || d.nombre || '',
            };
        });

        window.JOINS_DB = joinsSnap.docs.map(doc => {
            const d = doc.data();
            return {
                name:   d.name   || 'Sin nombre',
                cat:    d.cat    || '',
                img:    d.img    || '',
                detail: d.detail || '',
            };
        });

        console.log(`[Haria] ${window.PLACAS_DB.length} placas, ${window.JOINS_DB.length} uniones cargadas`);
        return true;
    } catch (err) {
        console.error('[Haria] Error Firestore:', err);
        window.PLACAS_DB = [];
        window.JOINS_DB  = [];
        return false;
    }
};
