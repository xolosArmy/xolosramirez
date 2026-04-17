/**
 * Landing Teyolia MVP
 * Frontend sin dependencias. Ajustar configuración antes de producción.
 * Hooks futuros de backend:
 * - /api/verify-xec-tx
 * - /api/support-feed
 * - /api/applicant-status
 * - /api/nft-eligibility
 */

const CONFIG = {
  puppy: {
    name: "Atemoztli Ramírez",
    size: "Miniatura",
    color: "Negro obsidiana",
    birthDate: "2026-02-11",
    healthStatus: "Esquema inicial al día · revisión integral favorable",
    deliveryDate: "2026-07-15 (estimada, sujeta a evaluación final)",
    personality: "Curioso, sereno y atento al vínculo humano",
    lineageStory:
      "Descendiente de línea registrada con foco en salud, temple y preservación cultural.",
    imageUrl: "https://placehold.co/900x1100/121212/C6A56B?text=Imagen+principal+del+cachorro"
  },
  campaign: {
    goalXec: 400000000,
    depositXec: 50000000,
    deadline: "2026-08-30", // Placeholder editable
    pilotCode: "PILOTO-001",
    budgetBreakdown: [
      { label: "Crianza", amountXec: 90000000 },
      { label: "Cuidados", amountXec: 60000000 },
      { label: "Vacunas", amountXec: 35000000 },
      { label: "Registro", amountXec: 30000000 },
      { label: "Certificados", amountXec: 25000000 },
      { label: "Logística", amountXec: 45000000 },
      { label: "Conservación del linaje", amountXec: 70000000 },
      { label: "Documentación cultural", amountXec: 45000000 }
    ]
  },
  wallet: {
    sampleAddress: "https://www.teyolia.cash/campaigns/campaign-1776451063035",
    // Formspree endpoint activo (ID proporcionado: xbdzegwj)
    // Nota: para el piloto actual se reutiliza el mismo endpoint en ambos pasos.
    formspreeStep1: "https://formspree.io/f/xbdzegwj",
    formspreeStep2: "https://formspree.io/f/xbdzegwj"
  },
  aspirants: [
    {
      name: "Andrea M.",
      city: "Puebla, MX",
      statusBand: "Prioridad alta",
      depositStatus: "verificado",
      supportCount: 38,
      excerpt: "Perfil familiar estable y compromiso de acompañamiento veterinario continuo."
    },
    {
      name: "Iker T.",
      city: "Monterrey, MX",
      statusBand: "Prioridad media",
      depositStatus: "pendiente",
      supportCount: 21,
      excerpt: "Disponibilidad diaria alta y experiencia previa con razas de energía sensible."
    },
    {
      name: "Rocío L.",
      city: "Querétaro, MX",
      statusBand: "Activa",
      depositStatus: "verificado",
      supportCount: 14,
      excerpt: "Entorno tranquilo, enfoque en socialización temprana y bienestar sostenido."
    }
  ],
  supportMessages: [
    "TEYOLIA|PILOTO-001|ASP=andrea|POR=hogar_calmo",
    "TGX|P1|ASP:andrea|WHY:cuidado_y_tiempo",
    "TEYOLIA|ASP=andrea|POR=linaje_y_compromiso"
  ],
  nftPlaceholder: {
    claimNote: "Claim placeholder: sujeto a infraestructura posterior, política de elegibilidad y revisión legal."
  },
  legalFlags: {
    privacyNoticeUrl: "#",
    jurisdictionStatus: "Pendiente de definición legal",
    retentionPolicy: "Pendiente de revisión legal"
  }
};

const FAQ_ITEMS = [
  {
    q: "¿Esto es una subasta?",
    a: "No. Esta Teyolia es un proceso curado de guardianía. No hay remate, puja ni competencia de estilo mercado."
  },
  {
    q: "¿La mayor aportación garantiza la asignación?",
    a: "No. La aportación otorga prioridad de consideración, pero no define por sí sola la guardianía final."
  },
  {
    q: "¿Qué pasa si un aspirante no es apto?",
    a: "Se descarta su asignación potencial aunque tenga respaldo. El bienestar del cachorro y la idoneidad del hogar prevalecen."
  },
  {
    q: "¿Qué pasa si ningún aspirante resulta idóneo?",
    a: "La campaña puede declararse desierta. No hay selección forzada cuando no se cumplen criterios de guardianía."
  },
  {
    q: "¿Qué pasa con mi depósito?",
    a: "Se trata conforme a reglas publicadas del piloto. Las condiciones de devolución o saldo deberán informarse de forma explícita."
  },
  {
    q: "¿Cómo funciona el apoyo comunitario?",
    a: "La comunidad respalda con aportaciones y mensajes de trazabilidad. Ese respaldo orienta, pero no obliga la decisión final."
  },
  {
    q: "¿El OP_RETURN es obligatorio?",
    a: "Es recomendado para trazabilidad del apoyo comunitario. Si tu wallet no lo soporta, se puede requerir validación alternativa."
  },
  {
    q: "¿Cómo se protege mi información?",
    a: "La información se usa para evaluación y seguimiento. Se publicará aviso integral de privacidad con reglas formales de tratamiento."
  },
  {
    q: "¿Cuándo se confirma el guardián final?",
    a: "Tras cierre de validación comunitaria, revisión de documentación y evaluación humana final por Xolos Ramírez."
  }
];

