// src/services/usuarioService.js

function parsePgArray(arr) {
  if (typeof arr === 'string') {
    return arr.slice(1, -1).split(',').map(r => r.trim());
  }
  return Array.isArray(arr) ? arr.filter(Boolean) : [];
}

class UsuarioService {

  /**
   * Obtener perfil completo del usuario
   */
  static async getProfile(fastify, usuarioId) {
    try {
      const query = `
        SELECT u.*, array_agg(ur.rol) as roles
        FROM usuarios u
        LEFT JOIN usuario_roles ur ON u.id = ur.usuario_id
        WHERE u.id = $1
        GROUP BY u.id
      `;

      const result = await fastify.pg.query(query, [usuarioId]);

      if (result.rows.length === 0) {
        const error = new Error('Usuario no encontrado');
        error.code = 'USER_NOT_FOUND';
        throw error;
      }

      const usuario = result.rows[0];
      usuario.roles = usuario.roles.filter(Boolean);

      return usuario;

    } catch (error) {
      fastify.log.error('Error obteniendo perfil:', error);
      throw error;
    }
  }

  /**
   * Actualizar perfil del usuario
   */
  static async updateProfile(fastify, usuarioId, updateData) {
    try {
      const { nombres, apellidos } = updateData;

      const query = `
        UPDATE usuarios 
        SET nombres = COALESCE($1, nombres), 
            apellidos = COALESCE($2, apellidos),
            fecha_actualizacion = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `;

      const result = await fastify.pg.query(query, [nombres, apellidos, usuarioId]);

      return result.rows[0];

    } catch (error) {
      fastify.log.error('Error actualizando perfil:', error);
      throw error;
    }
  }

  /**
   * Obtener dashboard del estudiante
   */
  static async getDashboard(fastify, estudianteId) {
    try {
      // Información básica del estudiante
      const estudianteQuery = `
        SELECT u.id, u.nombres, u.apellidos, u.email
        FROM estudiantes e
        JOIN usuarios u ON e.usuario_id = u.id
        WHERE e.id = $1
      `;

      const estudianteResult = await fastify.pg.query(estudianteQuery, [estudianteId]);
      const estudiante = estudianteResult.rows[0];

      // Estadísticas generales
      const statsQuery = `
        SELECT 
          COUNT(DISTINCT ce.curso_id) as cursos_inscritos,
          COUNT(DISTINCT CASE WHEN pa.completado = true THEN pa.actividad_id END) as actividades_completadas,
          COALESCE(AVG(CASE WHEN pa.completado = true THEN pa.puntuacion END), 0) as promedio_general,
          COALESCE(MAX(eu.cantidad_actual), 0) as utmcoins,
          COALESCE(MAX(re.racha_actual_dias), 0) as racha_actual
        FROM estudiantes e
        LEFT JOIN curso_estudiantes ce ON e.id = (SELECT id FROM estudiantes WHERE usuario_id = ce.usuario_id)
        LEFT JOIN progreso_actividades pa ON e.id = pa.estudiante_id
        LEFT JOIN estudiante_utmcoins eu ON e.id = eu.estudiante_id
        LEFT JOIN rachas_estudiantes re ON e.id = re.estudiante_id
        WHERE e.id = $1
        GROUP BY e.id
      `;

      const statsResult = await fastify.pg.query(statsQuery, [estudianteId]);
      const estadisticas = statsResult.rows[0];

      // Cursos recientes
      const cursosQuery = `
        SELECT c.id, c.nombre, 
               COALESCE(AVG(pa.puntuacion), 0) as progreso,
               MAX(pa.fecha_completado) as ultima_actividad
        FROM curso_estudiantes ce
        JOIN cursos c ON ce.curso_id = c.id
        JOIN estudiantes e ON ce.usuario_id = e.usuario_id
        LEFT JOIN progreso_actividades pa ON e.id = pa.estudiante_id
        WHERE e.id = $1 AND ce.estado = 'inscrito'
        GROUP BY c.id, c.nombre
        ORDER BY ultima_actividad DESC NULLS LAST
        LIMIT 5
      `;

      const cursosResult = await fastify.pg.query(cursosQuery, [estudianteId]);

      // Próximas actividades desbloqueadas
      const actividadesQuery = `
        SELECT a.id, a.nombre, c.nombre as curso,
               COALESCE(pa.desbloqueado, false) as desbloqueado
        FROM actividades a
        JOIN tareas t ON a.tarea_id = t.id
        JOIN componentes comp ON t.componente_id = comp.id
        JOIN modulos m ON comp.modulo_id = m.id
        JOIN niveles n ON m.nivel_id = n.id
        JOIN cursos c ON n.curso_id = c.id
        LEFT JOIN progreso_actividades pa ON a.id = pa.actividad_id AND pa.estudiante_id = $1
        WHERE pa.desbloqueado = true AND (pa.completado = false OR pa.completado IS NULL)
        ORDER BY n.orden, m.orden, comp.orden, t.orden, a.orden
        LIMIT 10
      `;

      const actividadesResult = await fastify.pg.query(actividadesQuery, [estudianteId]);

      return {
        estudiante,
        estadisticas: {
          cursos_inscritos: parseInt(estadisticas.cursos_inscritos),
          actividades_completadas: parseInt(estadisticas.actividades_completadas),
          promedio_general: parseFloat(estadisticas.promedio_general),
          utmcoins: parseInt(estadisticas.utmcoins),
          racha_actual: parseInt(estadisticas.racha_actual)
        },
        cursos_recientes: cursosResult.rows,
        proximas_actividades: actividadesResult.rows
      };

    } catch (error) {
      fastify.log.error('Error obteniendo dashboard:', error);
      throw error;
    }
  }

