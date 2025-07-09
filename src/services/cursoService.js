// src/services/cursoService.js

class CursoService {
  // === VERSIÓN SIMPLE PARA AGREGAR ESTADÍSTICAS A TU BACKEND ===

  // Si quieres agregar estadísticas más adelante, aquí tienes una versión que 
  // funciona con tu estructura actual pero agrega conteos:

  static async listCourses(fastify, { page = 1, limit = 20, search = '', activo = '' }) {
    try {
      const offset = (page - 1) * limit;
      let whereConditions = [];
      let queryParams = [];
      let paramIndex = 1;

      // Filtro por estado activo
      if (activo === 'true' || activo === 'false') {
        whereConditions.push(`c.activo = $${paramIndex}`);
        queryParams.push(activo === 'true');
        paramIndex++;
      }

      // Filtro por búsqueda
      if (search) {
        whereConditions.push(
          `(c.nombre ILIKE $${paramIndex} OR c.codigo_curso ILIKE $${paramIndex} OR c.descripcion ILIKE $${paramIndex})`
        );
        queryParams.push(`%${search}%`);
        paramIndex++;
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const coursesQuery = `
      SELECT 
        c.id,
        c.codigo_curso,
        c.nombre,
        c.descripcion,
        c.porcentaje_minimo_examen,
        c.activo,
        c.creado_por,
        c.fecha_creacion,
        c.fecha_actualizacion
      FROM cursos c
      ${whereClause}
      ORDER BY c.fecha_creacion DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

      const countQuery = `
      SELECT COUNT(*) as total
      FROM cursos c
      ${whereClause}
    `;

      queryParams.push(limit, offset);

      const [coursesResult, countResult] = await Promise.all([
        fastify.pg.query(coursesQuery, queryParams),
        fastify.pg.query(countQuery, queryParams.slice(0, -2))
      ]);

      const total = parseInt(countResult.rows[0].total);
      const totalPages = Math.ceil(total / limit);

      const coursesWithStats = await Promise.all(
        coursesResult.rows.map(async (course) => {
          try {
            const studentsCount = await fastify.pg.query(
              'SELECT COUNT(*) as total FROM curso_estudiantes WHERE curso_id = $1',
              [course.id]
            );

            const teachersCount = await fastify.pg.query(
              'SELECT COUNT(*) as total FROM curso_docentes WHERE curso_id = $1 AND activo = true',
              [course.id]
            );

            return {
              ...course,
              total_estudiantes: parseInt(studentsCount.rows[0]?.total || 0),
              total_docentes: parseInt(teachersCount.rows[0]?.total || 0)
            };
          } catch (error) {
            return {
              ...course,
              total_estudiantes: 0,
              total_docentes: 0
            };
          }
        })
      );

      return {
        courses: coursesWithStats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      fastify.log.error('Error listando cursos:', error);
      throw error;
    }
  }


  // Obtener cursos del estudiante (solo cursos inscritos)
  static async getStudentCourses(fastify, userId, { page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;

    const query = `
      SELECT 
        c.*,
        ce.estado,
        ce.fecha_inscripcion,
        ce.fecha_estado,
        ce.nota_final
      FROM cursos c
      INNER JOIN curso_estudiantes ce ON c.id = ce.curso_id
      WHERE ce.usuario_id = $1
        AND c.activo = true
      ORDER BY ce.fecha_inscripcion DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await fastify.pg.query(query, [
      userId,
      limit,
      offset
    ]);

    return result.rows;
  }

  // Obtener cursos del docente (solo cursos asignados)
  static async getTeacherCourses(fastify, userId, { page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;

    const query = `
      SELECT 
        c.*,
        cd.tipo_asignacion,
        cd.fecha_asignacion,
        cd.activo as asignacion_activa,
        (
          SELECT COUNT(*) 
          FROM curso_estudiantes ce 
          WHERE ce.curso_id = c.id
        ) as total_estudiantes
      FROM cursos c
      INNER JOIN curso_docentes cd ON c.id = cd.curso_id
      WHERE cd.usuario_id = $1
        AND cd.activo = true
        AND c.activo = true
      ORDER BY cd.fecha_asignacion DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await fastify.pg.query(query, [
      userId,
      limit,
      offset
    ]);

    return result.rows;
  }

  static async createCourse(fastify, data, creadoPor) {
    const { codigo_curso, nombre, descripcion, porcentaje_minimo_examen = 70, activo } = data;

    const query = `
      INSERT INTO cursos (codigo_curso, nombre, descripcion, porcentaje_minimo_examen,activo, creado_por)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const values = [codigo_curso, nombre, descripcion, porcentaje_minimo_examen, activo, creadoPor];
    const result = await fastify.pg.query(query, values);

    return result.rows[0];
  }

  static async getCourseById(fastify, id) {
    const query = `SELECT * FROM cursos WHERE id = $1`;
    const result = await fastify.pg.query(query, [id]);

    if (result.rows.length === 0) {
      const error = new Error('Curso no encontrado');
      error.code = 'COURSE_NOT_FOUND';
      throw error;
    }

    return result.rows[0];
  }

  static async updateCourse(fastify, id, data, usuarioId) {
    const { nombre, descripcion, porcentaje_minimo_examen, activo } = data;

    const result = await fastify.pg.query(`
      UPDATE cursos
      SET nombre = $1,
          descripcion = $2,
          porcentaje_minimo_examen = $3,
          activo = $4,
          fecha_actualizacion = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `, [nombre, descripcion, porcentaje_minimo_examen, activo, id]);

    if (result.rowCount === 0) {
      const error = new Error('Curso no encontrado');
      error.code = 'COURSE_NOT_FOUND';
      throw error;
    }

    return result.rows[0];
  }

  static async deleteCourse(fastify, id) {
    const result = await fastify.pg.query(`DELETE FROM cursos WHERE id = $1`, [id]);

    if (result.rowCount === 0) {
      const error = new Error('Curso no encontrado');
      error.code = 'COURSE_NOT_FOUND';
      throw error;
    }
  }

  static async getCourseStudents(fastify, cursoId, { page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;

    const query = `
      SELECT 
        u.id, 
        u.nombres, 
        u.apellidos, 
        u.email, 
        u.codigo_institucional,
        ce.estado, 
        ce.nota_final,
        ce.fecha_inscripcion,
        ce.fecha_estado
      FROM curso_estudiantes ce
      JOIN usuarios u ON ce.usuario_id = u.id
      WHERE ce.curso_id = $1
      ORDER BY u.apellidos, u.nombres
      LIMIT $2 OFFSET $3
    `;

    const result = await fastify.pg.query(query, [cursoId, limit, offset]);
    return result.rows;
  }

  // Obtener docentes de un curso
  static async getCourseTeachers(fastify, courseId) {
    const query = `
      SELECT 
        u.id,
        u.nombres,
        u.apellidos,
        u.email,
        u.codigo_institucional,
        cd.tipo_asignacion,
        cd.fecha_asignacion,
        cd.activo
      FROM usuarios u
      INNER JOIN curso_docentes cd ON u.id = cd.usuario_id
      WHERE cd.curso_id = $1
      ORDER BY cd.fecha_asignacion
    `;

    const result = await fastify.pg.query(query, [courseId]);
    return result.rows;
  }

  static async assignTeacherToCourse(fastify, cursoId, usuarioId, tipo_asignacion = 'titular') {
    const roleCheck = await fastify.pg.query(`
      SELECT 1 FROM usuario_roles WHERE usuario_id = $1 AND rol = 'docente'
    `, [usuarioId]);

    if (roleCheck.rowCount === 0) {
      const error = new Error('El usuario no tiene rol de docente');
      error.code = 'USER_NOT_TEACHER';
      throw error;
    }

    const exists = await fastify.pg.query(`
      SELECT 1 FROM curso_docentes WHERE curso_id = $1 AND usuario_id = $2
    `, [cursoId, usuarioId]);

    if (exists.rowCount > 0) {
      const error = new Error('El docente ya está asignado a este curso');
      error.code = 'ALREADY_ASSIGNED';
      throw error;
    }

    const result = await fastify.pg.query(`
      INSERT INTO curso_docentes (curso_id, usuario_id, tipo_asignacion)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [cursoId, usuarioId, tipo_asignacion]);

    return result.rows[0];
  }

  // Asignar estudiante a curso
  static async assignStudentToCourse(fastify, courseId, userId, estado = 'inscrito') {
    // Verificar que el usuario tiene rol de estudiante
    const userRoleQuery = `
      SELECT ur.rol 
      FROM usuario_roles ur 
      WHERE ur.usuario_id = $1 AND ur.rol = 'estudiante'
    `;

    const userRoleResult = await fastify.pg.query(userRoleQuery, [userId]);
    if (userRoleResult.rowCount === 0) {
      const error = new Error('El usuario no tiene rol de estudiante');
      error.code = 'USER_NOT_STUDENT';
      throw error;
    }

    // Verificar que el curso existe
    const courseQuery = 'SELECT id FROM cursos WHERE id = $1 AND activo = true';
    const courseResult = await fastify.pg.query(courseQuery, [courseId]);
    if (courseResult.rowCount === 0) {
      const error = new Error('Curso no encontrado');
      error.code = 'COURSE_NOT_FOUND';
      throw error;
    }

    // Verificar que no esté ya inscrito
    const enrollmentQuery = `
      SELECT id FROM curso_estudiantes 
      WHERE curso_id = $1 AND usuario_id = $2
    `;
    const enrollmentResult = await fastify.pg.query(enrollmentQuery, [courseId, userId]);
    if (enrollmentResult.rowCount > 0) {
      const error = new Error('El estudiante ya está inscrito en este curso');
      error.code = 'ALREADY_ENROLLED';
      throw error;
    }

    // Insertar inscripción
    const insertQuery = `
      INSERT INTO curso_estudiantes (curso_id, usuario_id, estado)
      VALUES ($1, $2, $3)
      RETURNING *
    `;

    const result = await fastify.pg.query(insertQuery, [courseId, userId, estado]);
    return result.rows[0];
  }

  // Actualizar estado de estudiante en curso
  static async updateStudentCourseStatus(fastify, courseId, studentId, { estado, nota_final }) {
    // Verificar que la inscripción existe
    const enrollmentQuery = `
      SELECT id FROM curso_estudiantes 
      WHERE curso_id = $1 AND usuario_id = $2
    `;
    const enrollmentResult = await fastify.pg.query(enrollmentQuery, [courseId, studentId]);
    if (enrollmentResult.rowCount === 0) {
      const error = new Error('Inscripción no encontrada');
      error.code = 'ENROLLMENT_NOT_FOUND';
      throw error;
    }

    // Construir query dinámicamente según los campos a actualizar
    const updates = [];
    const values = [courseId, studentId];
    let paramIndex = 3;

    if (estado !== undefined && estado !== null) {
      updates.push(`estado = $${paramIndex}`);
      values.push(estado);
      paramIndex++;
    }

    if (nota_final !== undefined && nota_final !== null) {
      updates.push(`nota_final = $${paramIndex}`);
      values.push(nota_final);
      paramIndex++;
    }

    if (updates.length === 0) {
      const error = new Error('No hay campos para actualizar');
      error.code = 'NO_FIELDS_TO_UPDATE';
      throw error;
    }

    updates.push('fecha_estado = CURRENT_TIMESTAMP');

    const updateQuery = `
      UPDATE curso_estudiantes 
      SET ${updates.join(', ')}
      WHERE curso_id = $1 AND usuario_id = $2
      RETURNING *
    `;

    const result = await fastify.pg.query(updateQuery, values);
    return result.rows[0];
  }

  static async getCourseLevels(fastify, cursoId, usuarioId) {
    // Aquí deberías enlazar con tu sistema de niveles si existe
    // Simulamos una respuesta vacía por ahora
    return []; // o consultar tabla "niveles" si la tienes
  }
}

module.exports = CursoService;