const HOW_IT_WORKS = [
  "Presentación pública del cachorro del piloto.",
  "Aportación comunitaria para sostener la Teyolia.",
  "Depósito del aspirante para filtrar seriedad.",
  "Validación comunitaria en bandas referenciales.",
  "Evaluación final de idoneidad por Xolos Ramírez.",
  "Cierre curado y confirmación de guardianía."
];

function formatXec(amount) {
  return `${new Intl.NumberFormat("es-MX").format(amount)} XEC`;
}

function query(id) {
  return document.getElementById(id);
}

function setTextByDataField(field, value) {
  document.querySelectorAll(`[data-field="${field}"]`).forEach((node) => {
    node.textContent = value;
  });
}

function hydrateConfig() {
  setTextByDataField("puppyName", CONFIG.puppy.name);
  setTextByDataField("puppySize", CONFIG.puppy.size);
  setTextByDataField("puppyColor", CONFIG.puppy.color);
  setTextByDataField("birthDate", CONFIG.puppy.birthDate);
  setTextByDataField("healthStatus", CONFIG.puppy.healthStatus);
  setTextByDataField("deliveryDate", CONFIG.puppy.deliveryDate);
  setTextByDataField("personality", CONFIG.puppy.personality);
  setTextByDataField("lineageStory", CONFIG.puppy.lineageStory);
  setTextByDataField("goalXecText", formatXec(CONFIG.campaign.goalXec));
  setTextByDataField("depositXecText", formatXec(CONFIG.campaign.depositXec));
  setTextByDataField("sampleAddress", CONFIG.wallet.sampleAddress);
  setTextByDataField("nftClaimNote", CONFIG.nftPlaceholder.claimNote);

  const image = query("puppy-image");
  if (image) image.src = CONFIG.puppy.imageUrl;

  const formStep1 = query("form-step-1");
  const formStep2 = query("form-step-2");
  if (formStep1) formStep1.action = CONFIG.wallet.formspreeStep1;
  if (formStep2) formStep2.action = CONFIG.wallet.formspreeStep2;
}

function renderBudget() {
  const list = query("budget-list");
  if (!list) return;

  list.innerHTML = "";
  CONFIG.campaign.budgetBreakdown.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `${item.label}: ${formatXec(item.amountXec)}`;
    list.appendChild(li);
  });
}

