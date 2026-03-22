// layout.js — Steel & Deco · Firebase Auth Real + Créditos + Nav
// IMPORTANTE: cargar con <script type="module" src="layout.js"></script>

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth, GoogleAuthProvider, signInWithPopup,
    signInWithEmailAndPassword, createUserWithEmailAndPassword,
    updateProfile, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
    getMessaging, getToken, onMessage
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

// VAPID key de Firebase (Console → Project Settings → Cloud Messaging → Web Push certificates)
// Reemplazá con tu VAPID key real de Firebase
const VAPID_KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDkASxefIacam8LABC"; // ← reemplazar

const firebaseConfig = {
    apiKey: "AIzaSyBzSk9LTu8ifjJBk0yYzO4_IMFub2GGVDw",
    authDomain: "appsteel-a1e3a.firebaseapp.com",
    projectId: "appsteel-a1e3a",
    storageBucket: "appsteel-a1e3a.appspot.com",
    messagingSenderId: "907112975827",
    appId: "1:907112975827:web:93ab290d891bec55f1f326"
};

const app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
let messaging = null;
try { messaging = getMessaging(app); } catch(e) { /* no soportado en todos los browsers */ }

let _user = null, _profile = null;
window.getCurrentUser  = () => _user;
window.getUserProfile  = () => _profile;
window.consumeCredit   = consumeCredit;
window.refundCredit    = refundCredit;
window.showToast       = showToast;

// ── MercadoPago ──────────────────────────────────────────────
const MP_PUBLIC_KEY  = "APP_USR-5d5b7fbd-17cd-4099-9976-bd97821fcc2d";
const MP_ACCESS_TOKEN= "APP_USR-3612831531931648-120507-648b157b6cc70a2e78f70577355bbb7f-180964893";

// Planes de créditos
const CREDIT_PACKS = [
    { id:"pack5",  credits:5,  price:2.99, label:"5 créditos",  desc:"Ideal para probar" },
    { id:"pack10", credits:10, price:4.99, label:"10 créditos", desc:"El más popular" },
    { id:"pack20", credits:20, price:8.99, label:"20 créditos", desc:"Mejor valor" },
];
const INSTALLER_PLAN = {
    id:"instalador_destacado", price:14.99,
    label:"Instalador Destacado",
    desc:"Incluye 10 créditos + destacado en directorio + 20 créditos cada mes"
};

document.addEventListener("DOMContentLoaded", () => {
    injectStyles();
    injectHeader();
    injectNav();
    injectModals();
    bindGlobals();
    onAuthStateChanged(auth, async (user) => {
        _user = user;
        if (user) { _profile = await loadOrCreateProfile(user); updateHeader(); scheduleDaily(); handleMPReturn(); initFCM(); }
        else { _profile = null; updateHeader(); }
    });
});

async function loadOrCreateProfile(user) {
    const ref  = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
        const isInst = window._pendingAccountType === "installer";
        // MODO ABIERTO: isInstaller:true de inmediato, sin verificación manual.
        // Para reactivar verificación: poner isInstaller:false e installerStatus:"pending"
        const data = {
            displayName: user.displayName || user.email.split("@")[0],
            email: user.email, photoURL: user.photoURL || null,
            credits: 10, plan: "free",
            isInstaller: isInst,
            isRecommended: false,
            installerStatus: isInst ? "active" : null,
            lastDailyCredit: null, createdAt: serverTimestamp()
        };
        await setDoc(ref, data);
        window._pendingAccountType = null;
        return data;
    }
    return snap.data();
}

function scheduleDaily() {
    checkDaily(); setInterval(checkDaily, 60000);
}
async function checkDaily() {
    if (!_user || !_profile) return;
    if (new Date().getHours() !== 21) return;
    const last = _profile.lastDailyCredit?.toDate?.() || null;
    const today = new Date(); today.setHours(0,0,0,0);
    if (last && last >= today) return;
    _profile.credits = (_profile.credits || 0) + 1;
    _profile.lastDailyCredit = Timestamp.now();
    await updateDoc(doc(db,"users",_user.uid), { credits: _profile.credits, lastDailyCredit: _profile.lastDailyCredit });
    updateHeader(); showToast("⚡ ¡Crédito diario acreditado!");
}
async function consumeCredit() {
    if (!_user || !_profile) { showToast("⚠️ Iniciá sesión primero"); return false; }
    if ((_profile.credits||0) <= 0) { showToast("Sin créditos. Comprá más ⚡"); return false; }
    _profile.credits -= 1;
    await updateDoc(doc(db,"users",_user.uid), { credits: _profile.credits });
    updateHeader(); return true;
}

async function refundCredit() {
    if (!_user || !_profile) return;
    _profile.credits += 1;
    await updateDoc(doc(db,"users",_user.uid), { credits: _profile.credits });
    updateHeader();
}

function injectStyles() {
    const s = document.createElement("style");
    s.textContent = `
        main{padding-top:76px;padding-bottom:90px}
        .pb-safe{padding-bottom:max(12px,env(safe-area-inset-bottom))}
        .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(3px);z-index:200;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .2s}
        .modal-overlay.open{opacity:1;pointer-events:auto}
        .modal-box{background:white;width:92%;max-width:400px;border-radius:24px;padding:24px 20px;box-shadow:0 25px 60px -12px rgba(0,0,0,.3);transform:translateY(12px);transition:transform .2s;position:relative}
        .modal-overlay.open .modal-box{transform:translateY(0)}
        .modal-close{position:absolute;top:14px;right:14px;width:28px;height:28px;border-radius:50%;background:#f1f5f9;border:none;cursor:pointer;font-size:12px;color:#94a3b8;display:flex;align-items:center;justify-content:center}
        .acct-type.selected{border-color:#059669!important;background:#f0fdf4!important}
        #globalToast.show{opacity:1!important;transform:translateX(-50%) translateY(-4px)!important}
    `;
    document.head.appendChild(s);
}

