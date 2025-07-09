// src/routes/actividades/index.js
const actividadSchemas = require('../../schemas/actividad');
const actividadService = require('../../services/actividadService');

async function actividadRoutes(fastify, options) {

  // GET /api/activities/task/:taskId
  fastify.get('/task/:taskId', {
    preHandler: [fastify.authenticate, fastify.requireStudent],
    schema: actividadSchemas.getTaskActivities
  }, async (request, reply) => {
    try {
      const { taskId } = request.params;
      const activities = await actividadService.getTaskActivities(
        fastify, 
        taskId, 
        request.estudiante_id
      );
      return reply.send(activities);
    } catch (error) {
      fastify.log.error('Error obteniendo actividades:', error);
      
      if (error.code === 'TASK_NOT_FOUND') {
        return reply.code(404).send({ 
          error: 'Tarea no encontrada',
          code: error.code
        });
      }
      
      return reply.code(500).send({ 
        error: 'Error al obtener actividades',
        code: 'ACTIVITIES_FETCH_ERROR'
      });
    }
  });

  // GET /api/activities/:id
  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.requireStudent],
    schema: actividadSchemas.getActivity
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const activity = await actividadService.getActivityById(
        fastify, 
        id, 
        request.estudiante_id
      );
      return reply.send(activity);
    } catch (error) {
      fastify.log.error('Error obteniendo actividad:', error);
      
      if (error.code === 'ACTIVITY_NOT_FOUND') {
        return reply.code(404).send({ 
          error: 'Actividad no encontrada',
          code: error.code
        });
      }
      
      if (error.code === 'ACTIVITY_NOT_UNLOCKED') {
        return reply.code(403).send({ 
          error: 'Actividad no disponible',
          code: error.code
        });
      }
      
      return reply.code(500).send({ 
        error: 'Error al obtener actividad',
        code: 'ACTIVITY_FETCH_ERROR'
      });
    }
  });

  // GET /api/activities/:id/questions
  fastify.get('/:id/questions', {
    preHandler: [fastify.authenticate, fastify.requireStudent],
    schema: actividadSchemas.getActivityQuestions
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const questions = await actividadService.getActivityQuestions(
        fastify, 
        id, 
        request.estudiante_id
      );
      return reply.send(questions);
    } catch (error) {
      fastify.log.error('Error obteniendo preguntas:', error);
      
      if (error.code === 'ACTIVITY_NOT_FOUND') {
        return reply.code(404).send({ 
          error: 'Actividad no encontrada',
          code: error.code
        });
      }
      
      if (error.code === 'ACTIVITY_NOT_UNLOCKED') {
        return reply.code(403).send({ 
          error: 'Actividad no disponible',
          code: error.code
        });
      }
      
      return reply.code(500).send({ 
        error: 'Error al obtener preguntas',
        code: 'QUESTIONS_FETCH_ERROR'
      });
    }
  });

  // POST /api/activities/:id/complete
  fastify.post('/:id/complete', {
    preHandler: [fastify.authenticate, fastify.requireStudent],
    schema: actividadSchemas.completeActivity
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { puntuacion, tiempo_empleado_segundos, respuestas } = request.body;
      
      const result = await actividadService.completeActivity(
        fastify,
        id,
        request.estudiante_id,
        {
          puntuacion,
          tiempo_empleado_segundos,
          respuestas
        }
      );
      
      return reply.send(result);
    } catch (error) {
      fastify.log.error('Error completando actividad:', error);
      
      if (error.code === 'ACTIVITY_NOT_FOUND') {
        return reply.code(404).send({ 
          error: 'Actividad no encontrada',
          code: error.code
        });
      }
      
      if (error.code === 'ACTIVITY_NOT_UNLOCKED') {
        return reply.code(403).send({ 
          error: 'Actividad no disponible',
          code: error.code
        });
      }
      
      if (error.code === 'ACTIVITY_ALREADY_COMPLETED') {
        return reply.code(409).send({ 
          error: 'Actividad ya completada',
          code: error.code
        });
      }
      
      return reply.code(500).send({ 
        error: 'Error al completar actividad',
        code: 'ACTIVITY_COMPLETION_ERROR'
      });
    }
  });

  // POST /api/activities/:id/submit-answers
  fastify.post('/:id/submit-answers', {
    preHandler: [fastify.authenticate, fastify.requireStudent],
    schema: actividadSchemas.submitAnswers
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { respuestas, tiempo_empleado_segundos } = request.body;
      
      const result = await actividadService.submitAnswers(
        fastify,
        id,
        request.estudiante_id,
        respuestas,
        tiempo_empleado_segundos
      );
      
      return reply.send(result);
    } catch (error) {
      fastify.log.error('Error enviando respuestas:', error);
      
      if (error.code === 'ACTIVITY_NOT_FOUND') {
        return reply.code(404).send({ 
          error: 'Actividad no encontrada',
          code: error.code
        });
      }
      
      if (error.code === 'ACTIVITY_NOT_UNLOCKED') {
        return reply.code(403).send({ 
          error: 'Actividad no disponible',
          code: error.code
        });
      }
      
      return reply.code(500).send({ 
        error: 'Error al enviar respuestas',
        code: 'ANSWERS_SUBMISSION_ERROR'
      });
    }
  });

  // GET /api/activities/:id/progress
  fastify.get('/:id/progress', {
    preHandler: [fastify.authenticate, fastify.requireStudent],
    schema: actividadSchemas.getActivityProgress
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const progress = await actividadService.getActivityProgress(
        fastify, 
        id, 
        request.estudiante_id
      );
      return reply.send(progress);
    } catch (error) {
      fastify.log.error('Error obteniendo progreso de actividad:', error);
      return reply.code(500).send({ 
        error: 'Error al obtener progreso',
        code: 'PROGRESS_FETCH_ERROR'
      });
    }
  });

  // POST /api/activities (crear actividad - solo docentes)
  fastify.post('/', {
    preHandler: [
      fastify.authenticate,
      fastify.authorize(['docente', 'administrador'])
    ],
    schema: actividadSchemas.createActivity
  }, async (request, reply) => {
    try {
      const activity = await actividadService.createActivity(
        fastify, 
        request.body, 
        request.user.usuario_id
      );
      return reply.code(201).send(activity);
    } catch (error) {
      fastify.log.error('Error creando actividad:', error);
      
      if (error.code === 'TASK_NOT_FOUND') {
        return reply.code(404).send({ 
          error: 'Tarea no encontrada',
          code: error.code
        });
      }
      
      if (error.code === 'MAX_ACTIVITIES_REACHED') {
        return reply.code(400).send({ 
          error: 'Se ha alcanzado el límite máximo de actividades por tarea',
          code: error.code
        });
      }
      
      return reply.code(500).send({ 
        error: 'Error al crear actividad',
        code: 'ACTIVITY_CREATION_ERROR'
      });
    }
  });

  // PUT /api/activities/:id (actualizar actividad - solo docentes)
  fastify.put('/:id', {
    preHandler: [
      fastify.authenticate,
      fastify.authorize(['docente', 'administrador'])
    ],
    schema: actividadSchemas.updateActivity
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const activity = await actividadService.updateActivity(
        fastify, 
        id, 
        request.body, 
        request.user.usuario_id
      );
      return reply.send(activity);
    } catch (error) {
      fastify.log.error('Error actualizando actividad:', error);
      
      if (error.code === 'ACTIVITY_NOT_FOUND') {
        return reply.code(404).send({ 
          error: 'Actividad no encontrada',
          code: error.code
        });
      }
      
      if (error.code === 'UNAUTHORIZED') {
        return reply.code(403).send({ 
          error: 'No tienes permiso para editar esta actividad',
          code: error.code
        });
      }
      
      return reply.code(500).send({ 
        error: 'Error al actualizar actividad',
        code: 'ACTIVITY_UPDATE_ERROR'
      });
    }
  });

  fastify.log.info('✅ Rutas de actividades registradas');
}

module.exports = actividadRoutes;