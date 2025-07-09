// src/routes/cursos/index.js
const { json } = require('stream/consumers');
const cursoSchemas = require('../../schemas/curso');
const cursoService = require('../../services/cursoService');

async function cursoRoutes(fastify, options) {

  const requireAdminOrTeacher = async (request, reply) => {
    try {
      // Verificar que el usuario esté autenticado
      await fastify.authenticate(request, reply);

      // Verificar que tenga rol de administrador o docente
      const { roles } = request.user;

      if (!roles || !Array.isArray(roles) || (!roles.includes('administrador') && !roles.includes('docente'))) {
        return reply.code(403).send({
          error: 'Acceso denegado. Se requieren permisos de administrador o docente',
          code: 'ADMIN_OR_TEACHER_ACCESS_REQUIRED'
        });
      }
    } catch (error) {
      return reply.code(401).send({
        error: 'Token inválido o expirado',
        code: 'UNAUTHORIZED'
      });
    }
  };

  // GET /api/courses
  fastify.get('/', {
    preHandler: fastify.authenticate,
    schema: cursoSchemas.listCourses
  }, async (request, reply) => {
    try {
      const { page = 1, limit = 20 } = request.query;
      const courses = await cursoService.listCourses(fastify, { page, limit });
      console.log("Informacion 3 " + JSON.stringify(courses))
      return reply.send(courses);
    } catch (error) {
      fastify.log.error('Error listando cursos:', error);
      return reply.code(500).send({
        error: 'Error al obtener cursos',
        code: 'COURSES_FETCH_ERROR'
      });
    }
  });

  // POST /api/courses
  fastify.post('/', {
    preHandler: [
      fastify.authenticate,
      fastify.authorize(['docente', 'administrador'])
    ],
    schema: cursoSchemas.createCourse
  }, async (request, reply) => {
    try {
      const course = await cursoService.createCourse(
        fastify,
        request.body,
        request.user.usuario_id
      );


      return reply.code(201).send(course);
    } catch (error) {
      fastify.log.error('Error creando curso:', error);

      if (error.code === '23505') {
        return reply.code(409).send({
          error: 'El código del curso ya existe',
          code: 'COURSE_CODE_EXISTS'
        });
      }

      return reply.code(500).send({
        error: 'Error al crear curso',
        code: 'COURSE_CREATION_ERROR'
      });
    }
  });

  // POST /api/courses/:id/enroll-student - Inscribir estudiante a curso
  fastify.post('/:id/enroll-student', {
    preHandler: [fastify.authenticate, requireAdminOrTeacher], // Solo admin o docente pueden inscribir
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          usuario_id: { type: 'string' },
          estado: {
            type: 'string',
            enum: ['inscrito', 'aprobado', 'reprobado', 'retirado'],
            default: 'inscrito'
          }
        },
        required: ['usuario_id']
      }
    }
  }, async (request, reply) => {
    try {
      const { id: courseId } = request.params;
      const { usuario_id, estado = 'inscrito' } = request.body;

      console.log('📝 POST /courses/:id/enroll-student:', { courseId, usuario_id, estado });

      // Verificar que el curso existe y está activo
      const courseCheck = await fastify.pg.query(
        'SELECT id, nombre FROM cursos WHERE id = $1 AND activo = true',
        [courseId]
      );

      if (courseCheck.rows.length === 0) {
        return reply.code(404).send({
          error: 'Curso no encontrado o inactivo',
          code: 'COURSE_NOT_FOUND'
        });
      }

      // Verificar que el usuario existe y tiene rol de estudiante
      const studentCheck = await fastify.pg.query(`
            SELECT u.id, u.nombres, u.apellidos 
            FROM usuarios u
            JOIN usuario_roles ur ON u.id = ur.usuario_id
            WHERE u.id = $1 AND ur.rol = 'estudiante' AND u.activo = true
        `, [usuario_id]);

      if (studentCheck.rows.length === 0) {
        return reply.code(404).send({
          error: 'Estudiante no encontrado o inactivo',
          code: 'STUDENT_NOT_FOUND'
        });
      }

      // Verificar que el estudiante no esté ya inscrito en el curso
      const enrollmentCheck = await fastify.pg.query(
        'SELECT id FROM curso_estudiantes WHERE curso_id = $1 AND usuario_id = $2',
        [courseId, usuario_id]
      );

      if (enrollmentCheck.rows.length > 0) {
        return reply.code(409).send({
          error: 'El estudiante ya está inscrito en este curso',
          code: 'ALREADY_ENROLLED'
        });
      }

      // Insertar la inscripción
      const insertResult = await fastify.pg.query(`
            INSERT INTO curso_estudiantes (curso_id, usuario_id, estado, fecha_inscripcion, fecha_estado)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING *
        `, [courseId, usuario_id, estado]);

      const enrollment = insertResult.rows[0];

      console.log('✅ Estudiante inscrito exitosamente');

      return reply.code(201).send({
        message: 'Estudiante inscrito exitosamente',
        enrollment: {
          id: enrollment.id,
          curso_id: enrollment.curso_id,
          usuario_id: enrollment.usuario_id,
          estado: enrollment.estado,
          fecha_inscripcion: enrollment.fecha_inscripcion,
          curso_nombre: courseCheck.rows[0].nombre,
          estudiante_nombre: `${studentCheck.rows[0].nombres} ${studentCheck.rows[0].apellidos}`
        }
      });

    } catch (error) {
      console.error('❌ Error inscribiendo estudiante:', error);
      fastify.log.error('Error inscribiendo estudiante a curso:', error);

      if (error.code === '23505') { // Unique constraint violation
        return reply.code(409).send({
          error: 'El estudiante ya está inscrito en este curso',
          code: 'ALREADY_ENROLLED'
        });
      }

      return reply.code(500).send({
        error: 'Error al inscribir estudiante',
        code: 'ENROLLMENT_ERROR',
        details: error.message
      });
    }
  });

  // GET /api/courses/:id
  fastify.get('/:id', {
    preHandler: [
      fastify.authenticate,
      fastify.requireCourseAccess('id')
    ],
    schema: cursoSchemas.getCourse
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const course = await cursoService.getCourseById(fastify, id, request.user.usuario_id);
      return reply.send(course);
    } catch (error) {
      fastify.log.error('Error obteniendo curso:', error);

      if (error.code === 'COURSE_NOT_FOUND') {
        return reply.code(404).send({
          error: 'Curso no encontrado',
          code: error.code
        });
      }

      return reply.code(500).send({
        error: 'Error al obtener curso',
        code: 'COURSE_FETCH_ERROR'
      });
    }
  });

  // PUT /api/courses/:id
  fastify.put('/:id', {
    preHandler: [
      fastify.authenticate,
      fastify.authorize(['docente', 'administrador'])
    ],
    schema: cursoSchemas.updateCourse
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const course = await cursoService.updateCourse(
        fastify,
        id,
        request.body,
        request.user.usuario_id
      );
      return reply.send(course);
    } catch (error) {
      fastify.log.error('Error actualizando curso:', error);

      if (error.code === 'COURSE_NOT_FOUND') {
        return reply.code(404).send({
          error: 'Curso no encontrado',
          code: error.code
        });
      }

      if (error.code === 'UNAUTHORIZED') {
        return reply.code(403).send({
          error: 'No tienes permiso para editar este curso',
          code: error.code
        });
      }

      return reply.code(500).send({
        error: 'Error al actualizar curso',
        code: 'COURSE_UPDATE_ERROR'
      });
    }
  });

  // DELETE /api/courses/:id
  fastify.delete('/:id', {
    preHandler: [
      fastify.authenticate,
      fastify.authorize(['administrador'])
    ],
    schema: cursoSchemas.deleteCourse
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      await cursoService.deleteCourse(fastify, id);
      return reply.code(204).send();
    } catch (error) {
      fastify.log.error('Error eliminando curso:', error);

      if (error.code === 'COURSE_NOT_FOUND') {
        return reply.code(404).send({
          error: 'Curso no encontrado',
          code: error.code
        });
      }

      return reply.code(500).send({
        error: 'Error al eliminar curso',
        code: 'COURSE_DELETE_ERROR'
      });
    }
  });

  // GET /api/courses/:id/students
  fastify.get('/:id/students', {
    preHandler: [
      fastify.authenticate,
      fastify.authorize(['docente', 'administrador'])
    ],
    schema: cursoSchemas.getCourseStudents
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { page = 1, limit = 20 } = request.query;
      const students = await cursoService.getCourseStudents(fastify, id, { page, limit });
      return reply.send(students);
    } catch (error) {
      fastify.log.error('Error obteniendo estudiantes del curso:', error);
      return reply.code(500).send({
        error: 'Error al obtener estudiantes',
        code: 'STUDENTS_FETCH_ERROR'
      });
    }
  });

  // POST /api/courses/:id/assign-teacher
  fastify.post('/:id/assign-teacher', {
    preHandler: [
      fastify.authenticate,
      fastify.authorize(['administrador'])
    ],
    schema: cursoSchemas.assignTeacher
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { usuario_id, tipo_asignacion = 'titular' } = request.body;

      const result = await cursoService.assignTeacherToCourse(
        fastify,
        id,
        usuario_id,
        tipo_asignacion
      );

      return reply.code(201).send(result);
    } catch (error) {
      fastify.log.error('Error asignando docente:', error);

      if (error.code === 'USER_NOT_TEACHER') {
        return reply.code(400).send({
          error: 'El usuario debe tener rol de docente',
          code: error.code
        });
      }

      if (error.code === 'ALREADY_ASSIGNED') {
        return reply.code(409).send({
          error: 'El docente ya está asignado a este curso',
          code: error.code
        });
      }

      return reply.code(500).send({
        error: 'Error al asignar docente',
        code: 'TEACHER_ASSIGNMENT_ERROR'
      });
    }
  });

  // GET /api/courses/:id/levels
  fastify.get('/:id/levels', {
    preHandler: [
      fastify.authenticate,
      fastify.requireCourseAccess('id')
    ],
    schema: cursoSchemas.getCourseLevels
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const levels = await cursoService.getCourseLevels(fastify, id, request.user.usuario_id);
      return reply.send(levels);
    } catch (error) {
      fastify.log.error('Error obteniendo niveles del curso:', error);
      return reply.code(500).send({
        error: 'Error al obtener niveles',
        code: 'LEVELS_FETCH_ERROR'
      });
    }
  });

  // GET /api/courses/student - Cursos del estudiante autenticado
  fastify.get('/student', {
    preHandler: [
      fastify.authenticate,
      fastify.authorize(['estudiante'])
    ],
    schema: cursoSchemas.listStudentCourses
  }, async (request, reply) => {
    try {
      const { page = 1, limit = 20 } = request.query;
      const userId = request.user.usuario_id;

      const courses = await cursoService.getStudentCourses(fastify, userId, {
        page,
        limit
      });

      return reply.send(courses);
    } catch (error) {
      fastify.log.error('Error obteniendo cursos del estudiante:', error);
      return reply.code(500).send({
        error: 'Error al obtener cursos del estudiante',
        code: 'STUDENT_COURSES_FETCH_ERROR'
      });
    }
  });

  // GET /api/courses/teacher - Cursos del docente autenticado
  fastify.get('/teacher', {
    preHandler: [
      fastify.authenticate,
      fastify.authorize(['docente'])
    ],
    schema: cursoSchemas.listTeacherCourses
  }, async (request, reply) => {
    try {
      const { page = 1, limit = 20 } = request.query;
      const userId = request.user.usuario_id;

      const courses = await cursoService.getTeacherCourses(fastify, userId, {
        page,
        limit
      });

      return reply.send(courses);
    } catch (error) {
      fastify.log.error('Error obteniendo cursos del docente:', error);
      return reply.code(500).send({
        error: 'Error al obtener cursos del docente',
        code: 'TEACHER_COURSES_FETCH_ERROR'
      });
    }
  });

  // POST /api/courses/:id/assign-student - Asignar estudiante a curso (solo admin)
  fastify.post('/:id/assign-student', {
    preHandler: [
      fastify.authenticate,
      fastify.authorize(['administrador'])
    ],
    schema: cursoSchemas.assignStudent
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { usuario_id, estado = 'inscrito' } = request.body;

      const result = await cursoService.assignStudentToCourse(
        fastify,
        id,
        usuario_id,
        estado
      );

      return reply.code(201).send(result);
    } catch (error) {
      fastify.log.error('Error asignando estudiante:', error);

      if (error.code === 'USER_NOT_STUDENT') {
        return reply.code(400).send({
          error: 'El usuario debe tener rol de estudiante',
          code: error.code
        });
      }

      if (error.code === 'ALREADY_ENROLLED') {
        return reply.code(409).send({
          error: 'El estudiante ya está inscrito en este curso',
          code: error.code
        });
      }

      return reply.code(500).send({
        error: 'Error al asignar estudiante',
        code: 'STUDENT_ASSIGNMENT_ERROR'
      });
    }
  });

  // PUT /api/courses/:courseId/students/:studentId - Actualizar estado de estudiante
  fastify.put('/:courseId/students/:studentId', {
    preHandler: [
      fastify.authenticate,
      fastify.authorize(['administrador', 'docente'])
    ],
    schema: cursoSchemas.updateStudentStatus
  }, async (request, reply) => {
    try {
      const { courseId, studentId } = request.params;
      const { estado, nota_final } = request.body;

      const result = await cursoService.updateStudentCourseStatus(
        fastify,
        courseId,
        studentId,
        { estado, nota_final }
      );

      return reply.send(result);
    } catch (error) {
      fastify.log.error('Error actualizando estado del estudiante:', error);

      if (error.code === 'ENROLLMENT_NOT_FOUND') {
        return reply.code(404).send({
          error: 'Inscripción no encontrada',
          code: error.code
        });
      }

      return reply.code(500).send({
        error: 'Error al actualizar estado del estudiante',
        code: 'STUDENT_STATUS_UPDATE_ERROR'
      });
    }
  });

  // GET /api/courses/:id/teachers - Obtener docentes de un curso
  fastify.get('/:id/teachers', {
    preHandler: [
      fastify.authenticate,
      fastify.authorize(['administrador'])
    ],
    schema: cursoSchemas.getCourseTeachers
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const teachers = await cursoService.getCourseTeachers(fastify, id);
      return reply.send(teachers);
    } catch (error) {
      fastify.log.error('Error obteniendo docentes del curso:', error);
      return reply.code(500).send({
        error: 'Error al obtener docentes',
        code: 'TEACHERS_FETCH_ERROR'
      });
    }
  });

  fastify.log.info('✅ Rutas de cursos registradas');
}

module.exports = cursoRoutes;