function injectHeader() {
    document.body.insertAdjacentHTML("afterbegin", `
    <header id="appHeader" class="fixed top-0 left-0 w-full bg-white/95 backdrop-blur-md z-50 px-5 py-3 shadow-sm border-b border-slate-100 flex justify-between items-center">
        <div class="flex items-center gap-3 select-none cursor-pointer" onclick="window.location.href='index.html'" id="logoTap">
            <img src="logo.jpeg" class="w-10 h-10 rounded-xl object-cover shadow-md" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <div class="w-10 h-10 bg-emerald-900 rounded-xl items-center justify-center text-white text-lg shadow-md hidden"><i class="fa-solid fa-leaf"></i></div>
            <div><h1 class="text-base font-bold text-slate-800 leading-none">Steel &amp; Deco</h1><p class="text-[10px] text-slate-400 font-medium tracking-wide">APP PROFESIONAL</p></div>
        </div>
        <div id="headerUserAction">
            <button onclick="openLogin()" class="bg-emerald-900 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg active:scale-95 transition-transform"><i class="fa-solid fa-user mr-1"></i> Ingresar</button>
        </div>
    </header>`);
    let taps=0,timer;
    const logo=document.getElementById("logoTap");
    if(logo) logo.addEventListener("click",e=>{e.stopPropagation();taps++;clearTimeout(timer);if(taps>=5){showToast("🎮 Modo Juego — Próximamente");taps=0;}else timer=setTimeout(()=>taps=0,800);});
}

function updateHeader() {
    const el = document.getElementById("headerUserAction");
    if (!el) return;
    if (_user && _profile) {
        const i  = (_profile.displayName||_user.email||"?")[0].toUpperCase();
        const av = _profile.photoURL ? `<img src="${_profile.photoURL}" class="w-8 h-8 rounded-full object-cover">` : `<div class="w-8 h-8 bg-emerald-800 text-white rounded-full flex items-center justify-center font-bold text-sm">${i}</div>`;
        el.innerHTML = `<div class="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-full pl-1 pr-3 py-1 cursor-pointer hover:bg-slate-100 transition" onclick="openProfile()">${av}<div class="leading-none"><span class="block text-[9px] text-slate-400 font-bold uppercase">Créditos</span><span class="block text-xs font-bold text-emerald-700">⚡ ${_profile.credits??0}</span></div></div>`;
    } else {
        el.innerHTML = `<button onclick="openLogin()" class="bg-emerald-900 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg active:scale-95 transition-transform"><i class="fa-solid fa-user mr-1"></i> Ingresar</button>`;
    }
}

function injectNav() {
    const path = window.location.pathname;
    let p = "calc";
    if(path.includes("galeria"))      p="gal";
    if(path.includes("comparador"))   p="comp";
    if(path.includes("instaladores")) p="inst";
    if(path.includes("visualizador")) p="vis";
    const a = k => p===k?"text-emerald-600":"text-slate-400";
    document.body.insertAdjacentHTML("beforeend",`
    <nav class="fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-md border-t border-slate-100 pb-safe pt-2 px-2 z-50">
        <div class="flex justify-between items-end max-w-md mx-auto px-2 pb-2">
            <button onclick="window.location.href='index.html'" class="flex flex-col items-center p-2 ${a("calc")} transition-colors"><i class="fa-solid fa-calculator text-xl mb-1"></i><span class="text-[10px] font-bold">Calcular</span></button>
            <button onclick="window.location.href='comparador.html'" class="flex flex-col items-center p-2 ${a("comp")} transition-colors"><i class="fa-solid fa-scale-balanced text-xl mb-1"></i><span class="text-[10px] font-bold">Comparar</span></button>
            <div class="relative -top-5"><button class="w-14 h-14 bg-emerald-900 rounded-full text-white flex items-center justify-center shadow-xl active:scale-95 transition-transform" onclick="window.open('https://wa.me/','_blank')"><i class="fa-brands fa-whatsapp text-2xl"></i></button></div>
            <button onclick="window.location.href='instaladores.html'" class="flex flex-col items-center p-2 ${a("inst")} transition-colors"><i class="fa-solid fa-hard-hat text-xl mb-1"></i><span class="text-[10px] font-bold">Instaladores</span></button>
            <button onclick="window.location.href='visualizador.html'" class="flex flex-col items-center p-2 ${a("vis")} transition-colors"><i class="fa-solid fa-wand-magic-sparkles text-xl mb-1"></i><span class="text-[10px] font-bold">IA Visu</span></button>
        </div>
    </nav>`);
}

