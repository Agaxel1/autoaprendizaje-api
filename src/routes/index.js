// src/routes/index.js
async function routes(fastify, options) {
  // Registrar todas las rutas
  await fastify.register(require('./auth/index'), { prefix: '/auth' });
  await fastify.register(require('./usuarios/index'), { prefix: '/users' });
  await fastify.register(require('./cursos/index'), { prefix: '/courses' });
  // await fastify.register(require('./niveles/index'), { prefix: '/levels' });
  // await fastify.register(require('./actividades/index'), { prefix: '/activities' });
  // await fastify.register(require('./examenes/index'), { prefix: '/exams' });
  await fastify.register(require('./admin/index'), { prefix: '/admin' });

  fastify.log.info('✅ Todas las rutas registradas correctamente');
}

module.exports = routes;