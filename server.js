const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.join(__dirname, "public");
const port = Number(process.env.PORT || 3000);
const baseUrl = "https://app.lofypay.com/api/v1";
const mimeTypes = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function readBody(req, limit = 16_000) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > limit) reject(new Error("Corpo da requisição muito grande."));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function configuredSplit() {
  if (!process.env.LOFYPAY_SPLIT) return undefined;
  let split;
  try { split = JSON.parse(process.env.LOFYPAY_SPLIT); } catch { throw new Error("LOFYPAY_SPLIT precisa conter uma lista JSON válida."); }
  if (!Array.isArray(split) || split.length > 10) throw new Error("LOFYPAY_SPLIT precisa ser uma lista de até 10 recebedores.");
  const ids = new Set();
  for (const entry of split) {
    if (!entry || !/^usr_[A-Za-z0-9_-]+$/.test(entry.accountId || "") || ids.has(entry.accountId)) throw new Error("Confira os accountId únicos de LOFYPAY_SPLIT.");
    ids.add(entry.accountId);
    const hasPercent = Object.hasOwn(entry, "percentage");
    const hasAmount = Object.hasOwn(entry, "amount");
    if (hasPercent === hasAmount) throw new Error("Cada recebedor do split deve informar percentage ou amount, mas não ambos.");
    if (hasPercent && (!Number.isFinite(entry.percentage) || entry.percentage <= 0 || entry.percentage > 100 || Math.round(entry.percentage * 100) !== entry.percentage * 100)) throw new Error("Percentual de split inválido.");
    if (hasAmount && (!Number.isInteger(entry.amount) || entry.amount <= 0)) throw new Error("Valor fixo de split deve ser informado em centavos inteiros.");
  }
  if (split.reduce((total, entry) => total + (entry.percentage || 0), 0) > 100) throw new Error("A soma dos percentuais do split não pode superar 100%.");
  return split;
}

async function gateway(pathname, body) {
  const key = process.env.LOFYPAY_SECRET;
  if (!key || !/^sk_(test|live)_/.test(key)) throw new Error("O recebimento ainda não está configurado. Tente novamente mais tarde.");
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  let data;
  try { data = await response.json(); } catch { throw new Error("Resposta inválida do serviço de pagamento."); }
  if (!response.ok || ["error", "ERROR"].includes(data.status)) {
    const message = typeof data.message === "string" ? data.message : "O serviço de pagamento recusou a solicitação.";
    throw new Error(message);
  }
  return data;
}

function verifyWebhook(rawBody, signature) {
  const secret = process.env.LOFYPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const fields = Object.fromEntries(signature.split(",").map((part) => part.trim().split("=")));
  const timestamp = Number(fields.t);
  const given = fields.v1 || "";
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300 || !/^[a-f0-9]{64}$/i.test(given)) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  const supplied = Buffer.from(given, "hex");
  return supplied.length === expected.length && crypto.timingSafeEqual(expected, supplied);
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (req.method === "POST" && url.pathname === "/api/donations") {
    let input;
    try { input = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: "Confira os dados informados." }); }
    if (!input || typeof input !== "object" || Array.isArray(input)) return json(res, 400, { error: "Confira os dados informados." });
    const amount = Number(input.amount);
    const name = typeof input.name === "string" ? input.name.trim().slice(0, 120) : "";
    const email = typeof input.email === "string" ? input.email.trim().slice(0, 160) : "";
    if (!Number.isFinite(amount) || amount < 5 || amount > 10000 || !name || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      return json(res, 400, { error: "Informe um valor entre R$ 5 e R$ 10.000, um nome e um e-mail válido, se desejar recebê-lo." });
    }
    try {
      const split = configuredSplit();
      const body = {
        amount: Math.round(amount * 100) / 100,
        method: "pix",
        external_reference: `ESF-${crypto.randomUUID()}`,
        client: { name, ...(email ? { email } : {}) },
        ...(split?.length ? { split } : {}),
      };
      const data = await gateway("/gateway", body);
      if (!["success", "OK"].includes(data.status) || !data.paymentCode || !data.idTransaction) {
        return json(res, 502, { error: "O serviço de pagamento não conseguiu gerar o Pix. Tente novamente." });
      }
      return json(res, 201, { paymentCode: data.paymentCode, paymentCodeBase64: data.paymentCodeBase64, idTransaction: data.idTransaction });
    } catch (error) {
      const safeMessages = ["O recebimento ainda não está configurado. Tente novamente mais tarde.", "LOFYPAY_SPLIT precisa conter uma lista JSON válida.", "LOFYPAY_SPLIT precisa ser uma lista de até 10 recebedores.", "Confira os accountId únicos de LOFYPAY_SPLIT.", "Cada recebedor do split deve informar percentage ou amount, mas não ambos.", "Percentual de split inválido.", "Valor fixo de split deve ser informado em centavos inteiros."];
      return json(res, 502, { error: safeMessages.includes(error.message) ? error.message : "Não foi possível criar o Pix. Verifique a configuração do gateway e tente novamente." });
    }
  }
  const statusMatch = req.method === "GET" && url.pathname.match(/^\/api\/donations\/([A-Za-z0-9_-]+)$/);
  if (statusMatch) {
    try {
      const data = await gateway("/status", { idtransaction: statusMatch[1] });
      return json(res, 200, { status: data.status });
    } catch {
      return json(res, 502, { error: "Não foi possível consultar o status do pagamento." });
    }
  }
  if (req.method === "POST" && url.pathname === "/webhooks/lofypay") {
    const rawBody = await readBody(req, 128_000);
    if (!verifyWebhook(rawBody, req.headers["x-lofypay-signature"])) return json(res, 401, { error: "Assinatura inválida." });
    return json(res, 200, { received: true });
  }
  if (req.method !== "GET" && req.method !== "HEAD") return json(res, 404, { error: "Rota não encontrada." });
  const requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.resolve(root, `.${requested}`);
  if (!filePath.startsWith(`${root}${path.sep}`)) return json(res, 403, { error: "Acesso negado." });
  fs.readFile(filePath, (error, contents) => {
    if (error) return json(res, 404, { error: "Arquivo não encontrado." });
    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream", "X-Content-Type-Options": "nosniff" });
    res.end(req.method === "HEAD" ? undefined : contents);
  });
}

function app(req, res) {
  return handle(req, res).catch(() => json(res, 500, { error: "Ocorreu um erro ao processar sua solicitação." }));
}

if (require.main === module) {
  http.createServer(app).listen(port, () => console.log(`Esperança Sem Fronteiras disponível na porta ${port}.`));
}

module.exports = app;