function injectModals() {
    document.body.insertAdjacentHTML("beforeend",`
    <div id="loginModal" class="modal-overlay" onclick="handleOverlayClick(event,'loginModal')">
      <div class="modal-box">
        <button class="modal-close" onclick="closeModals()">✕</button>
        <div class="text-center mb-5">
          <img src="logo.jpeg" class="w-12 h-12 rounded-xl mx-auto mb-2 object-cover shadow" onerror="this.style.display='none'">
          <h3 class="text-lg font-bold text-slate-800">Bienvenido</h3>
        </div>
        <button id="btnGoogle" onclick="performGoogleLogin()" class="w-full flex items-center justify-center gap-3 border border-slate-200 rounded-xl py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 transition-all mb-4">
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.08 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-3.59-13.46-8.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Continuar con Google
        </button>
        <div class="flex items-center gap-3 mb-4"><div class="flex-1 h-px bg-slate-200"></div><span class="text-xs text-slate-400">o con email</span><div class="flex-1 h-px bg-slate-200"></div></div>
        <div class="flex bg-slate-100 rounded-xl p-1 mb-4">
          <button onclick="switchAuthTab('login')" id="tabLogin" class="flex-1 py-2 rounded-lg text-xs font-bold bg-white shadow text-slate-800 transition-all">Ingresar con email</button>
          <!-- Registro temporalmente deshabilitado -->
          <button id="tabRegister" class="hidden"></button>
        </div>
        <div id="fieldName" class="hidden mb-3"><input type="text" id="authName" placeholder="Tu nombre" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition"></div>        <div class="mb-3"><input type="email" id="authEmail" placeholder="Email" autocomplete="email" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition"></div>
        <div class="mb-3 relative">
          <input type="password" id="authPass" placeholder="Contraseña" autocomplete="current-password" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition pr-12" oninput="checkPasswordStrength(this.value)" onkeydown="if(event.key==='Enter')submitAuth()">
          <button type="button" onclick="togglePw('authPass',this)" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 p-1"><i class="fa-solid fa-eye text-sm"></i></button>
        </div>
        <div id="passStrengthWrap" class="hidden mb-3">
          <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div id="passStrengthBar" class="h-full rounded-full transition-all w-0 bg-red-400"></div></div>
          <p id="passStrengthLabel" class="text-[10px] text-slate-400 mt-1"></p>
        </div>
        <div id="fieldConfirm" class="hidden mb-3 relative">
          <input type="password" id="authPassConfirm" placeholder="Repetir contraseña" autocomplete="new-password" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition pr-12" oninput="checkConfirm()">
          <button type="button" onclick="togglePw('authPassConfirm',this)" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 p-1"><i class="fa-solid fa-eye text-sm"></i></button>
        </div>
        <p id="confirmError" class="hidden text-[11px] text-red-500 -mt-2 mb-3 ml-1">Las contraseñas no coinciden</p>
        <div id="fieldAccountType" class="hidden mb-4">
          <p class="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">Tipo de cuenta</p>
          <div class="grid grid-cols-2 gap-2">
            <div onclick="selectAccountType('user')" id="typeUser" class="acct-type selected border-2 border-emerald-500 bg-emerald-50 rounded-xl p-3 cursor-pointer text-center transition"><div class="text-xl mb-1">👤</div><div class="text-xs font-bold text-slate-700">Usuario</div><div class="text-[10px] text-slate-400">Gratis</div></div>
            <div onclick="selectAccountType('installer')" id="typeInstaller" class="acct-type border-2 border-slate-200 rounded-xl p-3 cursor-pointer text-center transition hover:border-slate-300"><div class="text-xl mb-1">🔧</div><div class="text-xs font-bold text-slate-700">Instalador</div><div class="text-[10px] text-slate-400">Gratis</div></div>
          </div>
        </div>
        <p id="authError" class="hidden text-xs text-red-500 text-center mb-3 bg-red-50 py-2 px-3 rounded-xl"></p>
        <button id="btnSubmitAuth" onclick="submitAuth()" class="w-full bg-emerald-900 text-white py-3 rounded-xl font-bold text-sm shadow-lg active:scale-95 transition-transform">Ingresar</button>
        <button onclick="closeModals()" class="w-full mt-3 text-slate-400 text-xs font-semibold py-1">Cancelar</button>
      </div>
    </div>

    <div id="profileModal" class="modal-overlay" onclick="handleOverlayClick(event,'profileModal')">
      <div class="modal-box" style="max-height:90vh;overflow-y:auto">
        <button class="modal-close" onclick="closeModals()">✕</button>
        <div class="flex items-center gap-3 mb-5">
          <div id="profileAvatar" class="w-12 h-12 bg-emerald-800 text-white rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0">?</div>
          <div class="min-w-0"><p class="font-bold text-slate-800 text-base leading-tight truncate" id="profileName">—</p><p class="text-xs text-slate-400 truncate" id="profileEmail">—</p></div>
          <button onclick="performLogout()" class="ml-auto flex-shrink-0 text-red-400 text-xs font-bold bg-red-50 px-3 py-1.5 rounded-lg">Salir</button>
        </div>
        <div class="bg-slate-900 text-white rounded-2xl p-4 mb-5 relative overflow-hidden">
          <p class="text-slate-400 text-[10px] font-bold uppercase mb-1">Créditos disponibles</p>
          <p class="text-3xl font-bold">⚡ <span id="profileCredits">0</span></p>
          <p class="text-[11px] text-slate-400 mt-1" id="dailyCreditStatus"></p>
          <div class="absolute -right-3 -bottom-3 text-7xl text-slate-800 opacity-40 pointer-events-none"><i class="fa-solid fa-bolt"></i></div>
        </div>
        <div id="installerBanner" class="hidden mb-4 p-3 rounded-xl text-xs font-semibold"></div>
        <h4 class="font-bold text-slate-700 text-xs uppercase tracking-wide mb-3">Comprar créditos</h4>
        <button onclick="buyCredits('pack5')" class="w-full flex justify-between items-center border-2 border-slate-200 hover:border-emerald-400 rounded-xl px-4 py-3 mb-2 transition-all active:scale-95 group">
          <div class="text-left"><p class="font-bold text-sm text-slate-800">5 créditos</p><p class="text-xs text-slate-400">Ideal para probar</p></div>
          <span class="font-bold text-emerald-700 text-sm">$2.99 USD</span>
        </button>
        <button onclick="buyCredits('pack10')" class="w-full flex justify-between items-center border-2 border-emerald-200 bg-emerald-50 hover:border-emerald-400 rounded-xl px-4 py-3 mb-2 transition-all active:scale-95 group">
          <div class="text-left"><p class="font-bold text-sm text-slate-800">10 créditos <span class="text-[10px] font-normal text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full ml-1">Popular</span></p><p class="text-xs text-slate-400">El más popular</p></div>
          <span class="font-bold text-emerald-700 text-sm">$4.99 USD</span>
        </button>
        <button onclick="buyCredits('pack20')" class="w-full flex justify-between items-center border-2 border-slate-200 hover:border-emerald-400 rounded-xl px-4 py-3 mb-3 transition-all active:scale-95 group">
          <div class="text-left"><p class="font-bold text-sm text-slate-800">20 créditos <span class="text-[10px] font-normal text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full ml-1">Mejor valor</span></p><p class="text-xs text-slate-400">Mejor relación precio/crédito</p></div>
          <span class="font-bold text-emerald-700 text-sm">$8.99 USD</span>
        </button>
        <div id="upgradeSection" class="hidden">
          <h4 class="font-bold text-slate-700 text-xs uppercase tracking-wide mb-3 mt-2">Destacarte como instalador</h4>
          <button onclick="upgradeToRecommended()" class="w-full flex justify-between items-center border-2 border-amber-300 hover:border-amber-400 bg-amber-50 rounded-xl px-4 py-3 mb-3 transition-all active:scale-95">
            <div class="text-left"><p class="font-bold text-sm text-slate-800">⭐ Instalador Destacado</p><p class="text-xs text-slate-400">Primero en la lista · tarjeta premium</p></div>
            <span class="font-bold text-amber-600 text-sm">$14.99<span class="text-[10px] font-normal text-slate-400">/mes</span></span>
          </button>
        </div>
        <button onclick="closeModals()" class="w-full mt-2 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold text-sm">Cerrar</button>
      </div>
    </div>

    <div id="globalToast" class="fixed bottom-24 left-1/2 -translate-x-1/2 bg-slate-900/95 text-white px-5 py-3 rounded-full text-sm font-semibold opacity-0 pointer-events-none transition-all duration-300 z-[9999] whitespace-nowrap shadow-lg"></div>
    `);
}

