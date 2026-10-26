const menuToggle = document.getElementById("menuToggle");
const nav = document.getElementById("nav");
const amountButtons = [...document.querySelectorAll(".amounts button")];
const customAmount = document.getElementById("customAmount");
const donateBtn = document.getElementById("donateBtn");
const paymentNote = document.getElementById("paymentNote");

// Modal
const modalLayer    = document.getElementById("modalLayer");
const modalClose    = document.getElementById("modalClose");
const modalClose2   = document.getElementById("modalClose2");
const modalOk       = document.getElementById("modalOk");

// Telas do modal
const stepGenerating = document.getElementById("stepGenerating");
const stepQr         = document.getElementById("stepQr");
const stepThanks     = document.getElementById("stepThanks");

// Elementos de conteúdo
const modalAmount     = document.getElementById("modalAmount");
const modalAmountQr   = document.getElementById("modalAmountQr");
const modalAmountThanks = document.getElementById("modalAmountThanks");
const modalMessage    = document.getElementById("modalMessage");
const pixCode         = document.getElementById("pixCode");
const pixQr           = document.getElementById("pixQr");
const pixState        = document.getElementById("pixState");

let chosenAmount = 25;
let activeTransaction = null;
let statusTimer = null;

function currency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

// Troca para uma das 3 telas do modal
function showStep(step) {
  [stepGenerating, stepQr, stepThanks].forEach((s) => { s.hidden = s !== step; });
}

function openModal() {
  modalLayer.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modalLayer.hidden = true;
  document.body.style.overflow = "";
  clearTimeout(statusTimer);
  activeTransaction = null;
  donateBtn.focus();
}

// Preenche campo e marca botão ao clicar num valor predefinido
function chooseAmount(button) {
  chosenAmount = Number(button.dataset.amount);
  amountButtons.forEach((item) => {
    const active = item === button;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  });
  customAmount.value = chosenAmount;
}

amountButtons.forEach((button) => {
  button.setAttribute("aria-pressed", String(Number(button.dataset.amount) === chosenAmount));
  button.addEventListener("click", () => chooseAmount(button));
});

customAmount.addEventListener("input", () => {
  amountButtons.forEach((btn) => {
    btn.classList.remove("active");
    btn.setAttribute("aria-pressed", "false");
  });
  if (Number(customAmount.value) > 0) chosenAmount = Number(customAmount.value);
});

function setBusy(busy) {
  donateBtn.disabled = busy;
  donateBtn.innerHTML = busy ? "Gerando Pix…" : 'Gerar Pix <span>→</span>';
}

donateBtn.addEventListener("click", async () => {
  // Prioridade: botão ativo > campo livre
  const activeBtn = amountButtons.find((btn) => btn.classList.contains("active"));
  if (activeBtn) {
    chosenAmount = Number(activeBtn.dataset.amount);
  } else {
    const rawAmount = customAmount.value.trim();
    if (rawAmount) chosenAmount = Number(rawAmount.replace(",", "."));
  }

  if (!Number.isFinite(chosenAmount) || chosenAmount < 5 || chosenAmount > 10000) {
    customAmount.setCustomValidity("Digite um valor entre R$ 5 e R$ 10.000.");
    customAmount.reportValidity();
    customAmount.setCustomValidity("");
    return;
  }

  const name = document.getElementById("donorName").value.trim();
  const email = document.getElementById("donorEmail").value.trim();
  if (name.length < 2) {
    document.getElementById("donorName").setCustomValidity("Informe seu nome para identificar a contribuição.");
    document.getElementById("donorName").reportValidity();
    document.getElementById("donorName").setCustomValidity("");
    return;
  }

  // Abre modal na tela de "gerando"
  const formatted = currency(chosenAmount);
  modalAmount.textContent = formatted;
  modalAmountQr.textContent = formatted;
  modalAmountThanks.textContent = formatted;
  if (modalMessage) modalMessage.textContent = "Aguarde, gerando seu Pix…";
  showStep(stepGenerating);
  openModal();
  setBusy(true);

  try {
    const response = await fetch("/api/donations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: chosenAmount, name, email }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível criar o Pix agora.");
    if (!data.paymentCode || !data.idTransaction) throw new Error("O gateway não devolveu os dados esperados para o Pix.");

    // Preenche e exibe tela do QR
    pixCode.value = data.paymentCode;
    pixState.textContent = "Aguardando pagamento…";
    if (data.paymentCodeBase64) {
      pixQr.src = `data:image/png;base64,${data.paymentCodeBase64}`;
      pixQr.hidden = false;
    } else {
      pixQr.hidden = true;
      pixQr.removeAttribute("src");
    }
    activeTransaction = data.idTransaction;
    showStep(stepQr);
    watchPayment();
  } catch (error) {
    // Mostra erro na tela de geração
    if (modalMessage) modalMessage.textContent = error.message || "Não foi possível criar sua cobrança. Tente novamente.";
    paymentNote.textContent = "Se o problema continuar, tente novamente mais tarde.";
  } finally {
    setBusy(false);
  }
});

