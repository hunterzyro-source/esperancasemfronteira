const menuToggle = document.getElementById("menuToggle");
const nav = document.getElementById("nav");
const amountButtons = [...document.querySelectorAll(".amounts button")];
const customAmount = document.getElementById("customAmount");
const donateBtn = document.getElementById("donateBtn");
const modalLayer = document.getElementById("modalLayer");
const modalClose = document.getElementById("modalClose");
const modalOk = document.getElementById("modalOk");
const modalAmount = document.getElementById("modalAmount");
const modalMessage = document.getElementById("modalMessage");
const pixResult = document.getElementById("pixResult");
const pixCode = document.getElementById("pixCode");
const pixQr = document.getElementById("pixQr");
const pixState = document.getElementById("pixState");
const paymentNote = document.getElementById("paymentNote");
let chosenAmount = 25;
let activeTransaction = null;
let statusTimer = null;

function currency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function chooseAmount(button) {
  chosenAmount = Number(button.dataset.amount);
  amountButtons.forEach((item) => {
    const active = item === button;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  });
  // Preenche o campo com o valor selecionado para o usuário ver
  customAmount.value = chosenAmount;
}

amountButtons.forEach((button) => {
  button.setAttribute("aria-pressed", String(Number(button.dataset.amount) === chosenAmount));
  button.addEventListener("click", () => chooseAmount(button));
});

customAmount.addEventListener("input", () => {
  amountButtons.forEach((button) => {
    button.classList.remove("active");
    button.setAttribute("aria-pressed", "false");
  });
  if (Number(customAmount.value) > 0) chosenAmount = Number(customAmount.value);
});

function showMessage(message) {
  modalMessage.textContent = message;
  modalAmount.textContent = currency(chosenAmount);
  modalLayer.hidden = false;
  document.body.style.overflow = "hidden";
  modalOk.focus();
}

function closeModal() {
  modalLayer.hidden = true;
  document.body.style.overflow = "";
  donateBtn.focus();
}

function setBusy(busy) {
  donateBtn.disabled = busy;
  donateBtn.innerHTML = busy ? "Gerando Pix…" : 'Gerar Pix <span>→</span>';
}

donateBtn.addEventListener("click", async () => {
  // Prioridade: botão fixo ativo > campo livre > chosenAmount já definido
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
  setBusy(true);
  paymentNote.textContent = "Conectando ao pagamento seguro…";
  try {
    const response = await fetch("/api/donations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: chosenAmount, name, email }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível criar o Pix agora.");
    if (!data.paymentCode || !data.idTransaction) throw new Error("O gateway não devolveu os dados esperados para o Pix.");
    pixCode.value = data.paymentCode;
    pixResult.hidden = false;
    pixState.textContent = "Pix criado · aguardando pagamento";
    if (data.paymentCodeBase64) {
      pixQr.src = `data:image/png;base64,${data.paymentCodeBase64}`;
      pixQr.hidden = false;
    } else {
      pixQr.hidden = true;
      pixQr.removeAttribute("src");
    }
    activeTransaction = data.idTransaction;
    paymentNote.textContent = "Use o código Pix no aplicativo do seu banco. A confirmação será atualizada aqui.";
    pixResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
    watchPayment();
  } catch (error) {
    showMessage(error.message || "Não foi possível criar sua cobrança. Tente novamente em instantes.");
    paymentNote.textContent = "Se o problema continuar, tente novamente mais tarde.";
  } finally {
    setBusy(false);
  }
});

document.getElementById("copyPix").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(pixCode.value);
    document.getElementById("copyPix").textContent = "Código copiado";
  } catch {
    pixCode.select();
    document.execCommand("copy");
    document.getElementById("copyPix").textContent = "Código copiado";
  }
});

async function watchPayment() {
  clearTimeout(statusTimer);
  if (!activeTransaction) return;
  try {
    const response = await fetch(`/api/donations/${encodeURIComponent(activeTransaction)}`);
    const data = await response.json();
    if (response.ok && data.status === "PAID_OUT") {
      pixState.textContent = "Pagamento confirmado · obrigado pela contribuição!";
      paymentNote.textContent = "Pagamento confirmado. Obrigado pela contribuição!";
      activeTransaction = null;
      return;
    }
    if (response.ok && ["EXPIRED", "FAILED", "REFUNDED"].includes(data.status)) {
      pixState.textContent = "Esta cobrança não está mais disponível. Gere um novo Pix para contribuir.";
      activeTransaction = null;
      return;
    }
  } catch { /* A próxima consulta tenta novamente sem interromper o checkout. */ }
  statusTimer = setTimeout(watchPayment, 15000);
}

modalClose.addEventListener("click", closeModal);
modalOk.addEventListener("click", closeModal);
modalLayer.addEventListener("click", (event) => {
  if (event.target === modalLayer) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modalLayer.hidden) closeModal();
});

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

    // Verifica se existe um botão de valor fixo correspondente
    const match = amountButtons.find((btn) => Number(btn.dataset.amount) === preset);
    if (match) {
      chooseAmount(match);
    } else {
      // Valor não está nos botões fixos — coloca no campo livre
      amountButtons.forEach((btn) => {
        btn.classList.remove("active");
        btn.setAttribute("aria-pressed", "false");
      });
      customAmount.value = preset;
      chosenAmount = preset;
    }
  });
});
(function () {
  const track = document.getElementById("partnersTrack");
  if (!track) return;
  track.addEventListener("focusin", () => { track.style.animationPlayState = "paused"; });
  track.addEventListener("focusout", () => { track.style.animationPlayState = "running"; });
  track.addEventListener("touchstart", () => { track.style.animationPlayState = "paused"; }, { passive: true });
  track.addEventListener("touchend", () => { setTimeout(() => { track.style.animationPlayState = "running"; }, 2000); }, { passive: true });
})();
