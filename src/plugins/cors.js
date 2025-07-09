// src/plugins/cors.js
const fp = require('fastify-plugin');
const env = require('../config/environment');

async function corsPlugin(fastify, options) {
  await fastify.register(require('@fastify/cors'), {
    origin: env.ALLOWED_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
  });

  fastify.log.info('✅ Plugin CORS registrado correctamente');
}

module.exports = fp(corsPlugin);