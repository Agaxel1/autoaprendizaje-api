// src/app.js
const fastify = require('fastify')({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development' ? {
      target: 'pino-pretty',
      options: {
        colorize: true
      }
    } : undefined
  },
  trustProxy: true
});

// Registrar plugins
async function registerPlugins(fastify) {
  // Base plugins
  await fastify.register(require('./plugins/jwt'));
  await fastify.register(require('./plugins/cors'));
  await fastify.register(require('./plugins/db'));
  

  // Additional plugins
  await fastify.register(require('@fastify/multipart'));
  await fastify.register(require('@fastify/rate-limit'), {
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    timeWindow: process.env.RATE_LIMIT_WINDOW || '1 minute'
  });

  // Swagger documentation
  if (process.env.NODE_ENV !== 'production') {
    await fastify.register(require('@fastify/swagger'), require('./config/swagger'));
    await fastify.register(require('@fastify/swagger-ui'), {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false
      }
    });
  }
}

// Registrar middleware
async function registerMiddleware(fastify) {
  // Primero proteger con API Key (solo una vez)
  await fastify.register(require('./middleware/apiKeyAuth'));

  // Luego registrar los demás middlewares (sin volver a registrar apiKeyAuth)
  const middlewares = [
    './middleware/auth',
    './middleware/validation',
    './middleware/errorHandler'
  ];

  for (const mwPath of middlewares) {
    const mw = require(mwPath);
    console.log(`Middleware ${mwPath} exporta:`, typeof mw);
    await fastify.register(mw);
  }
}

// Registrar rutas
async function registerRoutes(fastify) {
  await fastify.register(require('./routes'), { prefix: '/api' });
}

// Registrar manejador de errores
async function registerErrorHandler(fastify) {
  await fastify.register(require('./middleware/errorHandler'));
}

// Función principal de inicialización
async function buildApp() {
  try {
    await registerPlugins(fastify);
    await registerMiddleware(fastify);
    await registerRoutes(fastify);
    await registerErrorHandler(fastify);

    // Health check
    fastify.get('/health', async (request, reply) => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
      };
    });

    // Root endpoint
    fastify.get('/', async (request, reply) => {
      return {
        message: 'API Plataforma Educativa',
        version: '1.0.0',
        docs: '/docs'
      };
    });

    return fastify;
  } catch (err) {
    fastify.log.error(err);
    throw err;
  }
}

module.exports = buildApp;