// Copiar código Pix
document.getElementById("copyPix").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(pixCode.value);
    document.getElementById("copyPix").textContent = "✓ Código copiado!";
    setTimeout(() => { document.getElementById("copyPix").textContent = "Copiar código Pix"; }, 2500);
  } catch {
    pixCode.select();
    document.execCommand("copy");
    document.getElementById("copyPix").textContent = "✓ Código copiado!";
    setTimeout(() => { document.getElementById("copyPix").textContent = "Copiar código Pix"; }, 2500);
  }
});

// Polling de status — ao confirmar, vai para tela de agradecimento
async function watchPayment() {
  clearTimeout(statusTimer);
  if (!activeTransaction) return;
  try {
    const response = await fetch(`/api/donations/${encodeURIComponent(activeTransaction)}`);
    const data = await response.json();
    if (response.ok && data.status === "PAID_OUT") {
      pixState.textContent = "Pagamento confirmado!";
      activeTransaction = null;
      showStep(stepThanks);
      return;
    }
    if (response.ok && ["EXPIRED", "FAILED", "REFUNDED"].includes(data.status)) {
      pixState.textContent = "Esta cobrança expirou. Feche e gere um novo Pix.";
      activeTransaction = null;
      return;
    }
  } catch { /* tenta novamente na próxima rodada */ }
  statusTimer = setTimeout(watchPayment, 15000);
}

// Fechar modal
[modalClose, modalClose2, modalOk].forEach((btn) => {
  if (btn) btn.addEventListener("click", closeModal);
});
modalLayer.addEventListener("click", (e) => { if (e.target === modalLayer) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modalLayer.hidden) closeModal(); });

// Menu mobile
menuToggle.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
});
nav.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    nav.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Abrir menu");
  });
});

document.getElementById("year").textContent = new Date().getFullYear();

// Botões "Doe agora" das cestas — pré-seleciona o valor no formulário
document.querySelectorAll(".basket-btn[data-preset]").forEach((link) => {
  link.addEventListener("click", () => {
    const preset = Number(link.dataset.preset);
    if (!preset) return;
    const match = amountButtons.find((btn) => Number(btn.dataset.amount) === preset);
    if (match) {
      chooseAmount(match);
    } else {
      amountButtons.forEach((btn) => { btn.classList.remove("active"); btn.setAttribute("aria-pressed", "false"); });
      customAmount.value = preset;
      chosenAmount = preset;
    }
  });
});

// Parceiros — pausa autoplay no foco/toque
(function () {
  const track = document.getElementById("partnersTrack");
  if (!track) return;
  track.addEventListener("focusin", () => { track.style.animationPlayState = "paused"; });
  track.addEventListener("focusout", () => { track.style.animationPlayState = "running"; });
  track.addEventListener("touchstart", () => { track.style.animationPlayState = "paused"; }, { passive: true });
  track.addEventListener("touchend", () => { setTimeout(() => { track.style.animationPlayState = "running"; }, 2000); }, { passive: true });
})();