function bindGlobals() {
    window.openLogin=openLogin; window.closeModals=closeModals; window.openProfile=openProfile;
    window.performLogout=performLogout; window.performGoogleLogin=performGoogleLogin;
    window.submitAuth=submitAuth; window.switchAuthTab=switchAuthTab;
    window.selectAccountType=selectAccountType; window.togglePw=togglePw;
    window.checkPasswordStrength=checkPasswordStrength; window.checkConfirm=checkConfirm;
    window.buyCredits=buyCredits; window.upgradeToRecommended=upgradeToRecommended;
    window.handleOverlayClick=handleOverlayClick;
}

let _authMode="login", _accountType="user";

function openLogin(){
    _authMode="login";
    clearAuthForm();
    // Asegurar que todo el modal esté en modo login
    ["fieldName","fieldConfirm","fieldAccountType","passStrengthWrap"].forEach(id=>document.getElementById(id)?.classList.add("hidden"));
    const btn=document.getElementById("btnSubmitAuth");if(btn)btn.textContent="Ingresar";
    document.getElementById("loginModal").classList.add("open");
}
function closeModals(){document.querySelectorAll(".modal-overlay").forEach(m=>m.classList.remove("open"));}
function handleOverlayClick(e,id){if(e.target.id===id)closeModals();}

function switchAuthTab(mode){
    _authMode=mode; const isReg=mode==="register";
    const tl=document.getElementById("tabLogin"),tr=document.getElementById("tabRegister");
    if(tl)tl.className=`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${isReg?"text-slate-500":"bg-white shadow text-slate-800"}`;
    if(tr)tr.className=`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${isReg?"bg-white shadow text-slate-800":"text-slate-500"}`;
    ["fieldName","fieldConfirm","fieldAccountType","passStrengthWrap"].forEach(id=>document.getElementById(id)?.classList.toggle("hidden",!isReg));
    const btn=document.getElementById("btnSubmitAuth");
    if(btn)btn.textContent=isReg?"Crear cuenta":"Ingresar";
    clearAuthError();
}

function selectAccountType(type){
    _accountType=type;
    document.getElementById("typeUser").className=`acct-type ${type==="user"?"selected":""} border-2 border-slate-200 rounded-xl p-3 cursor-pointer text-center transition`;
    document.getElementById("typeInstaller").className=`acct-type ${type==="installer"?"selected":""} border-2 border-slate-200 rounded-xl p-3 cursor-pointer text-center transition`;
}

function togglePw(id,btn){const inp=document.getElementById(id);const isT=inp.type==="text";inp.type=isT?"password":"text";btn.querySelector("i").className=`fa-solid ${isT?"fa-eye":"fa-eye-slash"} text-sm`;}

function checkPasswordStrength(val){
    const bar=document.getElementById("passStrengthBar"),lbl=document.getElementById("passStrengthLabel");
    if(!bar)return;
    if(val.length<6){bar.style.width="25%";bar.style.background="#ef4444";lbl.textContent="Muy corta";lbl.style.color="#ef4444";}
    else if(val.length<10){bar.style.width="60%";bar.style.background="#f59e0b";lbl.textContent="Moderada";lbl.style.color="#f59e0b";}
    else{bar.style.width="100%";bar.style.background="#10b981";lbl.textContent="Fuerte ✓";lbl.style.color="#10b981";}
}

function checkConfirm(){
    const a=document.getElementById("authPass")?.value,b=document.getElementById("authPassConfirm")?.value;
    document.getElementById("confirmError")?.classList.toggle("hidden",a===b||!b);
}

async function performGoogleLogin(){
    setBtnLoading(true);
    try{
        const p=new GoogleAuthProvider();p.setCustomParameters({prompt:"select_account"});
        await signInWithPopup(auth,p);
        closeModals();showToast("¡Bienvenido! 👋");
    }catch(e){showAuthError(fbMsg(e.code));}
    finally{setBtnLoading(false);}
}

async function submitAuth(){
    const email=document.getElementById("authEmail")?.value?.trim();
    const pass=document.getElementById("authPass")?.value;
    if(!email||!pass){showAuthError("Completá email y contraseña.");return;}
    setBtnLoading(true);clearAuthError();
    try{
        if(_authMode==="login"){
            await signInWithEmailAndPassword(auth,email,pass);
            closeModals();showToast("¡Bienvenido de vuelta! 👋");
        }else{
            const confirm=document.getElementById("authPassConfirm")?.value;
            if(pass!==confirm){showAuthError("Las contraseñas no coinciden.");setBtnLoading(false);return;}
            const name=document.getElementById("authName")?.value?.trim()||email.split("@")[0];
            window._pendingAccountType=_accountType;
            const cred=await createUserWithEmailAndPassword(auth,email,pass);
            await updateProfile(cred.user,{displayName:name});
            closeModals();
            if(_accountType==="installer"){
                showToast("¡Bienvenido instalador! Ya estás en el directorio 🔧");
            }else{showToast("¡Bienvenido! 10 créditos de regalo ⚡");}
        }
    }catch(e){showAuthError(fbMsg(e.code));}
    finally{setBtnLoading(false);}
}