  /**
   * Obtener progreso del usuario
   */
  static async getProgress(fastify, usuarioId, cursoId = null) {
    try {
      let progressQuery;
      let params;

      if (cursoId) {
        // Progreso específico de un curso usando la función SQL
        progressQuery = 'SELECT * FROM obtener_progreso_usuario_curso($1, $2)';
        params = [usuarioId, cursoId];
      } else {
        // Progreso general
        progressQuery = `
          SELECT 
            COALESCE(AVG(pa.puntuacion), 0) as porcentaje_completado,
            COUNT(CASE WHEN pa.completado = true THEN 1 END) as actividades_completadas,
            COUNT(pa.actividad_id) as total_actividades,
            COUNT(DISTINCT CASE WHEN pn.completado = true THEN pn.nivel_id END) as niveles_completados
          FROM estudiantes e
          LEFT JOIN progreso_actividades pa ON e.id = pa.estudiante_id
          LEFT JOIN progreso_niveles pn ON e.id = pn.estudiante_id
          WHERE e.usuario_id = $1
          GROUP BY e.id
        `;
        params = [usuarioId];
      }

      const result = await fastify.pg.query(progressQuery, params);

      if (cursoId) {
        return {
          curso_id: cursoId,
          niveles: result.rows
        };
      } else {
        return {
          progreso_general: result.rows[0] || {
            porcentaje_completado: 0,
            actividades_completadas: 0,
            total_actividades: 0,
            niveles_completados: 0
          }
        };
      }

    } catch (error) {
      fastify.log.error('Error obteniendo progreso:', error);
      throw error;
    }
  }

  /**
   * Obtener cursos del usuario
   */
  static async getUserCourses(fastify, usuarioId) {
    try {
      // Cursos como estudiante
      const estudianteQuery = `
        SELECT c.id, c.nombre, c.codigo_curso, ce.estado,
               COALESCE(AVG(pa.puntuacion), 0) as progreso,
               ce.fecha_inscripcion
        FROM curso_estudiantes ce
        JOIN cursos c ON ce.curso_id = c.id
        LEFT JOIN estudiantes e ON ce.usuario_id = e.usuario_id
        LEFT JOIN progreso_actividades pa ON e.id = pa.estudiante_id
        WHERE ce.usuario_id = $1
        GROUP BY c.id, c.nombre, c.codigo_curso, ce.estado, ce.fecha_inscripcion
        ORDER BY ce.fecha_inscripcion DESC
      `;

      // Cursos como docente
      const docenteQuery = `
        SELECT c.id, c.nombre, c.codigo_curso, cd.tipo_asignacion,
               COUNT(DISTINCT ce.usuario_id) as total_estudiantes
        FROM curso_docentes cd
        JOIN cursos c ON cd.curso_id = c.id
        LEFT JOIN curso_estudiantes ce ON c.id = ce.curso_id AND ce.estado = 'inscrito'
        WHERE cd.usuario_id = $1 AND cd.activo = true
        GROUP BY c.id, c.nombre, c.codigo_curso, cd.tipo_asignacion
        ORDER BY c.nombre
      `;

      const [estudianteResult, docenteResult] = await Promise.all([
        fastify.pg.query(estudianteQuery, [usuarioId]),
        fastify.pg.query(docenteQuery, [usuarioId])
      ]);

      return {
        cursos_estudiante: estudianteResult.rows,
        cursos_docente: docenteResult.rows
      };

    } catch (error) {
      fastify.log.error('Error obteniendo cursos del usuario:', error);
      throw error;
    }
  }

  /**
   * Inscribir usuario en un curso
   */
  static async enrollInCourse(fastify, usuarioId, cursoId) {
    try {
      return await fastify.db.withTransaction(async (client) => {
        // Verificar que el curso existe
        const cursoQuery = 'SELECT id, nombre FROM cursos WHERE id = $1 AND activo = true';
        const cursoResult = await client.query(cursoQuery, [cursoId]);

        if (cursoResult.rows.length === 0) {
          const error = new Error('Curso no encontrado');
          error.code = 'COURSE_NOT_FOUND';
          throw error;
        }

        // Verificar que no esté ya inscrito
        const inscripcionQuery = `
          SELECT id FROM curso_estudiantes 
          WHERE curso_id = $1 AND usuario_id = $2
        `;
        const inscripcionResult = await client.query(inscripcionQuery, [cursoId, usuarioId]);

        if (inscripcionResult.rows.length > 0) {
          const error = new Error('Ya estás inscrito en este curso');
          error.code = 'ALREADY_ENROLLED';
          throw error;
        }

        // Inscribir al estudiante
        const insertQuery = `
          INSERT INTO curso_estudiantes (curso_id, usuario_id)
          VALUES ($1, $2)
          RETURNING *
        `;
        const insertResult = await client.query(insertQuery, [cursoId, usuarioId]);

        return {
          message: 'Inscripción exitosa',
          inscripcion: insertResult.rows[0]
        };
      });

    } catch (error) {
      fastify.log.error('Error inscribiendo en curso:', error);
      throw error;
    }
  }

  static async getAllUsers(fastify) {
    try {
      const query = `
      SELECT 
  u.*,
  COALESCE(array_agg(ur.rol) FILTER (WHERE ur.rol IS NOT NULL), '{}') as roles
FROM usuarios u
LEFT JOIN usuario_roles ur ON u.id = ur.usuario_id
GROUP BY u.id
ORDER BY u.id ASC
    `;
      const result = await fastify.pg.query(query);

      return result.rows.map(u => ({
        ...u,
        roles: parsePgArray(u.roles)
      }));

    } catch (error) {
      fastify.log.error('❌ Error en getAllUsers:', error); // 👈 para ver si es la query u otra cosa
      throw error;
    }
  }

}

module.exports = UsuarioService;