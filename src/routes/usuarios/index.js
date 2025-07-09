// src/routes/usuarios/index.js
const usuarioSchemas = require('../../schemas/usuario');
const usuarioService = require('../../services/usuarioService');

async function usuarioRoutes(fastify, options) {

  // GET /api/users
  fastify.get('/', {
    preHandler: fastify.authenticate,
    schema: usuarioSchemas.getAllUsers
  }, async (request, reply) => {
    try {
      const usuarios = await usuarioService.getAllUsers(fastify);
      return usuarios;
    } catch (error) {
      fastify.log.error('Error en GET /api/users/:', error); 
      reply.status(500).send({ error: error.message });
    }
  });

  // GET /api/users/profile
  fastify.get('/profile', {
    preHandler: fastify.authenticate,
    schema: usuarioSchemas.getProfile
  }, async (request, reply) => {
    try {
      const usuario = await usuarioService.getProfile(fastify, request.user.usuario_id);
      return reply.send(usuario);
    } catch (error) {
      fastify.log.error('Error obteniendo perfil:', error);

      if (error.code === 'USER_NOT_FOUND') {
        return reply.code(404).send({
          error: 'Usuario no encontrado',
          code: error.code
        });
      }

      return reply.code(500).send({
        error: 'Error al obtener perfil',
        code: 'PROFILE_FETCH_ERROR'
      });
    }
  });

  // PUT /api/users/profile
  fastify.put('/profile', {
    preHandler: fastify.authenticate,
    schema: usuarioSchemas.updateProfile
  }, async (request, reply) => {
    try {
      const usuario = await usuarioService.updateProfile(
        fastify,
        request.user.usuario_id,
        request.body
      );
      return reply.send(usuario);
    } catch (error) {
      fastify.log.error('Error actualizando perfil:', error);
      return reply.code(500).send({
        error: 'Error al actualizar perfil',
        code: 'PROFILE_UPDATE_ERROR'
      });
    }
  });

  // GET /api/users/dashboard
  fastify.get('/dashboard', {
    preHandler: [fastify.authenticate, fastify.requireStudent],
    schema: usuarioSchemas.getDashboard
  }, async (request, reply) => {
    try {
      const dashboard = await usuarioService.getDashboard(fastify, request.estudiante_id);
      return reply.send(dashboard);
    } catch (error) {
      fastify.log.error('Error obteniendo dashboard:', error);
      return reply.code(500).send({
        error: 'Error al obtener dashboard',
        code: 'DASHBOARD_FETCH_ERROR'
      });
    }
  });

  // GET /api/users/progress
  fastify.get('/progress', {
    preHandler: [fastify.authenticate, fastify.requireStudent],
    schema: usuarioSchemas.getProgress
  }, async (request, reply) => {
    try {
      const { curso_id } = request.query;
      const progress = await usuarioService.getProgress(
        fastify,
        request.user.usuario_id,
        curso_id
      );
      return reply.send(progress);
    } catch (error) {
      fastify.log.error('Error obteniendo progreso:', error);
      return reply.code(500).send({
        error: 'Error al obtener progreso',
        code: 'PROGRESS_FETCH_ERROR'
      });
    }
  });

  // GET /api/users/courses
  fastify.get('/courses', {
    preHandler: fastify.authenticate,
    schema: usuarioSchemas.getUserCourses
  }, async (request, reply) => {
    try {
      const courses = await usuarioService.getUserCourses(fastify, request.user.usuario_id);
      return reply.send(courses);
    } catch (error) {
      fastify.log.error('Error obteniendo cursos del usuario:', error);
      return reply.code(500).send({
        error: 'Error al obtener cursos',
        code: 'USER_COURSES_FETCH_ERROR'
      });
    }
  });

  // POST /api/users/enroll/:courseId
  fastify.post('/enroll/:courseId', {
    preHandler: [fastify.authenticate, fastify.requireStudent],
    schema: usuarioSchemas.enrollCourse
  }, async (request, reply) => {
    try {
      const { courseId } = request.params;
      const result = await usuarioService.enrollInCourse(
        fastify,
        request.user.usuario_id,
        courseId
      );
      return reply.code(201).send(result);
    } catch (error) {
      fastify.log.error('Error inscribiendo en curso:', error);

      if (error.code === 'ALREADY_ENROLLED') {
        return reply.code(409).send({
          error: 'Ya estás inscrito en este curso',
          code: error.code
        });
      }

      if (error.code === 'COURSE_NOT_FOUND') {
        return reply.code(404).send({
          error: 'Curso no encontrado',
          code: error.code
        });
      }

      return reply.code(500).send({
        error: 'Error al inscribirse en el curso',
        code: 'ENROLLMENT_ERROR'
      });
    }
  });

  fastify.log.info('✅ Rutas de usuarios registradas');
}

module.exports = usuarioRoutes;