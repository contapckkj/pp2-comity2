'use strict';

const { HttpError } = require('../lib/errors');
const { readJson, sendJson } = require('../lib/http');
const { enforceLimit } = require('../lib/security');
const { validateBody } = require('../lib/crud');
const { SERVICES } = require('../entities');

const LEAD_FIELDS = {
  name: { type: 'string', required: true, max: 120 },
  email: { type: 'email' },
  phone: { type: 'string', max: 40 },
  service: { type: 'enum', values: SERVICES },
  message: { type: 'text', required: true, max: 2000 },
};

function registerPublicRoutes({ router, app }) {
  const { db, config, limiters } = app;

  // Dados que o site público precisa (nada sensível).
  router.get('/api/public/config', (ctx) => {
    sendJson(
      ctx.res,
      200,
      {
        companyName: config.companyName,
        whatsappNumber: config.whatsappNumber || null,
        contactEmail: config.contactEmail || null,
      },
      { 'Cache-Control': 'public, max-age=300' },
    );
  });

  // Formulário de contato: vira um "contato recebido" no painel dos CEOs.
  router.post('/api/public/leads', async (ctx) => {
    enforceLimit(limiters.leadsIp, ctx.ip, 'Você enviou muitas mensagens. Tente novamente mais tarde.');

    const body = await readJson(ctx.req, 8 * 1024);

    // Campo isca: pessoas não o veem, robôs preenchem. Finge sucesso e descarta.
    if (typeof body.website === 'string' && body.website.trim() !== '') {
      return sendJson(ctx.res, 201, { ok: true });
    }

    const { values, errors } = validateBody({ fields: LEAD_FIELDS }, body, db, { partial: false });
    if (!values.email && !values.phone && !errors.email && !errors.phone) {
      errors.email = 'Informe um e-mail ou telefone para podermos responder.';
    }
    if (Object.keys(errors).length) {
      throw new HttpError(422, 'Confira os campos destacados.', { errors });
    }

    db.prepare(
      `INSERT INTO leads (name, email, phone, service, message, source)
       VALUES (?, ?, ?, ?, ?, 'site')`,
    ).run(values.name, values.email, values.phone, values.service, values.message);

    return sendJson(ctx.res, 201, { ok: true });
  });
}

module.exports = { registerPublicRoutes };
