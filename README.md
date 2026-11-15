# P2 Automações — site e painel

Site público da P2 Automações e painel administrativo privado para CEOs.

- **Sem dependências externas.** Usa só o Node.js (22.13 ou superior): servidor HTTP, banco SQLite (`node:sqlite`), `crypto` e `node:test`. Não há `npm install`.
- **Site público** (`public/`): início, quem somos, serviços, diferenciais, benefícios, contato e botões de WhatsApp. O formulário de contato grava no banco.
- **Painel** (`admin/`): visão geral com indicadores e gráficos, clientes, projetos, vendas, financeiro, tarefas, contatos do site e configurações.

## Como rodar

```bash
cp .env.example .env          # ajuste WHATSAPP_NUMBER e CONTACT_EMAIL
npm run create-ceo -- --name "Seu Nome" --email voce@empresa.com   # pede a senha no terminal
npm start                     # http://127.0.0.1:3000
```

- Painel: `http://127.0.0.1:3000/painel` (leva ao login se não houver sessão). **Não há link para o painel no site público.**
- Testes: `npm test` (49 testes de autenticação, permissões, API, páginas e segurança).
- Redefinir a senha de um CEO: `npm run create-ceo -- --email voce@empresa.com --reset`.
- Sem `WHATSAPP_NUMBER`, os botões de WhatsApp levam ao formulário de contato.

### Dados demonstrativos

O banco começa **vazio**: nenhum número é inventado. Para conhecer o painel:

```bash
npm run demo:load    # cria exemplos marcados como Demo
npm run demo:clear   # remove só os exemplos; dados reais ficam intactos
```

Também dá para carregar/remover em **Configurações** no painel. Todo registro demonstrativo tem `is_demo = 1`, nome iniciado por `[Demo]`, e-mail no domínio reservado `.invalid` e o selo **Demo** na interface. Enquanto houver demo, uma faixa amarela avisa no topo do painel.

## Segurança (resumo)

| Tema | Como está |
|---|---|
| Login | scrypt (N=2¹⁵) com salt; mesma resposta e mesmo tempo para e-mail inexistente; bloqueio de 15 min após 5 erros; limite de 10 tentativas/15 min por IP |
| Sessão | token aleatório de 256 bits; só o **hash** fica no banco; cookie `HttpOnly`, `SameSite=Strict`, `Secure` + prefixo `__Host-` em produção; expira por inatividade (2 h) e por duração máxima (12 h); troca de senha derruba as outras sessões |
| Permissões | `src/lib/permissions.js` mapeia função → permissões; hoje só `ceo`. Função desconhecida não tem nenhuma permissão. Toda rota `/api/admin/*` passa por `guard()` (autenticado → autorizado → CSRF) |
| Páginas do painel | `/painel` sem sessão redireciona ao login; arquivos em `/painel/app/*` dão 401 sem sessão e 403 sem permissão. O código do painel fica fora da pasta pública |
| CSRF | token por sessão no cabeçalho `X-CSRF-Token` + verificação de `Origin` / `Sec-Fetch-Site` |
| Injeção / XSS | SQL sempre parametrizado; campos validados por esquema (sem *mass assignment*); a interface nunca usa `innerHTML`; CSP sem `unsafe-inline` |
| Cabeçalhos | CSP restrita, HSTS (produção), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `COOP/CORP` |
| Formulário público | limite de 10 envios/hora por IP, campo isca anti-robô, corpo limitado a 8 KB |
| Auditoria | logins, falhas, acessos negados, trocas de senha e alterações de dados (sem senhas nem tokens) |

## Colocar no ar

1. Rode atrás de um proxy com **HTTPS** (Caddy, nginx, Cloudflare). O app escuta só em `127.0.0.1` por padrão.
2. No `.env`: `NODE_ENV=production`, `COOKIE_SECURE=true`, `TRUST_PROXY=1` (um proxy na frente) e `WHATSAPP_NUMBER`.
3. Mantenha o processo com `systemd`, PM2 ou Docker (`node --disable-warning=ExperimentalWarning src/server.js`).
4. Faça **backup** de `data/p2.sqlite` (com o app parado, ou usando `sqlite3 data/p2.sqlite ".backup arquivo.sqlite"`).
5. Os limitadores de tentativas ficam em memória: servem para uma instância. Com várias instâncias, mova-os para um armazenamento compartilhado.

## Estrutura

```
public/            site público (HTML, CSS, JS)
admin/login/       tela de login (pública)
admin/app/         painel (só servido com sessão de CEO)
src/
  server.js        sobe o servidor
  app.js           monta rotas, sessão, cabeçalhos
  config.js        variáveis de ambiente
  db.js, migrations.js   SQLite e migrações versionadas
  entities.js      definição dos cadastros (campos, validação, busca)
  lib/             crud, auth, segurança, permissões, auditoria, dados demo
  routes/          public, auth, admin, pages
  scripts/         create-ceo, demo-data
tests/             testes automatizados
```

### Como estender

- **Novo cadastro:** crie a tabela em `src/migrations.js` (nova migração no fim), declare a entidade em `src/entities.js` e uma configuração em `admin/app/js/entities.js`; adicione a rota ao menu.
- **Nova função (ex.: gerente):** acrescente em `ROLE_PERMISSIONS` (`src/lib/permissions.js`) e crie o usuário com a função; o painel hoje exige `dashboard:read`.
- **Valores em dinheiro** são guardados em centavos (inteiros).