function setBtnLoading(on){
    const btn=document.getElementById("btnSubmitAuth"),g=document.getElementById("btnGoogle");
    if(btn){btn.disabled=on;if(on)btn.textContent="...";else btn.textContent=_authMode==="register"?"Crear cuenta":"Ingresar";}
    if(g)g.disabled=on;
}
function showAuthError(msg){const el=document.getElementById("authError");if(!el)return;el.textContent=msg;el.classList.remove("hidden");}
function clearAuthError(){document.getElementById("authError")?.classList.add("hidden");}
function clearAuthForm(){["authEmail","authPass","authPassConfirm","authName"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});clearAuthError();const b=document.getElementById("passStrengthBar");if(b)b.style.width="0";}

function fbMsg(code){
    const m={"auth/user-not-found":"No existe cuenta con ese email.","auth/wrong-password":"Contraseña incorrecta.","auth/invalid-credential":"Email o contraseña incorrectos.","auth/email-already-in-use":"Ya existe una cuenta con ese email.","auth/invalid-email":"El email no es válido.","auth/weak-password":"Contraseña muy corta (mín. 6 caracteres).","auth/popup-closed-by-user":"Cerraste el popup. Intentá de nuevo.","auth/popup-blocked":"Popup bloqueado. Habilitá popups para este sitio.","auth/network-request-failed":"Sin conexión. Verificá tu internet.","auth/too-many-requests":"Demasiados intentos. Esperá unos minutos.","auth/unauthorized-domain":"Dominio no autorizado. Agregalo en Firebase Console → Authentication → Authorized Domains."};
    return m[code]||`Error inesperado (${code||"desconocido"})`;
}

function openProfile(){
    if(!_user||!_profile){openLogin();return;}
    const av=document.getElementById("profileAvatar");
    if(_profile.photoURL)av.innerHTML=`<img src="${_profile.photoURL}" class="w-12 h-12 rounded-full object-cover">`;
    else av.textContent=(_profile.displayName||"?")[0].toUpperCase();
    document.getElementById("profileName").textContent=_profile.displayName||"Usuario";
    document.getElementById("profileEmail").textContent=_profile.email||_user.email||"";
    document.getElementById("profileCredits").textContent=_profile.credits??0;
    const now=new Date(),h=now.getHours(),last=_profile.lastDailyCredit?.toDate?.();
    const today=new Date();today.setHours(0,0,0,0);
    const stEl=document.getElementById("dailyCreditStatus");
    if(stEl){if(last&&last>=today)stEl.textContent="✅ Crédito diario ya acreditado hoy";else{const diff=(21-h+24)%24;stEl.textContent=diff===0?"⚡ ¡Crédito disponible ahora!":`⏰ Próximo crédito en ${diff}h (a las 21hs)`;}}
    const banner=document.getElementById("installerBanner"),upgrade=document.getElementById("upgradeSection"),st=_profile.installerStatus;
    if(st==="pending"||st==="active"){banner.className="mb-4 p-3 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200";banner.innerHTML="✅ Instalador activo. Estás visible en el directorio.";banner.classList.remove("hidden");if(!_profile.isRecommended)upgrade.classList.remove("hidden");else upgrade.classList.add("hidden");}
    else if(st==="verified"||_profile.isInstaller){banner.className="mb-4 p-3 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200";banner.innerHTML="✅ Instalador <strong>verificado</strong>. Estás en el directorio.";banner.classList.remove("hidden");if(!_profile.isRecommended)upgrade.classList.remove("hidden");else upgrade.classList.add("hidden");}
    else if(st==="rejected"){banner.className="mb-4 p-3 rounded-xl text-xs font-semibold bg-red-50 text-red-600 border border-red-200";banner.innerHTML="❌ Verificación rechazada. Contactate con soporte.";banner.classList.remove("hidden");upgrade.classList.add("hidden");}
    else{banner.classList.add("hidden");upgrade.classList.add("hidden");}
    document.getElementById("profileModal").classList.add("open");
}

function performLogout(){signOut(auth).then(()=>{_user=null;_profile=null;updateHeader();closeModals();showToast("Sesión cerrada");});}
// ── MercadoPago: crear preferencia y redirigir ───────────────
async function createMPPreference(title, price, metadata) {
    try {
        const body = {
            items:[{ title, quantity:1, currency_id:"USD", unit_price: price }],
            metadata,
            back_urls:{
                success: window.location.origin + window.location.pathname + "?mp=success",
                failure: window.location.origin + window.location.pathname + "?mp=failure",
                pending: window.location.origin + window.location.pathname + "?mp=pending",
            },
            auto_return:"approved",
            external_reference: _user.uid + "|" + metadata.type + "|" + metadata.credits,
        };
        const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
            method:"POST",
            headers:{ "Content-Type":"application/json", "Authorization":"Bearer " + MP_ACCESS_TOKEN },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        return data.init_point || data.sandbox_init_point || null;
    } catch(e) { console.error("MP Error:", e); return null; }
}

async function buyCredits(packId) {
    if (!_user) { openLogin(); return; }
    // Si no se pasó packId, abrir modal de selección de pack
    if (!packId) { openCreditsModal(); return; }
    const pack = CREDIT_PACKS.find(p => p.id === packId);
    if (!pack) return;
    showToast("💳 Redirigiendo a MercadoPago...");
    const url = await createMPPreference(
        `Steel & Deco · ${pack.label}`,
        pack.price,
        { type:"credits", credits: pack.credits, uid: _user.uid }
    );
    if (url) {
        // Extraer preferenceId para el polling
        const prefId = url.split("/").pop().split("?")[0];
        window.open(url, "_blank");
        // Mostrar pantalla de espera con polling
        setTimeout(() => showPaymentWaiting(prefId, { ...pack, type:"credits" }), 1500);
    } else {
        showToast("⚠️ Error al conectar con MercadoPago. Intentá de nuevo.");
    }
}

