// src/middleware/errorHandler.js
const fp = require('fastify-plugin');

async function errorHandlerMiddleware(fastify, options) {

  // Manejador global de errores
  fastify.setErrorHandler((error, request, reply) => {
    const { method, url } = request;

    // Log del error
    fastify.log.error({
      error: error.message,
      stack: error.stack,
      method,
      url,
      params: request.params,
      query: request.query,
      body: request.body
    }, 'Error en la aplicación');

    // Errores de validación de Fastify
    if (error.validation) {
      return reply.code(400).send({
        error: 'Datos de entrada inválidos',
        code: 'VALIDATION_ERROR',
        details: error.validation.map(err => ({
          field: err.instancePath || err.schemaPath,
          message: err.message,
          value: err.data
        }))
      });
    }

    // Errores de JWT
    if (error.name === 'UnauthorizedError' || error.message.includes('jwt')) {
      return reply.code(401).send({
        error: 'Token inválido o expirado',
        code: 'UNAUTHORIZED'
      });
    }

    // Errores de base de datos
    if (error.code) {
      switch (error.code) {
        case '23505': // Unique violation
          return reply.code(409).send({
            error: 'Conflicto: el recurso ya existe',
            code: 'DUPLICATE_RESOURCE'
          });

        case '23503': // Foreign key violation
          return reply.code(400).send({
            error: 'Referencia inválida a recurso relacionado',
            code: 'INVALID_REFERENCE'
          });

        case '23514': // Check violation
          return reply.code(400).send({
            error: 'Datos no cumplen las restricciones',
            code: 'CONSTRAINT_VIOLATION'
          });

        case '42P01': // Undefined table
          return reply.code(500).send({
            error: 'Error de configuración de base de datos',
            code: 'DATABASE_ERROR'
          });

        default:
          fastify.log.error(`Error de BD no manejado: ${error.code}`);
      }
    }

    // Errores de Rate Limiting
    if (error.statusCode === 429) {
      return reply.code(429).send({
        error: 'Demasiadas solicitudes. Intenta más tarde',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: error.retryAfter
      });
    }

    // Errores personalizados de la aplicación
    if (error.code && typeof error.code === 'string') {
      const statusCode = getStatusCodeFromErrorCode(error.code);
      return reply.code(statusCode).send({
        error: error.message,
        code: error.code
      });
    }

    // Error genérico del servidor
    const isDevelopment = process.env.NODE_ENV === 'development';

    return reply.code(500).send({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR',
      ...(isDevelopment && {
        details: error.message,
        stack: error.stack
      })
    });
  });

  // Manejador para rutas no encontradas
  if (!fastify.hasOwnProperty('_notFoundHandlerRegistered')) {
    fastify.setNotFoundHandler((request, reply) => {
      reply.code(404).send({
        error: `Ruta ${request.method} ${request.url} no encontrada`,
        code: 'ROUTE_NOT_FOUND'
      });
    });
    fastify._notFoundHandlerRegistered = true;
  }

  fastify.log.info('✅ Manejador de errores registrado');
}

/**
 * Mapear códigos de error personalizados a códigos de estado HTTP
 */
function getStatusCodeFromErrorCode(errorCode) {
  const statusMap = {
    // Autenticación y autorización
    'INVALID_CREDENTIALS': 401,
    'USER_INACTIVE': 401,
    'INVALID_TOKEN': 401,
    'TOKEN_EXPIRED': 401,
    'INSUFFICIENT_ROLE': 403,
    'ACCESS_DENIED': 403,
    'UNAUTHORIZED': 401,

    // Recursos no encontrados
    'USER_NOT_FOUND': 404,
    'COURSE_NOT_FOUND': 404,
    'ACTIVITY_NOT_FOUND': 404,
    'LEVEL_NOT_FOUND': 404,
    'EXAM_NOT_FOUND': 404,

    // Conflictos y duplicados
    'EMAIL_EXISTS': 409,
    'COURSE_CODE_EXISTS': 409,
    'ALREADY_ENROLLED': 409,
    'ALREADY_ASSIGNED': 409,
    'DUPLICATE_RESOURCE': 409,

    // Errores de validación
    'VALIDATION_ERROR': 400,
    'INVALID_DATA': 400,
    'MISSING_REQUIRED_FIELD': 400,
    'INVALID_FORMAT': 400,

    // Errores de negocio
    'ACTIVITY_NOT_UNLOCKED': 403,
    'COURSE_NOT_AVAILABLE': 403,
    'EXAM_TIME_EXPIRED': 410,
    'MAX_ATTEMPTS_REACHED': 429,
    'INSUFFICIENT_PERMISSIONS': 403,

    // Errores de límites
    'RATE_LIMIT_EXCEEDED': 429,
    'FILE_TOO_LARGE': 413,
    'QUOTA_EXCEEDED': 429,

    // Errores de servidor y configuración
    'DATABASE_ERROR': 500,
    'EXTERNAL_SERVICE_ERROR': 502,
    'CONFIGURATION_ERROR': 500
  };

  return statusMap[errorCode] || 500;
}

module.exports = fp(errorHandlerMiddleware);