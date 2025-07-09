// src/middleware/auth.js
const fp = require('fastify-plugin');

async function authMiddleware(fastify, options) {
  // Decorator para autenticación
  fastify.decorate('authenticate', async (request, reply) => {
    try {

      fastify.log.info('🧪 Intentando verificar JWT');
      const decoded = await request.jwtVerify();
      request.user = decoded; // ✅ Esto es CLAVE

      fastify.log.info('✅ JWT verificado:', request.user);

      if (!request.user || !request.user.usuario_id) {
        fastify.log.warn('Token sin usuario_id');
        return reply.code(401).send({
          error: 'Token inválido (sin usuario_id)',
          code: 'INVALID_TOKEN_PAYLOAD'
        });
      }

      const userQuery = 'SELECT activo FROM usuarios WHERE id = $1';
      const userResult = await fastify.pg.query(userQuery, [request.user.usuario_id]);

      if (userResult.rows.length === 0 || !userResult.rows[0].activo) {
        return reply.code(401).send({
          error: 'Usuario inactivo o no encontrado',
          code: 'USER_INACTIVE'
        });
      }

    } catch (err) {
      fastify.log.error('❌ JWT no válido:', err);
      return reply.code(401).send({
        error: 'Token inválido o expirado',
        code: 'INVALID_TOKEN'
      });
    }
  });


  // Decorator para autorización por roles
  fastify.decorate('authorize', (allowedRoles) => {
    return async function (request, reply) {
      const { usuario_id } = request.user;

      try {
        const roleQuery = `
          SELECT rol FROM usuario_roles 
          WHERE usuario_id = $1 AND rol = ANY($2)
        `;

        const result = await fastify.pg.query(roleQuery, [usuario_id, allowedRoles]);

        if (result.rows.length === 0) {
          return reply.code(403).send({
            error: 'Acceso denegado - Rol insuficiente',
            code: 'INSUFFICIENT_ROLE',
            required_roles: allowedRoles
          });
        }

      } catch (err) {
        fastify.log.error('Error de autorización:', err);
        return reply.code(500).send({
          error: 'Error interno de autorización',
          code: 'AUTHORIZATION_ERROR'
        });
      }
    };
  });

  // Decorator para verificar que el usuario es estudiante
  fastify.decorate('requireStudent', async function (request, reply) {
    const { usuario_id } = request.user;

    try {
      const studentQuery = 'SELECT id FROM estudiantes WHERE usuario_id = $1';
      const result = await fastify.pg.query(studentQuery, [usuario_id]);

      if (result.rows.length === 0) {
        return reply.code(403).send({
          error: 'Acceso restringido a estudiantes',
          code: 'STUDENT_REQUIRED'
        });
      }

      // Agregar estudiante_id al request para uso posterior
      request.estudiante_id = result.rows[0].id;

    } catch (err) {
      fastify.log.error('Error verificando estudiante:', err);
      return reply.code(500).send({
        error: 'Error interno de verificación',
        code: 'STUDENT_VERIFICATION_ERROR'
      });
    }
  });

  // Decorator para verificar acceso a curso
  fastify.decorate('requireCourseAccess', (paramName = 'courseId') => {
    return async function (request, reply) {
      const { usuario_id } = request.user;
      const courseId = request.params[paramName];

      try {
        // Verificar si es docente del curso o estudiante inscrito
        const accessQuery = `
          SELECT 'docente' as tipo FROM curso_docentes 
          WHERE curso_id = $1 AND usuario_id = $2 AND activo = true
          UNION
          SELECT 'estudiante' as tipo FROM curso_estudiantes 
          WHERE curso_id = $1 AND usuario_id = $2 AND estado != 'retirado'
        `;

        const result = await fastify.pg.query(accessQuery, [courseId, usuario_id]);

        if (result.rows.length === 0) {
          return reply.code(403).send({
            error: 'No tienes acceso a este curso',
            code: 'COURSE_ACCESS_DENIED'
          });
        }

        // Agregar tipo de acceso al request
        request.courseAccess = result.rows[0].tipo;

      } catch (err) {
        fastify.log.error('Error verificando acceso a curso:', err);
        return reply.code(500).send({
          error: 'Error interno de verificación',
          code: 'COURSE_ACCESS_ERROR'
        });
      }
    };
  });

  fastify.log.info('✅ Middleware de autenticación registrado');
}

module.exports = fp(authMiddleware);