async function upgradeToRecommended() {
    if (!_user) return;
    showToast("⭐ Redirigiendo a MercadoPago...");
    const url = await createMPPreference(
        "Steel & Deco · Instalador Destacado",
        INSTALLER_PLAN.price,
        { type:"installer_plan", credits:10, uid: _user.uid }
    );
    if (url) {
        const prefId = url.split("/").pop().split("?")[0];
        window.open(url, "_blank");
        setTimeout(() => showPaymentWaiting(prefId, { type:"installer_plan", credits:10 }), 1500);
    } else {
        showToast("⚠️ Error al conectar con MercadoPago. Intentá de nuevo.");
    }
}

// ── Modal de selección de pack de créditos ────────────────────
function openCreditsModal() {
    const existing = document.getElementById("creditsPackModal");
    if (existing) { existing.classList.add("open"); return; }
    const html = `
    <div id="creditsPackModal" class="modal-overlay open" onclick="handleOverlayClick(event,'creditsPackModal')">
      <div class="modal-box">
        <button class="modal-close" onclick="document.getElementById('creditsPackModal').classList.remove('open')">✕</button>
        <h3 class="font-extrabold text-slate-800 text-base mb-1">Comprar créditos</h3>
        <p class="text-xs text-slate-400 mb-4">Cada crédito = 1 visualización IA</p>
        ${CREDIT_PACKS.map(p => `
        <button onclick="buyCredits('${p.id}')" class="w-full flex justify-between items-center border-2 border-slate-200 hover:border-emerald-500 rounded-xl px-4 py-3.5 mb-2.5 transition-all active:scale-95 group">
          <div class="text-left">
            <p class="font-bold text-sm text-slate-800 group-hover:text-emerald-800">${p.label}</p>
            <p class="text-xs text-slate-400">${p.desc}</p>
          </div>
          <div class="text-right">
            <p class="font-extrabold text-emerald-700 text-base">$${p.price}</p>
            <p class="text-[10px] text-slate-400">USD</p>
          </div>
        </button>`).join("")}
        <div class="mt-3 border-t border-slate-100 pt-3">
          <button onclick="upgradeToRecommended()" class="w-full flex justify-between items-center border-2 border-amber-300 bg-amber-50 hover:border-amber-400 rounded-xl px-4 py-3.5 transition-all active:scale-95">
            <div class="text-left">
              <p class="font-bold text-sm text-slate-800">⭐ Instalador Destacado</p>
              <p class="text-xs text-slate-500">10 créditos + 20/mes + primero en directorio</p>
            </div>
            <div class="text-right">
              <p class="font-extrabold text-amber-600 text-base">$14.99</p>
              <p class="text-[10px] text-slate-400">USD/mes</p>
            </div>
          </button>
        </div>
        <p class="text-center text-[10px] text-slate-300 mt-3 flex items-center justify-center gap-1">
          <img src="https://http2.mlstatic.com/frontend-assets/mp-web-navigation/ui-navigation/5.22.3/mercadopago/logo__small.png" class="h-3 opacity-50"> Pago seguro con MercadoPago
        </p>
      </div>
    </div>`;
    document.body.insertAdjacentHTML("beforeend", html);
}

// ── Manejar retorno de MP (back_url) ─────────────────────────
async function handleMPReturn() {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("mp");
    if (!status) return;
    // Limpiar URL
    window.history.replaceState({}, "", window.location.pathname);
    if (status === "success") {
        // Acreditar créditos — en producción esto lo haría un webhook en tu backend
        // Como fallback para MVP, lo hacemos client-side basándonos en external_reference
        const extRef = params.get("external_reference");
        if (extRef && _user) {
            const parts = extRef.split("|");
            const type    = parts[1];
            const credits = parseInt(parts[2]) || 0;
            if (type === "credits" && credits > 0) {
                _profile.credits = (_profile.credits||0) + credits;
                await updateDoc(doc(db,"users",_user.uid), { credits: _profile.credits });
                updateHeader();
                showToast(`✅ ¡${credits} créditos acreditados! ⚡`);
            } else if (type === "installer_plan") {
                _profile.isRecommended = true;
                _profile.credits = (_profile.credits||0) + 10;
                await updateDoc(doc(db,"users",_user.uid), {
                    isRecommended:true,
                    plan:"destacado",
                    credits: _profile.credits,
                    planActivatedAt: serverTimestamp()
                });
                updateHeader();
                showToast("⭐ ¡Suscripción activada! Ya sos Instalador Destacado");
            }
        } else {
            showToast("✅ Pago aprobado. Recargá para ver tus créditos.");
        }
    } else if (status === "failure") {
        showToast("❌ Pago rechazado. Intentá de nuevo.");
    } else if (status === "pending") {
        showToast("⏳ Pago pendiente. Te avisamos cuando se acredite.");
    }
}

// ══════════════════════════════════════════════════════
// FIREBASE CLOUD MESSAGING (Notificaciones Push)
// ══════════════════════════════════════════════════════
async function initFCM() {
    if (!messaging || !_user) return;
    try {
        // Pedir permiso
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        // Obtener token FCM
        const fcmToken = await getToken(messaging, { vapidKey: VAPID_KEY });
        if (!fcmToken) return;

        // Guardar token en Firestore del usuario (para enviarle notifs desde el webhook)
        const saved = _profile.fcmToken;
        if (saved !== fcmToken) {
            await updateDoc(doc(db, "users", _user.uid), { fcmToken });
            _profile.fcmToken = fcmToken;
        }

        // Escuchar mensajes cuando la app está en primer plano
        if (onMessage) {
            onMessage(messaging, (payload) => {
                const title = payload.notification?.title || "Steel & Deco";
                const body  = payload.notification?.body  || "";
                showNotificationBanner(title, body, payload.data);
                // Recargar créditos si es una notif de pago
                if (payload.data?.type === "credits" || payload.data?.type === "installer_plan") {
                    reloadProfile();
                }
            });
        }
    } catch(e) {
        console.log("FCM init error (normal en dev sin HTTPS):", e.message);
    }
}

