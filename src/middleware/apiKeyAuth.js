// src/middleware/apiKeyAuth.js
const fp = require('fastify-plugin');
const env = require('../config/environment');

async function apiKeyAuth(fastify, options) {
  // Lista de rutas públicas que no necesitan API Key
  const rutasPublicas = [
    '/', 
    '/health',
    '/docs',
    '/docs/json',
    '/api/auth/login'
  ];

  fastify.addHook('onRequest', async (request, reply) => {
    const apiKey = request.headers['x-api-key'];

    // Permitir rutas públicas sin verificación
    if (rutasPublicas.includes(request.routeOptions.url)) {
      return;
    }

    // Verificar API Key en rutas protegidas
    if (!apiKey || apiKey !== env.API_KEY_SECRETA) {
      fastify.log.warn('❌ Acceso restringido');
      return reply.code(401).send({
        error: 'Acceso restringido',
        code: 'INVALID_API_KEY'
      });
    }
  });

  fastify.log.info('🔐 Protección global por API Key activada');
}

module.exports = fp(apiKeyAuth);
