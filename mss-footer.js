// ============================================================
// MSS Footer — agregar al final del renderLayout() en layout.js
// O pegar el HTML directamente antes del cierre </body> en cada página
// ============================================================

// BUILD — actualizar con cada release
const APP_BUILD = "1.0.0 (build 1)";

// Insertar footer MSS en el DOM
function injectMSSFooter() {
  // Evitar duplicados
  if (document.getElementById("mss-footer")) return;

  const footer = document.createElement("div");
  footer.id = "mss-footer";
  footer.innerHTML = `
    <style>
      #mss-footer {
        text-align: center;
        padding: 10px 16px 18px;
        font-family: 'Plus Jakarta Sans', sans-serif;
      }
      #mss-footer .mss-line {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 10px;
        color: #94a3b8;
        font-weight: 600;
        letter-spacing: 0.02em;
      }
      #mss-footer .mss-dot {
        width: 3px;
        height: 3px;
        border-radius: 50%;
        background: #cbd5e1;
      }
      #mss-footer .mss-brand {
        color: #64748b;
        font-weight: 700;
      }
    </style>
    <div class="mss-line">
      <span>v${APP_BUILD}</span>
      <span class="mss-dot"></span>
      <span>Desarrollado por <span class="mss-brand">MSS</span></span>
    </div>
  `;

  // Insertar antes del cierre del body (por encima del nav si lo hay)
  const nav = document.querySelector(".glass-nav") || document.querySelector("nav");
  if (nav) {
    nav.insertAdjacentElement("beforebegin", footer);
  } else {
    document.body.appendChild(footer);
  }
}

// Ejecutar cuando el DOM esté listo
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectMSSFooter);
} else {
  injectMSSFooter();
}
