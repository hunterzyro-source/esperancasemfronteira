# Esperança Sem Fronteiras

Site institucional em HTML, CSS e JavaScript com servidor Node.js para criar cobranças Pix pela API da LofyPay.

## Iniciar

Requer Node.js 20.6 ou superior. Copie `.env.example` para `.env`, configure `LOFYPAY_SECRET` com uma chave de sandbox `sk_test_` enquanto prepara a integração e execute `npm start`. O site fica disponível em `http://localhost:3000`.

Use a chave `sk_live_` apenas no ambiente de produção protegido do servidor, depois de concluir a validação no sandbox. Nunca coloque uma chave `sk_` no HTML, JavaScript do navegador ou repositório.

## LofyPay

- O servidor cria cobranças Pix em `/api/donations` e consulta a confirmação em `/api/donations/:id`.
- O valor é validado no navegador e novamente no servidor. O checkout não coleta CPF.
- Para ativar split, solicite a liberação à LofyPay e defina `LOFYPAY_SPLIT` como uma lista JSON de contas recebedoras válidas. Cada recebedor usa `percentage` ou `amount` (em centavos), nunca os dois. O split é opcional e não é enviado enquanto essa variável estiver ausente.
- O endpoint `/webhooks/lofypay` valida o HMAC usando `LOFYPAY_WEBHOOK_SECRET`. Cadastre a URL HTTPS pública desse endpoint na área de webhooks da LofyPay.

## Antes de divulgar

As chaves que foram compartilhadas durante a configuração devem ser revogadas e recriadas no painel LofyPay. Configure as novas credenciais apenas no ambiente privado de hospedagem. Use sandbox para validar o fluxo antes de trocar para produção.

Complete o site com a razão social, CNPJ, endereço, contato oficial, documentação da organização, objetivo e orçamento da campanha, parceiros e relatórios de execução. Não publique dados pessoais de doadores no painel público.