async function reloadProfile() {
    if (!_user) return;
    _profile = await loadOrCreateProfile(_user);
    updateHeader();
}

// Banner de notificación in-app (para cuando la app está abierta)
function showNotificationBanner(title, body, data) {
    const existing = document.getElementById("notifBanner");
    if (existing) existing.remove();

    const icon = data?.type === "credits" ? "⚡" :
                 data?.type === "installer_plan" ? "⭐" : "🔔";

    const el = document.createElement("div");
    el.id = "notifBanner";
    el.style.cssText = `
        position:fixed; top:80px; left:50%; transform:translateX(-50%) translateY(-20px);
        background:white; border-radius:20px; padding:14px 18px;
        box-shadow:0 8px 32px rgba(0,0,0,.18); z-index:9999;
        display:flex; align-items:center; gap:12px; min-width:280px; max-width:340px;
        border:1.5px solid #e2e8f0; opacity:0; transition:all .35s cubic-bezier(.34,1.56,.64,1);
    `;
    el.innerHTML = `
        <div style="width:40px;height:40px;background:linear-gradient(135deg,#064e3b,#10b981);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${icon}</div>
        <div style="flex:1;min-width:0">
            <p style="font-weight:700;font-size:13px;color:#1e293b;margin:0 0 2px">${title}</p>
            <p style="font-size:12px;color:#64748b;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${body}</p>
        </div>
        <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:16px;padding:4px;flex-shrink:0">✕</button>
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => {
        el.style.opacity = "1";
        el.style.transform = "translateX(-50%) translateY(0)";
    });
    setTimeout(() => {
        el.style.opacity = "0";
        el.style.transform = "translateX(-50%) translateY(-12px)";
        setTimeout(() => el.remove(), 350);
    }, 5000);
}

// ══════════════════════════════════════════════════════
// PANTALLA DE ESPERA POST-PAGO + POLLING DE VERIFICACIÓN
// ══════════════════════════════════════════════════════
let _pollInterval = null;

function showPaymentWaiting(paymentId, pack) {
    closeModals();
    const existing = document.getElementById("paymentWaitModal");
    if (existing) existing.remove();

    const isInstaller = pack?.type === "installer_plan";
    const icon  = isInstaller ? "⭐" : "⚡";
    const title = isInstaller ? "Activando tu suscripción" : "Acreditando créditos";
    const sub   = isInstaller
        ? "Estás a un paso de ser Instalador Destacado"
        : `${pack?.credits || ""} créditos en camino`;

    const el = document.createElement("div");
    el.id = "paymentWaitModal";
    el.className = "modal-overlay open";
    el.style.zIndex = "9998";
    el.innerHTML = `
    <div class="modal-box" style="text-align:center;padding:32px 24px">
        <!-- Animación -->
        <div id="pwIcon" style="
            width:72px;height:72px;border-radius:50%;margin:0 auto 20px;
            background:linear-gradient(135deg,#064e3b,#10b981);
            display:flex;align-items:center;justify-content:center;
            font-size:30px;
            animation:pwPulse 1.5s ease-in-out infinite;
        ">${icon}</div>

        <h3 style="font-weight:800;font-size:18px;color:#1e293b;margin:0 0 8px" id="pwTitle">${title}</h3>
        <p style="font-size:13px;color:#64748b;margin:0 0 28px" id="pwSub">${sub}</p>

        <!-- Barra de progreso animada -->
        <div style="height:4px;background:#f1f5f9;border-radius:99px;overflow:hidden;margin-bottom:12px">
            <div id="pwBar" style="height:100%;background:linear-gradient(90deg,#10b981,#064e3b);border-radius:99px;width:15%;transition:width 1s ease"></div>
        </div>
        <p style="font-size:11px;color:#94a3b8;margin:0 0 24px" id="pwStep">Verificando tu pago con MercadoPago...</p>

        <!-- Pasos visuales -->
        <div style="display:flex;justify-content:center;gap:8px;margin-bottom:28px" id="pwSteps">
            <div class="pw-step active" data-step="0">
                <div class="pw-dot"></div>
                <span>Pago</span>
            </div>
            <div class="pw-sep">─────</div>
            <div class="pw-step" data-step="1">
                <div class="pw-dot"></div>
                <span>Verificando</span>
            </div>
            <div class="pw-sep">─────</div>
            <div class="pw-step" data-step="2">
                <div class="pw-dot"></div>
                <span>¡Listo!</span>
            </div>
        </div>

        <p style="font-size:11px;color:#cbd5e1" id="pwTimer">Esto tarda unos segundos...</p>
        <button onclick="cancelPaymentWait()" style="
            margin-top:16px;background:none;border:none;color:#94a3b8;
            font-size:12px;cursor:pointer;text-decoration:underline
        ">Verificar más tarde</button>
    </div>

    <style>
        @keyframes pwPulse{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(16,185,129,.4)}50%{transform:scale(1.06);box-shadow:0 0 0 12px rgba(16,185,129,0)}}
        @keyframes pwSpin{to{transform:rotate(360deg)}}
        .pw-step{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:10px;font-weight:600;color:#94a3b8;transition:color .3s}
        .pw-step.active{color:#064e3b}
        .pw-step.done{color:#10b981}
        .pw-dot{width:10px;height:10px;border-radius:50%;background:#e2e8f0;transition:all .3s}
        .pw-step.active .pw-dot{background:#064e3b;box-shadow:0 0 0 3px rgba(6,78,59,.15)}
        .pw-step.done .pw-dot{background:#10b981}
        .pw-sep{color:#e2e8f0;font-size:10px;align-self:center;margin-top:-12px}
    </style>
    `;
    document.body.appendChild(el);

    // Iniciar polling
    startPaymentPolling(paymentId, pack);
}

function setPaymentStep(step, stepText, barPct) {
    document.getElementById("pwStep").textContent = stepText;
    document.getElementById("pwBar").style.width  = barPct + "%";
    document.querySelectorAll(".pw-step").forEach((el, i) => {
        el.classList.remove("active","done");
        if (i < step)  el.classList.add("done");
        if (i === step) el.classList.add("active");
    });
}

async function startPaymentPolling(paymentId, pack) {
    let attempts  = 0;
    const maxWait = 90; // segundos máx de espera
    const start   = Date.now();

    // Paso 1: animación inicial
    await sleep(1200);
    setPaymentStep(1, "Confirmando con MercadoPago...", 40);

    _pollInterval = setInterval(async () => {
        attempts++;
        const elapsed = Math.round((Date.now() - start) / 1000);
        document.getElementById("pwTimer").textContent =
            elapsed < 10 ? "Esto tarda unos segundos..." :
            elapsed < 30 ? `Procesando... (${elapsed}s)` :
            `Casi listo... (${elapsed}s)`;

        if (elapsed > maxWait) {
            clearInterval(_pollInterval);
            setPaymentFailed("Tiempo de espera agotado. Si pagaste, tus créditos se acreditarán en minutos.");
            return;
        }

        try {
            // Opción A: verificar via Netlify Function (si está deployado)
            const netlifyUrl = `/.netlify/functions/verify-payment?paymentId=${paymentId}&uid=${_user?.uid}`;
            const res = await fetch(netlifyUrl);

            if (res.ok) {
                const data = await res.json();
                if (data.credited) {
                    clearInterval(_pollInterval);
                    // Recargar perfil desde Firestore
                    _profile = await loadOrCreateProfile(_user);
                    updateHeader();
                    setPaymentSuccess(pack, data);
                    return;
                }
                if (data.mpStatus === "rejected") {
                    clearInterval(_pollInterval);
                    setPaymentFailed("El pago fue rechazado por MercadoPago.");
                    return;
                }
            } else {
                // Opción B: verificar directo en Firestore (sin backend)
                await pollFirestoreCredits(paymentId, pack, attempts);
            }
        } catch(e) {
            // Si falla el fetch (dev mode, sin netlify), verificar Firestore directo
            await pollFirestoreCredits(paymentId, pack, attempts);
        }
    }, 3000); // cada 3 segundos
}

// Polling directo a Firestore como fallback
async function pollFirestoreCredits(paymentId, pack, attempts) {
    if (!_user) return;
    const snap = await getDoc(doc(db, "users", _user.uid));
    const fresh = snap.data();
    if (!fresh) return;

    // Si lastPaymentId coincide, el webhook ya lo procesó
    if (fresh.lastPaymentId === String(paymentId)) {
        clearInterval(_pollInterval);
        _profile = fresh;
        updateHeader();
        setPaymentSuccess(pack, { credits: fresh.credits });
    }
    // Fallback: si créditos aumentaron respecto al estado local anterior
    else if (fresh.credits > (_profile?.credits || 0) && attempts >= 3) {
        clearInterval(_pollInterval);
        _profile = fresh;
        updateHeader();
        setPaymentSuccess(pack, { credits: fresh.credits });
    }
}

function setPaymentSuccess(pack, data) {
    const isInstaller = pack?.type === "installer_plan";
    const el = document.getElementById("paymentWaitModal");
    if (!el) return;

    const icon  = isInstaller ? "⭐" : "✅";
    const title = isInstaller ? "¡Ya sos Instalador Destacado!" : "¡Créditos acreditados!";
    const body  = isInstaller
        ? "Aparecés primero en el directorio con tu tarjeta premium"
        : `Ahora tenés ${data.credits ?? ""} créditos disponibles ⚡`;

    // Cambiar animación a éxito
    document.getElementById("pwIcon").style.animation = "none";
    document.getElementById("pwIcon").style.background = "linear-gradient(135deg,#065f46,#10b981)";
    document.getElementById("pwIcon").textContent = icon;
    document.getElementById("pwTitle").textContent = title;
    document.getElementById("pwSub").textContent   = body;
    document.getElementById("pwStep").textContent  = "";
    document.getElementById("pwTimer").textContent = "";
    document.getElementById("pwBar").style.width   = "100%";
    setPaymentStep(2, "", 100);

    // Botón cerrar
    el.querySelector("button").remove();
    const box = el.querySelector(".modal-box");
    const btn = document.createElement("button");
    btn.textContent = "¡Genial, gracias!";
    btn.style.cssText = `
        margin-top:20px;width:100%;background:linear-gradient(135deg,#064e3b,#059669);
        color:white;border:none;border-radius:16px;padding:14px;font-size:14px;
        font-weight:800;cursor:pointer;transition:transform .15s;
    `;
    btn.onmousedown = () => btn.style.transform = "scale(.97)";
    btn.onmouseup   = () => btn.style.transform = "";
    btn.onclick     = () => { el.remove(); };
    box.appendChild(btn);

    // Vibración de éxito
    if (navigator.vibrate) navigator.vibrate([50, 30, 80]);
    // Notif in-app
    showNotificationBanner("¡Pago confirmado! " + icon, body, { type: pack?.type });
}

function setPaymentFailed(msg) {
    const el = document.getElementById("paymentWaitModal");
    if (!el) return;
    document.getElementById("pwIcon").style.animation = "none";
    document.getElementById("pwIcon").style.background = "#fef2f2";
    document.getElementById("pwIcon").textContent = "❌";
    document.getElementById("pwTitle").textContent = "Algo salió mal";
    document.getElementById("pwSub").textContent   = msg;
    document.getElementById("pwStep").textContent  = "";
    document.getElementById("pwBar").style.background = "#ef4444";
    document.getElementById("pwBar").style.width = "100%";
    const btn = el.querySelector("button");
    if (btn) { btn.textContent = "Cerrar"; btn.onclick = () => el.remove(); }
}

function cancelPaymentWait() {
    clearInterval(_pollInterval);
    document.getElementById("paymentWaitModal")?.remove();
    showToast("⏳ Verificá tus créditos en unos minutos");
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function showToast(msg){
    const t=document.getElementById("globalToast");if(!t)return;
    t.textContent=msg;t.classList.add("show");
    if(navigator.vibrate)navigator.vibrate(40);
    clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove("show"),3200);
}