function renderTimeline() {
  const root = query("how-it-works");
  if (!root) return;

  root.innerHTML = "";
  HOW_IT_WORKS.forEach((step, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>Paso ${idx + 1}.</strong> ${step}`;
    root.appendChild(li);
  });
}

function badgeClassByStatus(status) {
  if (status === "Prioridad alta") return "prioridad-alta";
  if (status === "Prioridad media") return "prioridad-media";
  return "activa";
}

function renderAspirants() {
  const grid = query("aspirants-grid");
  if (!grid) return;

  grid.innerHTML = "";
  CONFIG.aspirants.forEach((aspirant) => {
    const article = document.createElement("article");
    article.className = "card aspirant-card";

    const depositClass = aspirant.depositStatus === "verificado" ? "deposit-ok" : "deposit-pending";
    const depositText =
      aspirant.depositStatus === "verificado" ? "Depósito verificado" : "Depósito pendiente";

    article.innerHTML = `
      <h3>${aspirant.name}</h3>
      <p class="muted">${aspirant.city}</p>
      <div class="status-row">
        <span class="badge ${badgeClassByStatus(aspirant.statusBand)}">${aspirant.statusBand}</span>
        <span class="${depositClass}">${depositText}</span>
      </div>
      <p>${aspirant.excerpt}</p>
      <p class="small muted">Apoyos verificados: ${aspirant.supportCount}</p>
    `;
    grid.appendChild(article);
  });
}

function renderOpReturnExamples() {
  const root = query("opreturn-examples");
  if (!root) return;

  root.innerHTML = "";
  CONFIG.supportMessages.forEach((text, index) => {
    const box = document.createElement("div");
    box.className = "copy-box";
    box.innerHTML = `
      <code id="op-msg-${index}">${text}</code>
      <button type="button" class="btn btn-secondary" data-copy-text="${text}">Copiar ejemplo ${index + 1}</button>
    `;
    root.appendChild(box);
  });
}

function renderFaq() {
  const root = query("faq-accordion");
  if (!root) return;

  root.innerHTML = "";
  FAQ_ITEMS.forEach((item) => {
    const details = document.createElement("details");
    details.innerHTML = `
      <summary>${item.q}</summary>
      <p>${item.a}</p>
    `;
    root.appendChild(details);
  });
}

function attachCopyHandlers() {
  document.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.id === "copy-address") {
      await copyText(CONFIG.wallet.sampleAddress, query("copy-feedback"));
    }

    if (target.matches("[data-copy-text]")) {
      const txt = target.getAttribute("data-copy-text") || "";
      await copyText(txt, query("copy-feedback"));
    }
  });
}

async function copyText(text, feedbackNode) {
  if (!feedbackNode) return;
  try {
    await navigator.clipboard.writeText(text);
    feedbackNode.textContent = "Copiado al portapapeles.";
  } catch {
    feedbackNode.textContent = "No fue posible copiar automáticamente. Copia manualmente el texto.";
  }
}

function isValidTxid(value) {
  return /^[a-f0-9]{64}$/i.test(value);
}

function isSoftValidEcashAddress(value) {
  // Validación soft de UI. No reemplaza validación backend/Chronik.
  return /^ecash:[a-z0-9]{20,}$/i.test(value.trim());
}

function setupTxValidation() {
  const form = query("tx-verify-form");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const txidInput = query("txid-input");
    const senderInput = query("sender-address");
    const txidError = query("txid-error");
    const senderError = query("sender-address-error");
    const feedback = query("txid-feedback");

    if (!txidInput || !txidError || !feedback || !senderInput || !senderError) return;

    txidError.textContent = "";
    senderError.textContent = "";

    const txid = txidInput.value.trim().toLowerCase();
    txidInput.value = txid;

    let isValid = true;

    if (!isValidTxid(txid)) {
      txidError.textContent = "TXID inválido: usa exactamente 64 caracteres hexadecimales.";
      txidInput.setAttribute("aria-invalid", "true");
      isValid = false;
    } else {
      txidInput.setAttribute("aria-invalid", "false");
    }

    const senderAddress = senderInput.value.trim();
    if (senderAddress && !isSoftValidEcashAddress(senderAddress)) {
      senderError.textContent = "Dirección no válida en verificación básica. Debe iniciar con ecash:.";
      senderInput.setAttribute("aria-invalid", "true");
      isValid = false;
    } else {
      senderInput.setAttribute("aria-invalid", "false");
    }

    if (!isValid) {
      feedback.textContent = "Corrige los campos marcados para continuar.";
      return;
    }

    feedback.textContent = "Formato válido en navegador. Pendiente validación definitiva en backend.";

    // Hook futuro (ejemplo):
    // fetch('/api/verify-xec-tx', { method: 'POST', body: JSON.stringify({ txid, senderAddress }) })
    //   .then(...)
  });
}

function setupStepTabs() {
  const tab1 = query("tab-step-1");
  const tab2 = query("tab-step-2");
  const panel1 = query("panel-step-1");
  const panel2 = query("panel-step-2");
  if (!tab1 || !tab2 || !panel1 || !panel2) return;

  const activate = (step) => {
    const isOne = step === 1;
    tab1.classList.toggle("active", isOne);
    tab2.classList.toggle("active", !isOne);
    tab1.setAttribute("aria-selected", String(isOne));
    tab2.setAttribute("aria-selected", String(!isOne));
    panel1.hidden = !isOne;
    panel2.hidden = isOne;
  };

  tab1.addEventListener("click", () => activate(1));
  tab2.addEventListener("click", () => activate(2));
}

function setupFormSubmission(formId, feedbackId) {
  const form = query(formId);
  const feedback = query(feedbackId);
  if (!form || !feedback) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      feedback.textContent = "Completa los campos obligatorios antes de enviar.";
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    const defaultLabel = submitBtn?.getAttribute("data-submit-label") || "Enviar";

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Enviando...";
    }
    feedback.textContent = "Procesando envío...";

    const formData = new FormData(form);

    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: formData
      });

      if (response.ok) {
        feedback.textContent =
          "Envío recibido. Gracias por participar en este proceso de guardianía responsable.";
        form.reset();
        // Hook opcional de analytics:
        // window.dispatchEvent(new CustomEvent('teyolia_form_success', { detail: { formId } }));
      } else {
        feedback.textContent =
          "No fue posible completar el envío en este momento. Intenta de nuevo o usa contacto directo.";
      }
    } catch {
      feedback.textContent =
        "Error de conexión. Como fallback, puedes enviar el formulario con envío tradicional al endpoint configurado.";
      // Fallback opcional: form.submit(); // Descomentar si se prefiere fallback automático.
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = defaultLabel;
      }
    }
  });
}

function init() {
  hydrateConfig();
  renderBudget();
  renderTimeline();
  renderAspirants();
  renderOpReturnExamples();
  renderFaq();
  attachCopyHandlers();
  setupTxValidation();
  setupStepTabs();
  setupFormSubmission("form-step-1", "step1-feedback");
  setupFormSubmission("form-step-2", "step2-feedback");
}

document.addEventListener("DOMContentLoaded", init);
