// src/middleware/validation.js
const fp = require('fastify-plugin');

async function validationMiddleware(fastify, opts) {
  // Aquí puedes poner validaciones personalizadas o nada
  fastify.log.info('✅ Middleware de validación registrado');
}

module.exports = fp(validationMiddleware);
