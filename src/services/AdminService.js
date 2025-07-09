// src/services/AdminService.js
class AdminService {

    // === ESTADÍSTICAS DEL DASHBOARD ===

    static processUserRoles(user) {
        if (!user) return user;

        // Si roles es null o undefined, asignar array vacío
        if (!user.roles) {
            user.roles = [];
            return user;
        }

        // Si roles ya es un array, verificar que sean strings
        if (Array.isArray(user.roles)) {
            user.roles = user.roles.filter(role => role !== null && role !== undefined);
            return user;
        }

        // Si roles es un string (formato PostgreSQL array), convertir a array
        if (typeof user.roles === 'string') {
            // Formato: "{rol1,rol2}" -> ["rol1", "rol2"]
            user.roles = user.roles
                .replace(/[{}]/g, '') // Quitar llaves
                .split(',')           // Dividir por comas
                .map(role => role.trim()) // Limpiar espacios
                .filter(role => role.length > 0); // Filtrar vacíos
        }

        return user;
    }

    static async getDashboardStats(fastify) {
        try {
            // Consultas para obtener estadísticas generales
            const totalUsersQuery = 'SELECT COUNT(*) as total FROM usuarios WHERE activo = true';
            const totalStudentsQuery = `
        SELECT COUNT(DISTINCT u.id) as total 
        FROM usuarios u 
        JOIN usuario_roles ur ON u.id = ur.usuario_id 
        WHERE ur.rol = 'estudiante' AND u.activo = true
      `;
            const totalTeachersQuery = `
        SELECT COUNT(DISTINCT u.id) as total 
        FROM usuarios u 
        JOIN usuario_roles ur ON u.id = ur.usuario_id 
        WHERE ur.rol = 'docente' AND u.activo = true
      `;
            const totalCoursesQuery = 'SELECT COUNT(*) as total FROM cursos';
            const activeCoursesQuery = 'SELECT COUNT(*) as total FROM cursos WHERE activo = true';
            const recentRegistrationsQuery = `
        SELECT COUNT(*) as total 
        FROM usuarios 
        WHERE fecha_creacion >= NOW() - INTERVAL '7 days' AND activo = true
      `;

            // Ejecutar todas las consultas en paralelo
            const [
                totalUsersResult,
                totalStudentsResult,
                totalTeachersResult,
                totalCoursesResult,
                activeCoursesResult,
                recentRegistrationsResult
            ] = await Promise.all([
                fastify.pg.query(totalUsersQuery),
                fastify.pg.query(totalStudentsQuery),
                fastify.pg.query(totalTeachersQuery),
                fastify.pg.query(totalCoursesQuery),
                fastify.pg.query(activeCoursesQuery),
                fastify.pg.query(recentRegistrationsQuery)
            ]);

            return {
                totalUsers: parseInt(totalUsersResult.rows[0].total),
                totalStudents: parseInt(totalStudentsResult.rows[0].total),
                totalTeachers: parseInt(totalTeachersResult.rows[0].total),
                totalCourses: parseInt(totalCoursesResult.rows[0].total),
                activeCourses: parseInt(activeCoursesResult.rows[0].total),
                newRegistrations: parseInt(recentRegistrationsResult.rows[0].total),
                systemStatus: '99.9%' // Esto podrías calcularlo basado en logs o métricas reales
            };
        } catch (error) {
            fastify.log.error('Error obteniendo estadísticas del dashboard:', error);
            throw error;
        }
    }

    // === GESTIÓN DE USUARIOS ===

    static async getUsers(fastify, { page = 1, limit = 20, search = '', role = '', status = '' }) {
        try {
            const offset = (page - 1) * limit;

            // Construir query dinámicamente
            let whereConditions = ['1=1'];
            let queryParams = [];
            let paramIndex = 1;

            // Filtro por búsqueda
            if (search) {
                whereConditions.push(`(u.nombres ILIKE $${paramIndex} OR u.apellidos ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex} OR u.codigo_institucional ILIKE $${paramIndex})`);
                queryParams.push(`%${search}%`);
                paramIndex++;
            }

            // Filtro por rol
            if (role) {
                whereConditions.push(`ur.rol = $${paramIndex}`);
                queryParams.push(role);
                paramIndex++;
            }

            // Filtro por estado
            if (status) {
                const isActive = status === 'activo';
                whereConditions.push(`u.activo = $${paramIndex}`);
                queryParams.push(isActive);
                paramIndex++;
            }

            const whereClause = whereConditions.join(' AND ');

            // Query principal para obtener usuarios
            const usersQuery = `
      SELECT DISTINCT
        u.id,
        u.codigo_institucional,
        u.email,
        u.nombres,
        u.apellidos,
        u.activo,
        u.fecha_creacion,
        u.fecha_actualizacion,
        COALESCE(
          array_agg(DISTINCT ur.rol) FILTER (WHERE ur.rol IS NOT NULL), 
          ARRAY[]::text[]
        ) as roles
      FROM usuarios u
      LEFT JOIN usuario_roles ur ON u.id = ur.usuario_id
      WHERE ${whereClause}
      GROUP BY u.id, u.codigo_institucional, u.email, u.nombres, u.apellidos, u.activo, u.fecha_creacion, u.fecha_actualizacion
      ORDER BY u.fecha_creacion DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

            // Query para contar total
            const countQuery = `
      SELECT COUNT(DISTINCT u.id) as total
      FROM usuarios u
      LEFT JOIN usuario_roles ur ON u.id = ur.usuario_id
      WHERE ${whereClause}
    `;

            queryParams.push(limit, offset);

            const [usersResult, countResult] = await Promise.all([
                fastify.pg.query(usersQuery, queryParams),
                fastify.pg.query(countQuery, queryParams.slice(0, -2)) // Remover limit y offset para count
            ]);

            const total = parseInt(countResult.rows[0].total);
            const totalPages = Math.ceil(total / limit);

            // PROCESAR USUARIOS para asegurar formato correcto de roles
            const processedUsers = usersResult.rows.map(user => {
                return this.processUserRoles(user);
            });

            return {
                users: processedUsers,
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
            fastify.log.error('Error obteniendo usuarios:', error);
            throw error;
        }
    }

    static async getUserStats(fastify) {
        try {
            const statsQuery = `
        SELECT 
          COUNT(*) as total_usuarios,
          COUNT(*) FILTER (WHERE activo = true) as usuarios_activos,
          COUNT(*) FILTER (WHERE activo = false) as usuarios_inactivos,
          COUNT(*) FILTER (WHERE fecha_creacion >= NOW() - INTERVAL '30 days') as nuevos_ultimo_mes,
          COUNT(*) FILTER (WHERE fecha_creacion >= NOW() - INTERVAL '7 days') as nuevos_ultima_semana
        FROM usuarios
      `;

            const rolesQuery = `
        SELECT 
          ur.rol,
          COUNT(DISTINCT ur.usuario_id) as cantidad
        FROM usuario_roles ur
        JOIN usuarios u ON ur.usuario_id = u.id
        WHERE u.activo = true
        GROUP BY ur.rol
        ORDER BY cantidad DESC
      `;

            const [statsResult, rolesResult] = await Promise.all([
                fastify.pg.query(statsQuery),
                fastify.pg.query(rolesQuery)
            ]);

            return {
                ...statsResult.rows[0],
                roles_distribution: rolesResult.rows
            };
        } catch (error) {
            fastify.log.error('Error obteniendo estadísticas de usuarios:', error);
            throw error;
        }
    }

    static async getUserById(fastify, id) {
        try {
            const userQuery = `
      SELECT 
        u.id,
        u.codigo_institucional,
        u.email,
        u.nombres,
        u.apellidos,
        u.activo,
        u.fecha_creacion,
        u.fecha_actualizacion,
        COALESCE(
          array_agg(ur.rol) FILTER (WHERE ur.rol IS NOT NULL), 
          ARRAY[]::text[]
        ) as roles
      FROM usuarios u
      LEFT JOIN usuario_roles ur ON u.id = ur.usuario_id
      WHERE u.id = $1
      GROUP BY u.id
    `;

            const result = await fastify.pg.query(userQuery, [id]);
            const user = result.rows[0] || null;

            // Procesar roles si el usuario existe
            return user ? this.processUserRoles(user) : null;
        } catch (error) {
            fastify.log.error('Error obteniendo usuario por ID:', error);
            throw error;
        }
    }

    static async updateUser(fastify, id, userData) {
        try {
            const { codigo_institucional, email, nombres, apellidos } = userData;

            let updateQuery = `
        UPDATE usuarios 
        SET codigo_institucional = $1, email = $2, nombres = $3, apellidos = $4, fecha_actualizacion = CURRENT_TIMESTAMP
      `;
            let queryParams = [codigo_institucional, email, nombres, apellidos]

            updateQuery += ` WHERE id = $${queryParams.length + 1} RETURNING *`;
            queryParams.push(id);

            const result = await fastify.pg.query(updateQuery, queryParams);

            if (result.rows.length === 0) {
                return null;
            }

            return {
                message: 'Usuario actualizado exitosamente',
                usuario: result.rows[0]
            };
        } catch (error) {
            fastify.log.error('Error actualizando usuario:', error);
            throw error;
        }
    }

    static async deleteUser(fastify, id) {
        try {
            // En lugar de eliminar, desactivar el usuario
            const updateQuery = `
        UPDATE usuarios 
        SET activo = false, fecha_actualizacion = CURRENT_TIMESTAMP 
        WHERE id = $1 AND activo = true
        RETURNING id
      `;

            const result = await fastify.pg.query(updateQuery, [id]);
            return result.rows.length > 0;
        } catch (error) {
            fastify.log.error('Error eliminando usuario:', error);
            throw error;
        }
    }

    static async changeUserRole(fastify, userId, newRole) {
        try {
            // Primero eliminar roles existentes
            await fastify.pg.query('DELETE FROM usuario_roles WHERE usuario_id = $1', [userId]);

            // Insertar nuevo rol
            await fastify.pg.query(
                'INSERT INTO usuario_roles (usuario_id, rol) VALUES ($1, $2)',
                [userId, newRole]
            );

            // Verificar que el usuario existe
            const userCheck = await fastify.pg.query('SELECT id FROM usuarios WHERE id = $1', [userId]);
            return userCheck.rows.length > 0;
        } catch (error) {
            fastify.log.error('Error cambiando rol de usuario:', error);
            throw error;
        }
    }

    static async toggleUserStatus(fastify, userId, active) {
        try {
            const updateQuery = `
        UPDATE usuarios 
        SET activo = $1, fecha_actualizacion = CURRENT_TIMESTAMP 
        WHERE id = $2 
        RETURNING id
      `;

            const result = await fastify.pg.query(updateQuery, [active, userId]);
            return result.rows.length > 0;
        } catch (error) {
            fastify.log.error('Error cambiando estado de usuario:', error);
            throw error;
        }
    }

    // === GESTIÓN DE ESTUDIANTES (ACTUALIZAR EL MÉTODO EXISTENTE) ===

    static async getStudents(fastify, { page = 1, limit = 20, search = '', course = '', includeEnrollments = false }) {
        try {

            const offset = (page - 1) * limit;

            let whereConditions = ["ur.rol = 'estudiante'", "u.activo = true"];
            let queryParams = [];
            let paramIndex = 1;

            // Filtro por búsqueda
            if (search) {
                whereConditions.push(`(u.nombres ILIKE $${paramIndex} OR u.apellidos ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex} OR u.codigo_institucional ILIKE $${paramIndex})`);
                queryParams.push(`%${search}%`);
                paramIndex++;
            }

            // Filtro por curso - NUEVO
            let courseJoinCondition = '';
            if (course) {
                courseJoinCondition = `INNER JOIN curso_estudiantes ce_filter ON u.id = ce_filter.usuario_id AND ce_filter.curso_id = $${paramIndex}`;
                queryParams.push(parseInt(course));
                paramIndex++;
            }

            const whereClause = whereConditions.join(' AND ');

            let studentsQuery;
            if (includeEnrollments) {
                // Query con inscripciones de cursos
                studentsQuery = `
            SELECT 
                u.id,
                u.codigo_institucional,
                u.email,
                u.nombres,
                u.apellidos,
                u.activo,
                u.fecha_creacion,
                COALESCE(
                    json_agg(
                        CASE 
                            WHEN ce.id IS NOT NULL THEN
                                json_build_object(
                                    'id', ce.id,
                                    'curso_id', ce.curso_id,
                                    'curso_nombre', c.nombre,
                                    'curso_codigo', c.codigo_curso,
                                    'estado', ce.estado::text,
                                    'fecha_inscripcion', ce.fecha_inscripcion,
                                    'fecha_estado', ce.fecha_estado,
                                    'nota_final', ce.nota_final
                                )
                            ELSE NULL
                        END
                    ) FILTER (WHERE ce.id IS NOT NULL),
                    '[]'::json
                ) as inscripciones
            FROM usuarios u
            JOIN usuario_roles ur ON u.id = ur.usuario_id
            ${courseJoinCondition}
            LEFT JOIN curso_estudiantes ce ON u.id = ce.usuario_id
            LEFT JOIN cursos c ON ce.curso_id = c.id
            WHERE ${whereClause}
            GROUP BY u.id, u.codigo_institucional, u.email, u.nombres, u.apellidos, u.activo, u.fecha_creacion
            ORDER BY u.fecha_creacion DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
            } else {
                // Query sin inscripciones (más rápido)
                studentsQuery = `
            SELECT 
                u.id,
                u.codigo_institucional,
                u.email,
                u.nombres,
                u.apellidos,
                u.activo,
                u.fecha_creacion,
                COUNT(DISTINCT ce.curso_id) as cursos_inscritos
            FROM usuarios u
            JOIN usuario_roles ur ON u.id = ur.usuario_id
            ${courseJoinCondition}
            LEFT JOIN curso_estudiantes ce ON u.id = ce.usuario_id
            WHERE ${whereClause}
            GROUP BY u.id, u.codigo_institucional, u.email, u.nombres, u.apellidos, u.activo, u.fecha_creacion
            ORDER BY u.fecha_creacion DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
            }

            // Query para contar total
            const countQuery = `
        SELECT COUNT(DISTINCT u.id) as total
        FROM usuarios u
        JOIN usuario_roles ur ON u.id = ur.usuario_id
        ${courseJoinCondition}
        WHERE ${whereClause}
    `;

            queryParams.push(limit, offset);


            // Ejecutar queries
            const [studentsResult, countResult] = await Promise.all([
                fastify.pg.query(studentsQuery, queryParams),
                fastify.pg.query(countQuery, queryParams.slice(0, -2))
            ]);

            const total = parseInt(countResult.rows[0].total);
            const totalPages = Math.ceil(total / limit);

            // Procesar inscripciones si están incluidas
            const processedStudents = studentsResult.rows.map(student => {
                if (includeEnrollments && student.inscripciones) {
                    // Las inscripciones ya vienen como JSON desde PostgreSQL
                    if (typeof student.inscripciones === 'string') {
                        try {
                            student.inscripciones = JSON.parse(student.inscripciones);
                        } catch (e) {
                            console.warn('Error parsing inscripciones JSON:', e);
                            student.inscripciones = [];
                        }
                    }
                }
                return student;
            });

            return {
                students: processedStudents,
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
            console.error('❌ Error obteniendo estudiantes:', error);
            console.error('Stack trace:', error.stack);
            fastify.log.error('Error obteniendo estudiantes:', error);
            throw error;
        }
    }

    // Obtener cursos de un estudiante específico
    static async getStudentCourses(fastify, studentId, { page = 1, limit = 20 }) {
        try {
            const offset = (page - 1) * limit;

            const query = `
      SELECT 
        ce.id AS inscripcion_id,
        c.id AS curso_id,
        c.nombre,
        c.codigo_curso,
        ce.estado::text,
        ce.fecha_inscripcion,
        ce.fecha_estado,
        ce.nota_final
      FROM curso_estudiantes ce
      JOIN cursos c ON ce.curso_id = c.id
      WHERE ce.usuario_id = $1
      ORDER BY ce.fecha_inscripcion DESC
      LIMIT $2 OFFSET $3
    `;

            const countQuery = `
      SELECT COUNT(*) AS total
      FROM curso_estudiantes
      WHERE usuario_id = $1
    `;

            const [coursesResult, countResult] = await Promise.all([
                fastify.pg.query(query, [studentId, limit, offset]),
                fastify.pg.query(countQuery, [studentId])
            ]);

            const total = parseInt(countResult.rows[0].total);
            const totalPages = Math.ceil(total / limit);

            return {
                cursos: coursesResult.rows,
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
            console.error('❌ Error obteniendo cursos del estudiante:', error);
            throw error;
        }
    }

    static async enrollStudent(fastify, courseId, studentData) {
        const { usuario_id } = studentData;
        try {
            const query = `
      INSERT INTO curso_estudiantes (curso_id, usuario_id, fecha_inscripcion)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      RETURNING id
    `;
            const result = await fastify.pg.query(query, [courseId, usuario_id]);
            return { id: result.rows[0].id, success: true };
        } catch (error) {
            console.error('❌ Error inscribiendo estudiante:', error);
            throw error;
        }
    }

    static async updateEnrollment(fastify, enrollmentId, enrollmentData) {
        const { estado, nota_final } = enrollmentData;
        try {
            // Convertir nota_final: si está vacía o es string vacío, usar NULL
            const notaFinalValue = nota_final && nota_final !== "" ? parseFloat(nota_final) : null;

            const query = `
            UPDATE curso_estudiantes
            SET estado = $1,
                nota_final = $2,
                fecha_estado = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING *
        `;

            const result = await fastify.pg.query(query, [estado, notaFinalValue, enrollmentId]);

            if (result.rowCount === 0) {
                throw new Error('Inscripción no encontrada');
            }

            return result.rows[0];
        } catch (error) {
            console.error('❌ Error actualizando inscripción:', error);
            throw error;
        }
    }


    static async deleteEnrollment(fastify, enrollmentId) {
        try {
            const query = `
      DELETE FROM curso_estudiantes
      WHERE id = $1
    `;
            const result = await fastify.pg.query(query, [enrollmentId]);
            if (result.rowCount === 0) throw new Error('Inscripción no encontrada');
            return { success: true };
        } catch (error) {
            console.error('❌ Error eliminando inscripción:', error);
            throw error;
        }
    }

    // === NUEVOS MÉTODOS PARA GESTIÓN DE INSCRIPCIONES ===

    static async updateStudentEnrollment(fastify, enrollmentId, enrollmentData) {
        try {
            const { estado, nota_final } = enrollmentData;

            // Verificar que la inscripción existe
            const checkQuery = 'SELECT id FROM curso_estudiantes WHERE id = $1';
            const checkResult = await fastify.pg.query(checkQuery, [enrollmentId]);

            if (checkResult.rows.length === 0) {
                return null;
            }

            // Actualizar la inscripción
            let updateQuery = `
            UPDATE curso_estudiantes 
            SET estado = $1, fecha_estado = CURRENT_TIMESTAMP
        `;
            let queryParams = [estado];
            let paramIndex = 2;

            // Agregar nota_final si se proporciona
            if (nota_final !== undefined && nota_final !== null && nota_final !== '') {
                updateQuery += `, nota_final = $${paramIndex}`;
                queryParams.push(parseFloat(nota_final));
                paramIndex++;
            }

            updateQuery += ` WHERE id = $${paramIndex} RETURNING *`;
            queryParams.push(enrollmentId);

            const updateResult = await fastify.pg.query(updateQuery, queryParams);

            return {
                message: 'Inscripción actualizada exitosamente',
                enrollment: updateResult.rows[0]
            };
        } catch (error) {
            console.error('❌ Error actualizando inscripción:', error);
            fastify.log.error('Error actualizando inscripción de estudiante:', error);
            throw error;
        }
    }

    static async removeStudentFromCourse(fastify, enrollmentId) {
        try {
            // Verificar que la inscripción existe
            const checkQuery = 'SELECT id FROM curso_estudiantes WHERE id = $1';
            const checkResult = await fastify.pg.query(checkQuery, [enrollmentId]);

            if (checkResult.rows.length === 0) {
                return null;
            }

            // Eliminar la inscripción
            const deleteQuery = 'DELETE FROM curso_estudiantes WHERE id = $1';
            await fastify.pg.query(deleteQuery, [enrollmentId]);

            return {
                message: 'Inscripción removida exitosamente'
            };
        } catch (error) {
            console.error('❌ Error removiendo inscripción:', error);
            fastify.log.error('Error removiendo inscripción de estudiante:', error);
            throw error;
        }
    }

    static async getStudentCourses(fastify, studentId, { page = 1, limit = 20 } = {}) {
        try {
            // Verificar que el estudiante existe
            const studentQuery = `
            SELECT u.id, u.nombres, u.apellidos, u.email
            FROM usuarios u
            JOIN usuario_roles ur ON u.id = ur.usuario_id
            WHERE u.id = $1 AND ur.rol = 'estudiante' AND u.activo = true
        `;
            const studentResult = await fastify.pg.query(studentQuery, [studentId]);

            if (studentResult.rows.length === 0) {
                return null;
            }

            // Obtener cursos del estudiante
            const coursesQuery = `
            SELECT 
                ce.id as enrollment_id,
                ce.estado,
                ce.fecha_inscripcion,
                ce.fecha_estado,
                ce.nota_final,
                c.id as curso_id,
                c.codigo_curso,
                c.nombre as curso_nombre,
                c.descripcion,
                c.porcentaje_minimo_examen,
                c.activo as curso_activo
            FROM curso_estudiantes ce
            JOIN cursos c ON ce.curso_id = c.id
            WHERE ce.usuario_id = $1
            ORDER BY ce.fecha_inscripcion DESC
            LIMIT $2 OFFSET $3
        `;

            const offset = (page - 1) * limit;
            const coursesResult = await fastify.pg.query(coursesQuery, [studentId, limit, offset]);

            // Contar total de cursos
            const countQuery = `
            SELECT COUNT(*) as total
            FROM curso_estudiantes ce
            WHERE ce.usuario_id = $1
        `;
            const countResult = await fastify.pg.query(countQuery, [studentId]);

            const total = parseInt(countResult.rows[0].total);
            const totalPages = Math.ceil(total / limit);

            return {
                student: studentResult.rows[0],
                courses: coursesResult.rows,
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
            console.error('❌ Error obteniendo cursos del estudiante:', error);
            fastify.log.error('Error obteniendo cursos del estudiante:', error);
            throw error;
        }
    }

    // === GESTIÓN DE DOCENTES ===
    static async getTeachers(fastify, { page = 1, limit = 20, search = '', department = '', includeAssignments = false }) {
        try {
            const offset = (page - 1) * limit;

            let whereConditions = ["ur.rol = 'docente'", "u.activo = true"];
            let queryParams = [];
            let paramIndex = 1;

            // Filtro por búsqueda
            if (search) {
                whereConditions.push(`(u.nombres ILIKE $${paramIndex} OR u.apellidos ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex} OR u.codigo_institucional ILIKE $${paramIndex})`);
                queryParams.push(`%${search}%`);
                paramIndex++;
            }

            const whereClause = whereConditions.join(' AND ');

            let teachersQuery;
            if (includeAssignments) {
                // Query con asignaciones de cursos (CORREGIDO: sin telefono)
                teachersQuery = `
                SELECT 
                    u.id,
                    u.codigo_institucional,
                    u.email,
                    u.nombres,
                    u.apellidos,
                    u.activo,
                    u.fecha_creacion,
                    COALESCE(
                        json_agg(
                            CASE 
                                WHEN cd.id IS NOT NULL THEN
                                    json_build_object(
                                        'id', cd.id,
                                        'curso_id', cd.curso_id,
                                        'curso_nombre', c.nombre,
                                        'curso_codigo', c.codigo_curso,
                                        'tipo_asignacion', cd.tipo_asignacion::text,
                                        'fecha_asignacion', cd.fecha_asignacion,
                                        'activo', cd.activo
                                    )
                                ELSE NULL
                            END
                        ) FILTER (WHERE cd.id IS NOT NULL),
                        '[]'::json
                    ) as asignaciones
                FROM usuarios u
                JOIN usuario_roles ur ON u.id = ur.usuario_id
                LEFT JOIN curso_docentes cd ON u.id = cd.usuario_id
                LEFT JOIN cursos c ON cd.curso_id = c.id
                WHERE ${whereClause}
                GROUP BY u.id, u.codigo_institucional, u.email, u.nombres, u.apellidos, u.activo, u.fecha_creacion
                ORDER BY u.fecha_creacion DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `;
            } else {
                // Query sin asignaciones (más rápido) (CORREGIDO: sin telefono)
                teachersQuery = `
                SELECT 
                    u.id,
                    u.codigo_institucional,
                    u.email,
                    u.nombres,
                    u.apellidos,
                    u.activo,
                    u.fecha_creacion,
                    COUNT(DISTINCT cd.curso_id) as cursos_asignados
                FROM usuarios u
                JOIN usuario_roles ur ON u.id = ur.usuario_id
                LEFT JOIN curso_docentes cd ON u.id = cd.usuario_id AND cd.activo = true
                WHERE ${whereClause}
                GROUP BY u.id, u.codigo_institucional, u.email, u.nombres, u.apellidos, u.activo, u.fecha_creacion
                ORDER BY u.fecha_creacion DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `;
            }

            // Query para contar total
            const countQuery = `
            SELECT COUNT(DISTINCT u.id) as total
            FROM usuarios u
            JOIN usuario_roles ur ON u.id = ur.usuario_id
            WHERE ${whereClause}
        `;

            queryParams.push(limit, offset);

            // Ejecutar queries
            const [teachersResult, countResult] = await Promise.all([
                fastify.pg.query(teachersQuery, queryParams),
                fastify.pg.query(countQuery, queryParams.slice(0, -2))
            ]);

            const total = parseInt(countResult.rows[0].total);
            const totalPages = Math.ceil(total / limit);

            // Procesar asignaciones si están incluidas
            const processedTeachers = teachersResult.rows.map(teacher => {
                if (includeAssignments && teacher.asignaciones) {
                    // Las asignaciones ya vienen como JSON desde PostgreSQL
                    if (typeof teacher.asignaciones === 'string') {
                        try {
                            teacher.asignaciones = JSON.parse(teacher.asignaciones);
                        } catch (e) {
                            console.warn('Error parsing asignaciones JSON:', e);
                            teacher.asignaciones = [];
                        }
                    }
                }
                return teacher;
            });

            return {
                teachers: processedTeachers,
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
            console.error('❌ Error obteniendo docentes:', error);
            console.error('Stack trace:', error.stack);
            fastify.log.error('Error obteniendo docentes:', error);
            throw error;
        }
    }

    // Agregar estos nuevos métodos al AdminService

    static async updateTeacherAssignment(fastify, assignmentId, assignmentData) {
        try {
            const { tipo_asignacion, activo } = assignmentData;

            // Verificar que la asignación existe
            const checkQuery = 'SELECT id FROM curso_docentes WHERE id = $1';
            const checkResult = await fastify.pg.query(checkQuery, [assignmentId]);

            if (checkResult.rows.length === 0) {
                return null;
            }

            // Actualizar la asignación
            const updateQuery = `
            UPDATE curso_docentes 
            SET tipo_asignacion = $1, activo = $2, fecha_asignacion = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING *
        `;

            const updateResult = await fastify.pg.query(updateQuery, [tipo_asignacion, activo, assignmentId]);

            return {
                message: 'Asignación actualizada exitosamente',
                assignment: updateResult.rows[0]
            };
        } catch (error) {
            console.error('❌ Error actualizando asignación:', error);
            fastify.log.error('Error actualizando asignación de docente:', error);
            throw error;
        }
    }

    static async removeTeacherFromCourse(fastify, assignmentId) {
        try {
            // Verificar que la asignación existe
            const checkQuery = 'SELECT id FROM curso_docentes WHERE id = $1';
            const checkResult = await fastify.pg.query(checkQuery, [assignmentId]);

            if (checkResult.rows.length === 0) {
                return null;
            }

            // Eliminar la asignación
            const deleteQuery = 'DELETE FROM curso_docentes WHERE id = $1';
            await fastify.pg.query(deleteQuery, [assignmentId]);


            return {
                message: 'Asignación removida exitosamente'
            };
        } catch (error) {
            console.error('❌ Error removiendo asignación:', error);
            fastify.log.error('Error removiendo asignación de docente:', error);
            throw error;
        }
    }

    static async getTeacherCourses(fastify, teacherId, { page = 1, limit = 20 } = {}) {
        try {

            // Verificar que el docente existe
            const teacherQuery = `
            SELECT u.id, u.nombres, u.apellidos, u.email
            FROM usuarios u
            JOIN usuario_roles ur ON u.id = ur.usuario_id
            WHERE u.id = $1 AND ur.rol = 'docente' AND u.activo = true
        `;
            const teacherResult = await fastify.pg.query(teacherQuery, [teacherId]);

            if (teacherResult.rows.length === 0) {
                return null;
            }

            // Obtener cursos asignados al docente
            const coursesQuery = `
            SELECT 
                cd.id as assignment_id,
                cd.tipo_asignacion,
                cd.fecha_asignacion,
                cd.activo,
                c.id as curso_id,
                c.codigo_curso,
                c.nombre as curso_nombre,
                c.descripcion,
                c.porcentaje_minimo_examen,
                c.activo as curso_activo
            FROM curso_docentes cd
            JOIN cursos c ON cd.curso_id = c.id
            WHERE cd.usuario_id = $1
            ORDER BY cd.fecha_asignacion DESC
            LIMIT $2 OFFSET $3
        `;

            const offset = (page - 1) * limit;
            const coursesResult = await fastify.pg.query(coursesQuery, [teacherId, limit, offset]);

            // Contar total de cursos
            const countQuery = `
            SELECT COUNT(*) as total
            FROM curso_docentes cd
            WHERE cd.usuario_id = $1
        `;
            const countResult = await fastify.pg.query(countQuery, [teacherId]);

            const total = parseInt(countResult.rows[0].total);
            const totalPages = Math.ceil(total / limit);


            return {
                teacher: teacherResult.rows[0],
                courses: coursesResult.rows,
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
            console.error('❌ Error obteniendo cursos del docente:', error);
            fastify.log.error('Error obteniendo cursos del docente:', error);
            throw error;
        }
    }

    // === ESTADÍSTICAS DE CURSOS ===

    static async getCourseStats(fastify) {
        try {
            const statsQuery = `
        SELECT 
          COUNT(*) as total_cursos,
          COUNT(*) FILTER (WHERE activo = true) as cursos_activos,
          COUNT(*) FILTER (WHERE activo = false) as cursos_inactivos,
          COUNT(*) FILTER (WHERE fecha_creacion >= NOW() - INTERVAL '30 days') as nuevos_ultimo_mes,
          AVG(porcentaje_minimo_examen) as promedio_porcentaje_minimo
        FROM cursos
      `;

            const enrollmentQuery = `
        SELECT 
          COUNT(*) as total_inscripciones,
          COUNT(DISTINCT usuario_id) as estudiantes_unicos,
          COUNT(DISTINCT curso_id) as cursos_con_estudiantes
        FROM inscripciones_estudiantes
      `;

            const [statsResult, enrollmentResult] = await Promise.all([
                fastify.pg.query(statsQuery),
                fastify.pg.query(enrollmentQuery)
            ]);

            return {
                ...statsResult.rows[0],
                ...enrollmentResult.rows[0],
                promedio_porcentaje_minimo: parseFloat(statsResult.rows[0].promedio_porcentaje_minimo || 0).toFixed(2)
            };
        } catch (error) {
            fastify.log.error('Error obteniendo estadísticas de cursos:', error);
            throw error;
        }
    }

    // === ACTIVIDAD RECIENTE ===

    static async getRecentActivity(fastify, { page = 1, limit = 10, type = '' }) {
        try {
            const offset = (page - 1) * limit;

            // Esta es una implementación básica. Podrías tener una tabla específica de logs/actividad
            const activityQuery = `
        (
          SELECT 
            'user_created' as tipo,
            CONCAT(nombres, ' ', apellidos) as descripcion,
            fecha_creacion as fecha,
            'usuario' as entidad
          FROM usuarios 
          WHERE fecha_creacion >= NOW() - INTERVAL '30 days'
        )
        UNION ALL
        (
          SELECT 
            'course_created' as tipo,
            nombre as descripcion,
            fecha_creacion as fecha,
            'curso' as entidad
          FROM cursos 
          WHERE fecha_creacion >= NOW() - INTERVAL '30 days'
        )
        ORDER BY fecha DESC
        LIMIT $1 OFFSET $2
      `;

            const countQuery = `
        SELECT COUNT(*) as total FROM (
          (SELECT id FROM usuarios WHERE fecha_creacion >= NOW() - INTERVAL '30 days')
          UNION ALL
          (SELECT id FROM cursos WHERE fecha_creacion >= NOW() - INTERVAL '30 days')
        ) as combined
      `;

            const [activityResult, countResult] = await Promise.all([
                fastify.pg.query(activityQuery, [limit, offset]),
                fastify.pg.query(countQuery)
            ]);

            const total = parseInt(countResult.rows[0].total);
            const totalPages = Math.ceil(total / limit);

            return {
                activity: activityResult.rows,
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
            fastify.log.error('Error obteniendo actividad reciente:', error);
            throw error;
        }
    }

    // === REGISTROS RECIENTES ===

    static async getRecentRegistrations(fastify, { days = 7, limit = 50 }) {
        try {
            const registrationsQuery = `
        SELECT 
          u.id,
          u.codigo_institucional,
          u.email,
          u.nombres,
          u.apellidos,
          u.fecha_creacion,
          array_agg(ur.rol) as roles
        FROM usuarios u
        LEFT JOIN usuario_roles ur ON u.id = ur.usuario_id
        WHERE u.fecha_creacion >= NOW() - INTERVAL '${days} days'
        AND u.activo = true
        GROUP BY u.id
        ORDER BY u.fecha_creacion DESC
        LIMIT $1
      `;

            const result = await fastify.pg.query(registrationsQuery, [limit]);

            return {
                registrations: result.rows,
                period: `${days} días`,
                total: result.rows.length
            };
        } catch (error) {
            fastify.log.error('Error obteniendo registros recientes:', error);
            throw error;
        }
    }

    // === REPORTES ===

    static async getReports(fastify, { page = 1, limit = 20, type = '', dateFrom = '', dateTo = '' }) {
        try {
            // Esta es una implementación básica para reportes
            // En una implementación real, tendrías una tabla específica para reportes generados

            const offset = (page - 1) * limit;

            // Por ahora, devolvemos reportes simulados basados en datos reales
            const reportsData = [
                {
                    id: 1,
                    tipo: 'usuarios',
                    nombre: 'Reporte de Usuarios Activos',
                    descripcion: 'Lista completa de usuarios activos en el sistema',
                    fecha_generacion: new Date(),
                    generado_por: 'Sistema',
                    estado: 'completado'
                },
                {
                    id: 2,
                    tipo: 'cursos',
                    nombre: 'Estadísticas de Cursos',
                    descripcion: 'Análisis de inscripciones y rendimiento por curso',
                    fecha_generacion: new Date(Date.now() - 86400000), // Ayer
                    generado_por: 'Administrador',
                    estado: 'completado'
                },
                {
                    id: 3,
                    tipo: 'actividad',
                    nombre: 'Actividad del Sistema',
                    descripcion: 'Log de actividades y accesos al sistema',
                    fecha_generacion: new Date(Date.now() - 172800000), // Hace 2 días
                    generado_por: 'Sistema',
                    estado: 'completado'
                }
            ];

            return {
                reports: reportsData.slice(offset, offset + limit),
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: reportsData.length,
                    totalPages: Math.ceil(reportsData.length / limit),
                    hasNext: page < Math.ceil(reportsData.length / limit),
                    hasPrev: page > 1
                }
            };
        } catch (error) {
            fastify.log.error('Error obteniendo reportes:', error);
            throw error;
        }
    }

    static async generateReport(fastify, type, parameters) {
        try {
            let reportData = {};

            switch (type) {
                case 'usuarios':
                    reportData = await this._generateUserReport(fastify, parameters);
                    break;
                case 'cursos':
                    reportData = await this._generateCourseReport(fastify, parameters);
                    break;
                case 'actividad':
                    reportData = await this._generateActivityReport(fastify, parameters);
                    break;
                default:
                    throw new Error(`Tipo de reporte no soportado: ${type}`);
            }

            return {
                id: Date.now(), // En una implementación real, guardarías esto en BD
                tipo: type,
                fecha_generacion: new Date(),
                estado: 'completado',
                datos: reportData
            };
        } catch (error) {
            fastify.log.error('Error generando reporte:', error);
            throw error;
        }
    }

    // === MÉTODOS PRIVADOS PARA REPORTES ===

    static async _generateUserReport(fastify, parameters) {
        const usersQuery = `
      SELECT 
        u.id,
        u.codigo_institucional,
        u.email,
        u.nombres,
        u.apellidos,
        u.activo,
        u.fecha_creacion,
        array_agg(ur.rol) as roles
      FROM usuarios u
      LEFT JOIN usuario_roles ur ON u.id = ur.usuario_id
      GROUP BY u.id
      ORDER BY u.fecha_creacion DESC
    `;

        const result = await fastify.pg.query(usersQuery);
        return {
            total_usuarios: result.rows.length,
            usuarios: result.rows
        };
    }

    static async _generateCourseReport(fastify, parameters) {
        const coursesQuery = `
      SELECT 
        c.id,
        c.codigo_curso,
        c.nombre,
        c.descripcion,
        c.activo,
        c.fecha_creacion,
        COUNT(DISTINCT ie.usuario_id) as estudiantes_inscritos,
        COUNT(DISTINCT ad.usuario_id) as docentes_asignados
      FROM cursos c
      LEFT JOIN inscripciones_estudiantes ie ON c.id = ie.curso_id
      LEFT JOIN asignaciones_docentes ad ON c.id = ad.curso_id
      GROUP BY c.id
      ORDER BY c.fecha_creacion DESC
    `;

        const result = await fastify.pg.query(coursesQuery);
        return {
            total_cursos: result.rows.length,
            cursos: result.rows
        };
    }

    static async _generateActivityReport(fastify, parameters) {
        // Implementación básica de reporte de actividad
        const activityQuery = `
      SELECT 
        'login' as tipo_actividad,
        COUNT(*) as cantidad,
        DATE(fecha_actualizacion) as fecha
      FROM usuarios 
      WHERE fecha_actualizacion >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(fecha_actualizacion)
      ORDER BY fecha DESC
    `;

        const result = await fastify.pg.query(activityQuery);
        return {
            periodo: '30 días',
            actividad: result.rows
        };
    }

    static async addUserRole(fastify, userId, role) {
        try {
            // Verificar que el usuario existe
            const userCheck = await fastify.pg.query('SELECT id FROM usuarios WHERE id = $1', [userId]);
            if (userCheck.rows.length === 0) {
                return null;
            }

            // Verificar si ya tiene el rol
            const roleCheck = await fastify.pg.query(
                'SELECT id FROM usuario_roles WHERE usuario_id = $1 AND rol = $2',
                [userId, role]
            );

            if (roleCheck.rows.length > 0) {
                throw new Error('El usuario ya tiene este rol');
            }

            // Insertar nuevo rol
            await fastify.pg.query(
                'INSERT INTO usuario_roles (usuario_id, rol) VALUES ($1, $2)',
                [userId, role]
            );

            return true;
        } catch (error) {
            fastify.log.error('Error agregando rol a usuario:', error);
            throw error;
        }
    }

    static async removeUserRole(fastify, userId, role) {
        try {
            const result = await fastify.pg.query(
                'DELETE FROM usuario_roles WHERE usuario_id = $1 AND rol = $2 RETURNING id',
                [userId, role]
            );

            return result.rows.length > 0;
        } catch (error) {
            fastify.log.error('Error removiendo rol de usuario:', error);
            throw error;
        }
    }

    static async getUserRoles(fastify, userId) {
        try {
            const userCheck = await fastify.pg.query('SELECT id FROM usuarios WHERE id = $1', [userId]);
            if (userCheck.rows.length === 0) {
                return null;
            }

            const rolesResult = await fastify.pg.query(
                'SELECT rol FROM usuario_roles WHERE usuario_id = $1',
                [userId]
            );

            return rolesResult.rows.map(row => row.rol);
        } catch (error) {
            fastify.log.error('Error obteniendo roles de usuario:', error);
            throw error;
        }
    }

    // === CREACIÓN DE USUARIOS (FALTABA) ===

    static async createUser(fastify, userData) {
        const client = await fastify.pg.connect();

        try {
            await client.query('BEGIN');

            const { codigo_institucional, email, nombres, apellidos, password, roles = ['estudiante'] } = userData;

            // Hash de la contraseña
            const bcrypt = require('bcrypt');
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            // Insertar usuario
            const userResult = await client.query(
                `INSERT INTO usuarios (codigo_institucional, email, nombres, apellidos, password_hash, activo, fecha_creacion, fecha_actualizacion)
             VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             RETURNING id, codigo_institucional, email, nombres, apellidos, activo, fecha_creacion`,
                [codigo_institucional, email, nombres, apellidos, hashedPassword]
            );

            const newUser = userResult.rows[0];

            // Insertar roles
            for (const role of roles) {
                await client.query(
                    'INSERT INTO usuario_roles (usuario_id, rol) VALUES ($1, $2)',
                    [newUser.id, role]
                );
            }

            await client.query('COMMIT');

            // Retornar usuario sin password
            return {
                ...newUser,
                roles
            };
        } catch (error) {
            await client.query('ROLLBACK');
            fastify.log.error('Error creando usuario:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // === CONFIGURACIÓN DEL SISTEMA ===

    static async getSystemConfig(fastify) {
        try {
            // Implementación básica - en una app real tendrías una tabla de configuración
            const configQuery = `
            SELECT 
                'Learning Management System' as site_name,
                true as allow_registration,
                '{"smtpHost": "localhost", "smtpPort": 587, "fromEmail": "noreply@lms.com"}' as email_settings,
                '{"sessionTimeout": 1440, "maxLoginAttempts": 5}' as security_settings
        `;

            const result = await fastify.pg.query(configQuery);

            return {
                siteName: result.rows[0].site_name,
                allowRegistration: result.rows[0].allow_registration,
                emailSettings: JSON.parse(result.rows[0].email_settings),
                securitySettings: JSON.parse(result.rows[0].security_settings)
            };
        } catch (error) {
            fastify.log.error('Error obteniendo configuración del sistema:', error);
            throw error;
        }
    }

    static async updateSystemConfig(fastify, configData) {
        try {
            // En una implementación real, actualizarías una tabla de configuración
            // Por ahora, simulamos la actualización

            fastify.log.info('Configuración del sistema actualizada:', configData);

            return {
                message: 'Configuración actualizada exitosamente',
                config: configData,
                updatedAt: new Date()
            };
        } catch (error) {
            fastify.log.error('Error actualizando configuración:', error);
            throw error;
        }
    }

    // === BACKUP Y MANTENIMIENTO ===

    static async createBackup(fastify) {
        try {
            const backupId = `backup_${Date.now()}`;
            const timestamp = new Date();

            // En una implementación real, harías un dump de la base de datos
            fastify.log.info('Creando backup del sistema...');

            // Simular proceso de backup
            const tablesCount = await fastify.pg.query(
                "SELECT COUNT(*) as total FROM information_schema.tables WHERE table_schema = 'public'"
            );

            return {
                id: backupId,
                filename: `${backupId}.sql`,
                size: '2.5 MB', // Simulated
                tablesIncluded: parseInt(tablesCount.rows[0].total),
                createdAt: timestamp,
                status: 'completed'
            };
        } catch (error) {
            fastify.log.error('Error creando backup:', error);
            throw error;
        }
    }

    static async getBackups(fastify) {
        try {
            // En una implementación real, obtendrías la lista de archivos de backup
            return {
                backups: [
                    {
                        id: 'backup_1704067200000',
                        filename: 'backup_1704067200000.sql',
                        size: '2.5 MB',
                        createdAt: new Date(Date.now() - 86400000),
                        status: 'completed'
                    },
                    {
                        id: 'backup_1703980800000',
                        filename: 'backup_1703980800000.sql',
                        size: '2.3 MB',
                        createdAt: new Date(Date.now() - 172800000),
                        status: 'completed'
                    }
                ],
                total: 2
            };
        } catch (error) {
            fastify.log.error('Error obteniendo lista de backups:', error);
            throw error;
        }
    }

    static async restoreBackup(fastify, backupId) {
        try {
            fastify.log.info(`Restaurando backup: ${backupId}`);

            // En una implementación real, restaurarías desde el archivo de backup
            return {
                message: 'Backup restaurado exitosamente',
                backupId,
                restoredAt: new Date(),
                status: 'completed'
            };
        } catch (error) {
            fastify.log.error('Error restaurando backup:', error);
            throw error;
        }
    }

    // === LOGS Y AUDITORÍA ===

    static async getSystemLogs(fastify, { page = 1, limit = 50, level = '', dateFrom = '', dateTo = '' }) {
        try {
            // Implementación básica - en una app real tendrías una tabla de logs
            const logs = [
                {
                    id: 1,
                    level: 'info',
                    message: 'Usuario admin inició sesión',
                    timestamp: new Date(),
                    source: 'auth'
                },
                {
                    id: 2,
                    level: 'warning',
                    message: 'Intento de acceso con credenciales incorrectas',
                    timestamp: new Date(Date.now() - 300000),
                    source: 'auth'
                },
                {
                    id: 3,
                    level: 'error',
                    message: 'Error de conexión a base de datos',
                    timestamp: new Date(Date.now() - 600000),
                    source: 'database'
                }
            ];

            const offset = (page - 1) * limit;
            const filteredLogs = logs.slice(offset, offset + limit);

            return {
                logs: filteredLogs,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: logs.length,
                    totalPages: Math.ceil(logs.length / limit)
                }
            };
        } catch (error) {
            fastify.log.error('Error obteniendo logs del sistema:', error);
            throw error;
        }
    }

    static async getAuditLogs(fastify, { page = 1, limit = 50, action = '', userId = '', dateFrom = '', dateTo = '' }) {
        try {
            // Implementación básica para logs de auditoría
            const auditLogs = [
                {
                    id: 1,
                    userId: 1,
                    action: 'user_created',
                    details: 'Usuario nuevo creado: juan@ejemplo.com',
                    timestamp: new Date(),
                    ipAddress: '192.168.1.100'
                },
                {
                    id: 2,
                    userId: 1,
                    action: 'role_changed',
                    details: 'Rol cambiado de estudiante a docente para usuario ID: 5',
                    timestamp: new Date(Date.now() - 300000),
                    ipAddress: '192.168.1.100'
                }
            ];

            const offset = (page - 1) * limit;
            const filteredLogs = auditLogs.slice(offset, offset + limit);

            return {
                auditLogs: filteredLogs,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: auditLogs.length,
                    totalPages: Math.ceil(auditLogs.length / limit)
                }
            };
        } catch (error) {
            fastify.log.error('Error obteniendo logs de auditoría:', error);
            throw error;
        }
    }

    // === NOTIFICACIONES ===

    static async sendNotification(fastify, notificationData) {
        try {
            const { title, message, type, recipients } = notificationData;

            // Determinar destinatarios
            let targetUserIds = [];

            if (recipients.all) {
                const allUsersResult = await fastify.pg.query(
                    'SELECT id FROM usuarios WHERE activo = true'
                );
                targetUserIds = allUsersResult.rows.map(row => row.id);
            } else {
                if (recipients.userIds) {
                    targetUserIds.push(...recipients.userIds);
                }

                if (recipients.roles && recipients.roles.length > 0) {
                    const roleUsersResult = await fastify.pg.query(
                        'SELECT DISTINCT usuario_id FROM usuario_roles WHERE rol = ANY($1)',
                        [recipients.roles]
                    );
                    targetUserIds.push(...roleUsersResult.rows.map(row => row.usuario_id));
                }
            }

            // Eliminar duplicados
            targetUserIds = [...new Set(targetUserIds)];

            // En una implementación real, guardarías las notificaciones en la BD
            // y enviarías emails/push notifications

            fastify.log.info(`Enviando notificación "${title}" a ${targetUserIds.length} usuarios`);

            return {
                message: 'Notificación enviada exitosamente',
                sentTo: targetUserIds.length,
                notificationId: Date.now(),
                sentAt: new Date()
            };
        } catch (error) {
            fastify.log.error('Error enviando notificación:', error);
            throw error;
        }
    }

    static async getSentNotifications(fastify, { page = 1, limit = 20 }) {
        try {
            // Implementación básica - en una app real tendrías una tabla de notificaciones
            const notifications = [
                {
                    id: 1,
                    title: 'Mantenimiento programado',
                    message: 'El sistema estará en mantenimiento el domingo de 2-4 AM',
                    type: 'warning',
                    sentTo: 156,
                    sentAt: new Date(),
                    sentBy: 'Sistema'
                },
                {
                    id: 2,
                    title: 'Nuevas funcionalidades',
                    message: 'Se han agregado nuevas funcionalidades al sistema',
                    type: 'info',
                    sentTo: 89,
                    sentAt: new Date(Date.now() - 86400000),
                    sentBy: 'Administrador'
                }
            ];

            const offset = (page - 1) * limit;
            const paginatedNotifications = notifications.slice(offset, offset + limit);

            return {
                notifications: paginatedNotifications,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: notifications.length,
                    totalPages: Math.ceil(notifications.length / limit)
                }
            };
        } catch (error) {
            fastify.log.error('Error obteniendo notificaciones enviadas:', error);
            throw error;
        }
    }

    // === ESTADÍSTICAS AVANZADAS ===

    static async getUsageStats(fastify, { period = '30d', type = 'all' }) {
        try {
            const periodDays = parseInt(period.replace('d', ''));

            const loginStatsQuery = `
            SELECT 
                DATE(fecha_actualizacion) as fecha,
                COUNT(*) as logins
            FROM usuarios 
            WHERE fecha_actualizacion >= NOW() - INTERVAL '${periodDays} days'
            GROUP BY DATE(fecha_actualizacion)
            ORDER BY fecha DESC
        `;

            const courseAccessQuery = `
            SELECT 
                COUNT(*) as total_accesos,
                COUNT(DISTINCT usuario_id) as usuarios_unicos
            FROM inscripciones_estudiantes 
            WHERE fecha_inscripcion >= NOW() - INTERVAL '${periodDays} days'
        `;

            const [loginStats, courseAccess] = await Promise.all([
                fastify.pg.query(loginStatsQuery),
                fastify.pg.query(courseAccessQuery)
            ]);

            return {
                period: `${periodDays} días`,
                loginsByDay: loginStats.rows,
                courseAccess: courseAccess.rows[0],
                generatedAt: new Date()
            };
        } catch (error) {
            fastify.log.error('Error obteniendo estadísticas de uso:', error);
            throw error;
        }
    }

    static async getPerformanceStats(fastify, { period = '24h' }) {
        try {
            // En una implementación real, obtendrías métricas de performance reales
            return {
                period,
                averageResponseTime: '120ms',
                totalRequests: 15420,
                errorRate: '0.2%',
                uptime: '99.8%',
                memoryUsage: '45%',
                cpuUsage: '23%',
                databaseConnections: {
                    active: 12,
                    idle: 8,
                    total: 20
                },
                generatedAt: new Date()
            };
        } catch (error) {
            fastify.log.error('Error obteniendo estadísticas de performance:', error);
            throw error;
        }
    }

    static async getRealTimeMetrics(fastify) {
        try {
            const activeUsersQuery = `
            SELECT COUNT(*) as active_users
            FROM usuarios 
            WHERE fecha_actualizacion >= NOW() - INTERVAL '15 minutes'
            AND activo = true
        `;

            const recentActivityQuery = `
            SELECT COUNT(*) as recent_actions
            FROM usuarios 
            WHERE fecha_actualizacion >= NOW() - INTERVAL '5 minutes'
        `;

            const [activeUsers, recentActivity] = await Promise.all([
                fastify.pg.query(activeUsersQuery),
                fastify.pg.query(recentActivityQuery)
            ]);

            return {
                activeUsers: parseInt(activeUsers.rows[0].active_users),
                recentActions: parseInt(recentActivity.rows[0].recent_actions),
                serverLoad: Math.random() * 100, // Simulated
                memoryUsage: Math.random() * 100, // Simulated
                timestamp: new Date()
            };
        } catch (error) {
            fastify.log.error('Error obteniendo métricas en tiempo real:', error);
            throw error;
        }
    }

    // === IMPORTACIÓN/EXPORTACIÓN ===

    static async importUsers(fastify, fileData) {
        try {
            // En una implementación real, procesarías el archivo CSV
            fastify.log.info('Procesando importación de usuarios...');

            // Simular importación
            return {
                message: 'Usuarios importados exitosamente',
                imported: 25,
                errors: 2,
                skipped: 1,
                importedAt: new Date()
            };
        } catch (error) {
            fastify.log.error('Error importando usuarios:', error);
            throw error;
        }
    }

    static async exportUsers(fastify, { format = 'csv', role = '', status = '' }) {
        try {
            let whereConditions = ['1=1'];
            let queryParams = [];
            let paramIndex = 1;

            if (role) {
                whereConditions.push(`ur.rol = ${paramIndex}`);
                queryParams.push(role);
                paramIndex++;
            }

            if (status) {
                const isActive = status === 'activo';
                whereConditions.push(`u.activo = ${paramIndex}`);
                queryParams.push(isActive);
                paramIndex++;
            }

            const whereClause = whereConditions.join(' AND ');

            const usersQuery = `
            SELECT 
                u.codigo_institucional,
                u.email,
                u.nombres,
                u.apellidos,
                u.activo,
                u.fecha_creacion,
                string_agg(ur.rol, ', ') as roles
            FROM usuarios u
            LEFT JOIN usuario_roles ur ON u.id = ur.usuario_id
            WHERE ${whereClause}
            GROUP BY u.id, u.codigo_institucional, u.email, u.nombres, u.apellidos, u.activo, u.fecha_creacion
            ORDER BY u.fecha_creacion DESC
        `;

            const result = await fastify.pg.query(usersQuery, queryParams);

            if (format === 'csv') {
                // Generar CSV
                const csv = this._generateCSV(result.rows);
                return Buffer.from(csv, 'utf8');
            } else if (format === 'xlsx') {
                // En una implementación real, usarías una librería como xlsx
                return Buffer.from('Excel data would go here', 'utf8');
            }
        } catch (error) {
            fastify.log.error('Error exportando usuarios:', error);
            throw error;
        }
    }

    static _generateCSV(data) {
        if (data.length === 0) return '';

        const headers = Object.keys(data[0]).join(',');
        const rows = data.map(row =>
            Object.values(row).map(value =>
                `"${String(value).replace(/"/g, '""')}"`
            ).join(',')
        );

        return [headers, ...rows].join('\n');
    }

    // === LIMPIEZA Y MANTENIMIENTO ===

    static async performCleanup(fastify, { cleanupType, olderThanDays = 30 }) {
        try {
            let deletedItems = 0;
            let message = '';

            switch (cleanupType) {
                case 'logs':
                    // En una implementación real, limpiarías logs antiguos
                    deletedItems = 150; // Simulated
                    message = `${deletedItems} entradas de log eliminadas`;
                    break;

                case 'sessions':
                    // Limpiar sesiones expiradas
                    deletedItems = 45; // Simulated
                    message = `${deletedItems} sesiones expiradas eliminadas`;
                    break;

                case 'temp_files':
                    // Limpiar archivos temporales
                    deletedItems = 23; // Simulated
                    message = `${deletedItems} archivos temporales eliminados`;
                    break;

                case 'all':
                    // Ejecutar todas las limpiezas
                    deletedItems = 218; // Simulated
                    message = `Limpieza completa realizada: ${deletedItems} elementos eliminados`;
                    break;

                default:
                    throw new Error(`Tipo de limpieza no válido: ${cleanupType}`);
            }

            fastify.log.info(`Limpieza completada: ${message}`);

            return {
                cleanupType,
                deletedItems,
                message,
                completedAt: new Date()
            };
        } catch (error) {
            fastify.log.error('Error en operación de limpieza:', error);
            throw error;
        }
    }

    // === ESTADO DEL SISTEMA ===

    static async getSystemHealth(fastify) {
        try {
            // Verificar conexión a base de datos
            const dbCheck = await fastify.pg.query('SELECT 1 as healthy');
            const dbHealthy = dbCheck.rows.length > 0;

            // Verificar espacio en disco (simulado)
            const diskUsage = Math.random() * 100;

            // Verificar memoria (simulado)
            const memoryUsage = Math.random() * 100;

            // Verificar servicios críticos
            const services = [
                { name: 'Database', status: dbHealthy ? 'healthy' : 'unhealthy', responseTime: '5ms' },
                { name: 'File Storage', status: 'healthy', responseTime: '12ms' },
                { name: 'Email Service', status: 'healthy', responseTime: '45ms' },
                { name: 'Cache', status: 'healthy', responseTime: '2ms' }
            ];

            const overallHealth = services.every(service => service.status === 'healthy') ? 'healthy' : 'degraded';

            return {
                overall: overallHealth,
                services,
                resources: {
                    diskUsage: `${diskUsage.toFixed(1)}%`,
                    memoryUsage: `${memoryUsage.toFixed(1)}%`,
                    cpuUsage: `${(Math.random() * 100).toFixed(1)}%`
                },
                uptime: '15 days, 4 hours, 23 minutes',
                lastChecked: new Date()
            };
        } catch (error) {
            fastify.log.error('Error obteniendo estado del sistema:', error);
            return {
                overall: 'unhealthy',
                error: error.message,
                lastChecked: new Date()
            };
        }
    }


    // === GESTIÓN DE HORARIOS DE EXAMEN ===

    static async getExamSchedules(fastify, { page = 1, limit = 10, search = '', fecha = '', status = '' }) {
        try {
            const offset = (page - 1) * limit;

            let whereConditions = ['1=1'];
            let queryParams = [];
            let paramIndex = 1;

            // Filtro por búsqueda
            if (search) {
                whereConditions.push(`(
                    TO_CHAR(he.fecha_examen, 'DD/MM/YYYY') ILIKE $${paramIndex} OR
                    TO_CHAR(he.hora_inicio, 'HH24:MI') ILIKE $${paramIndex} OR
                    TO_CHAR(he.hora_fin, 'HH24:MI') ILIKE $${paramIndex}
                )`);
                queryParams.push(`%${search}%`);
                paramIndex++;
            }

            // Filtro por fecha
            if (fecha) {
                whereConditions.push(`he.fecha_examen = $${paramIndex}`);
                queryParams.push(fecha);
                paramIndex++;
            }

            // Filtro por estado
            if (status) {
                const isActive = status === 'activo';
                whereConditions.push(`he.activo = $${paramIndex}`);
                queryParams.push(isActive);
                paramIndex++;
            }

            const whereClause = whereConditions.join(' AND ');

            // Query principal para obtener horarios
            const schedulesQuery = `
                SELECT 
                    he.id,
                    he.fecha_examen,
                    he.hora_inicio,
                    he.hora_fin,
                    he.cupos_disponibles,
                    he.cupos_ocupados,
                    he.activo,
                    he.fecha_creacion,
                    u.nombres as creado_por_nombre,
                    u.apellidos as creado_por_apellidos
                FROM horarios_examenes he
                LEFT JOIN usuarios u ON he.creado_por = u.id
                WHERE ${whereClause}
                ORDER BY he.fecha_examen DESC, he.hora_inicio DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `;

            // Query para contar total
            const countQuery = `
                SELECT COUNT(*) as total
                FROM horarios_examenes he
                WHERE ${whereClause}
            `;

            queryParams.push(limit, offset);

            const [schedulesResult, countResult] = await Promise.all([
                fastify.pg.query(schedulesQuery, queryParams),
                fastify.pg.query(countQuery, queryParams.slice(0, -2))
            ]);

            const total = parseInt(countResult.rows[0].total);
            const totalPages = Math.ceil(total / limit);

            return {
                schedules: schedulesResult.rows,
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
            fastify.log.error('Error obteniendo horarios de examen:', error);
            throw error;
        }
    }

    static async getExamScheduleStats(fastify) {
        try {
            const statsQuery = `
                SELECT 
                    COUNT(*) as total_horarios,
                    COUNT(*) FILTER (WHERE activo = true) as horarios_activos,
                    COALESCE(SUM(cupos_disponibles), 0) as cupos_totales,
                    COALESCE(SUM(cupos_ocupados), 0) as cupos_ocupados,
                    COUNT(*) FILTER (WHERE fecha_examen >= CURRENT_DATE) as horarios_futuros
                FROM horarios_examenes
            `;

            const estudiantesAgendadosQuery = `
                SELECT COUNT(DISTINCT estudiante_id) as estudiantes_agendados
                FROM agendamientos_examen
                WHERE estado != 'cancelado'
            `;

            const [statsResult, estudiantesResult] = await Promise.all([
                fastify.pg.query(statsQuery),
                fastify.pg.query(estudiantesAgendadosQuery)
            ]);

            return {
                total_horarios: parseInt(statsResult.rows[0].total_horarios) || 0,
                horarios_activos: parseInt(statsResult.rows[0].horarios_activos) || 0,
                cupos_totales: parseInt(statsResult.rows[0].cupos_totales) || 0,
                cupos_ocupados: parseInt(statsResult.rows[0].cupos_ocupados) || 0,
                horarios_futuros: parseInt(statsResult.rows[0].horarios_futuros) || 0,
                estudiantes_agendados: parseInt(estudiantesResult.rows[0].estudiantes_agendados) || 0
            };
        } catch (error) {
            fastify.log.error('Error obteniendo estadísticas de horarios:', error);
            throw error;
        }
    }

    static async createExamSchedule(fastify, scheduleData) {
        try {
            const { fecha_examen, hora_inicio, hora_fin, cupos_disponibles, creado_por } = scheduleData;

            // Validar que la fecha sea futura
            const fechaExamen = new Date(fecha_examen);
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);

            if (fechaExamen < hoy) {
                throw new Error('La fecha del examen debe ser futura');
            }

            // Validar que hora_fin > hora_inicio
            if (hora_fin <= hora_inicio) {
                throw new Error('La hora de fin debe ser posterior a la hora de inicio');
            }

            // Verificar si ya existe un horario en esa fecha y hora
            const existingQuery = `
                SELECT id FROM horarios_examenes 
                WHERE fecha_examen = $1 AND hora_inicio = $2
            `;
            const existingResult = await fastify.pg.query(existingQuery, [fecha_examen, hora_inicio]);

            if (existingResult.rows.length > 0) {
                throw new Error('Ya existe un horario para esa fecha y hora');
            }

            // Crear el horario
            const insertQuery = `
                INSERT INTO horarios_examenes (
                    fecha_examen, hora_inicio, hora_fin, cupos_disponibles, creado_por
                ) VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `;

            const result = await fastify.pg.query(insertQuery, [
                fecha_examen, hora_inicio, hora_fin, cupos_disponibles, creado_por
            ]);

            return {
                message: 'Horario de examen creado exitosamente',
                schedule: result.rows[0]
            };
        } catch (error) {
            fastify.log.error('Error creando horario de examen:', error);
            throw error;
        }
    }

    static async updateExamSchedule(fastify, scheduleId, updateData) {
        try {
            console.log('🔄 updateExamSchedule - scheduleId:', scheduleId);
            console.log('🔄 updateExamSchedule - updateData:', updateData);

            // Verificar que el horario existe
            const checkQuery = 'SELECT * FROM horarios_examenes WHERE id = $1';
            const checkResult = await fastify.pg.query(checkQuery, [scheduleId]);

            if (checkResult.rows.length === 0) {
                return null;
            }

            // Construir query de actualización dinámicamente
            let updateFields = [];
            let queryParams = [];
            let paramIndex = 1;

            Object.keys(updateData).forEach(field => {
                if (updateData[field] !== undefined) {
                    // 🔥 CORRECCIÓN: Agregar el símbolo $ antes del paramIndex
                    updateFields.push(`${field} = $${paramIndex}`);
                    queryParams.push(updateData[field]);
                    paramIndex++;
                }
            });

            console.log('🔍 updateFields:', updateFields);
            console.log('🔍 queryParams:', queryParams);

            if (updateFields.length === 0) {
                return { message: 'No hay cambios para actualizar', schedule: checkResult.rows[0] };
            }

            updateFields.push(`fecha_actualizacion = CURRENT_TIMESTAMP`);

            // 🔥 CORRECCIÓN: Usar $${paramIndex} para el WHERE
            const updateQuery = `
            UPDATE horarios_examenes 
            SET ${updateFields.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `;
            queryParams.push(scheduleId);

            console.log('🔍 Final updateQuery:', updateQuery);
            console.log('🔍 Final queryParams:', queryParams);

            const updateResult = await fastify.pg.query(updateQuery, queryParams);

            return {
                message: 'Horario actualizado exitosamente',
                schedule: updateResult.rows[0]
            };
        } catch (error) {
            fastify.log.error('Error actualizando horario de examen:', error);
            throw error;
        }
    }

    static async deleteExamSchedule(fastify, scheduleId) {
        try {
            // Verificar si hay estudiantes agendados
            const studentsQuery = 'SELECT COUNT(*) as total FROM agendamientos_examen WHERE horario_examen_id = $1';
            const studentsResult = await fastify.pg.query(studentsQuery, [scheduleId]);

            if (parseInt(studentsResult.rows[0].total) > 0) {
                throw new Error('No se puede eliminar un horario que tiene estudiantes agendados');
            }

            // Eliminar el horario
            const deleteQuery = 'DELETE FROM horarios_examenes WHERE id = $1 RETURNING id';
            const deleteResult = await fastify.pg.query(deleteQuery, [scheduleId]);

            return deleteResult.rows.length > 0;
        } catch (error) {
            fastify.log.error('Error eliminando horario de examen:', error);
            throw error;
        }
    }

    // === GESTIÓN DE ESTUDIANTES EN HORARIOS ===

    static async getExamStudents(fastify, scheduleId) {
        try {
            const studentsQuery = `
                SELECT 
                    ae.id as agendamiento_id,
                    ae.estado,
                    ae.fecha_agendamiento,
                    u.id,
                    u.nombres,
                    u.apellidos,
                    u.email,
                    u.codigo_institucional
                FROM agendamientos_examen ae
                JOIN estudiantes e ON ae.estudiante_id = e.id
                JOIN usuarios u ON e.usuario_id = u.id
                WHERE ae.horario_examen_id = $1
                ORDER BY ae.fecha_agendamiento DESC
            `;

            const result = await fastify.pg.query(studentsQuery, [scheduleId]);
            return result.rows;
        } catch (error) {
            fastify.log.error('Error obteniendo estudiantes del horario:', error);
            throw error;
        }
    }

    static async getAvailableStudentsForExam(fastify, scheduleId) {
        try {
            const availableQuery = `
                SELECT 
                    u.id,
                    u.nombres,
                    u.apellidos,
                    u.email,
                    u.codigo_institucional
                FROM estudiantes e
                JOIN usuarios u ON e.usuario_id = u.id
                WHERE u.activo = true
                AND e.id NOT IN (
                    SELECT ae.estudiante_id 
                    FROM agendamientos_examen ae 
                    WHERE ae.horario_examen_id = $1
                )
                ORDER BY u.nombres, u.apellidos
                LIMIT 100
            `;

            const result = await fastify.pg.query(availableQuery, [scheduleId]);
            return result.rows;
        } catch (error) {
            fastify.log.error('Error obteniendo estudiantes disponibles:', error);
            throw error;
        }
    }

    static async addStudentToExamSchedule(fastify, scheduleId, studentId) {
        const client = await fastify.pg.connect();

        try {
            await client.query('BEGIN');

            // Verificar que el horario existe y tiene cupos
            const horarioQuery = 'SELECT * FROM horarios_examenes WHERE id = $1 AND activo = true';
            const horarioResult = await client.query(horarioQuery, [scheduleId]);

            if (horarioResult.rows.length === 0) {
                throw new Error('Horario no encontrado o inactivo');
            }

            const horario = horarioResult.rows[0];
            if (horario.cupos_ocupados >= horario.cupos_disponibles) {
                throw new Error('No hay cupos disponibles en este horario');
            }

            // Verificar que el estudiante no esté ya agendado
            const existingQuery = `
                SELECT id FROM agendamientos_examen 
                WHERE horario_examen_id = $1 AND estudiante_id = $2
            `;
            const existingResult = await client.query(existingQuery, [scheduleId, studentId]);

            if (existingResult.rows.length > 0) {
                throw new Error('El estudiante ya está agendado para este horario');
            }

            // Obtener el ID del estudiante en la tabla estudiantes
            const estudianteQuery = 'SELECT id FROM estudiantes WHERE usuario_id = $1';
            const estudianteResult = await client.query(estudianteQuery, [studentId]);

            if (estudianteResult.rows.length === 0) {
                throw new Error('Estudiante no encontrado');
            }

            const estudianteId = estudianteResult.rows[0].id;

            // Agregar el agendamiento
            const insertQuery = `
                INSERT INTO agendamientos_examen (horario_examen_id, estudiante_id)
                VALUES ($1, $2)
                RETURNING *
            `;
            const insertResult = await client.query(insertQuery, [scheduleId, estudianteId]);

            // Actualizar cupos ocupados
            const updateQuery = `
                UPDATE horarios_examenes 
                SET cupos_ocupados = cupos_ocupados + 1
                WHERE id = $1
            `;
            await client.query(updateQuery, [scheduleId]);

            await client.query('COMMIT');

            return {
                message: 'Estudiante agregado al horario exitosamente',
                agendamiento: insertResult.rows[0]
            };
        } catch (error) {
            await client.query('ROLLBACK');
            fastify.log.error('Error agregando estudiante al horario:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    static async removeStudentFromExamSchedule(fastify, scheduleId, studentId) {
        const client = await fastify.pg.connect();

        try {
            await client.query('BEGIN');

            // Obtener el ID del estudiante en la tabla estudiantes
            const estudianteQuery = 'SELECT id FROM estudiantes WHERE usuario_id = $1';
            const estudianteResult = await client.query(estudianteQuery, [studentId]);

            if (estudianteResult.rows.length === 0) {
                throw new Error('Estudiante no encontrado');
            }

            const estudianteId = estudianteResult.rows[0].id;

            // Eliminar el agendamiento
            const deleteQuery = `
                DELETE FROM agendamientos_examen 
                WHERE horario_examen_id = $1 AND estudiante_id = $2
                RETURNING id
            `;
            const deleteResult = await client.query(deleteQuery, [scheduleId, estudianteId]);

            if (deleteResult.rows.length === 0) {
                throw new Error('Agendamiento no encontrado');
            }

            // Actualizar cupos ocupados
            const updateQuery = `
                UPDATE horarios_examenes 
                SET cupos_ocupados = GREATEST(cupos_ocupados - 1, 0)
                WHERE id = $1
            `;
            await client.query(updateQuery, [scheduleId]);

            await client.query('COMMIT');

            return {
                message: 'Estudiante removido del horario exitosamente'
            };
        } catch (error) {
            await client.query('ROLLBACK');
            fastify.log.error('Error removiendo estudiante del horario:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    static async updateStudentExamStatus(fastify, scheduleId, studentId, newStatus) {
        try {
            // Obtener el ID del estudiante en la tabla estudiantes
            const estudianteQuery = 'SELECT id FROM estudiantes WHERE usuario_id = $1';
            const estudianteResult = await fastify.pg.query(estudianteQuery, [studentId]);

            if (estudianteResult.rows.length === 0) {
                throw new Error('Estudiante no encontrado');
            }

            const estudianteId = estudianteResult.rows[0].id;

            const updateQuery = `
                UPDATE agendamientos_examen 
                SET estado = $1::estado_agendamiento
                WHERE horario_examen_id = $2 AND estudiante_id = $3
                RETURNING *
            `;

            const result = await fastify.pg.query(updateQuery, [newStatus, scheduleId, estudianteId]);

            if (result.rows.length === 0) {
                throw new Error('Agendamiento no encontrado');
            }

            return {
                message: 'Estado del agendamiento actualizado exitosamente',
                agendamiento: result.rows[0]
            };
        } catch (error) {
            fastify.log.error('Error actualizando estado del agendamiento:', error);
            throw error;
        }
    }

    static async getExamScheduleById(fastify, scheduleId) {
        try {
            const scheduleQuery = `
                SELECT 
                    he.*,
                    u.nombres as creado_por_nombre,
                    u.apellidos as creado_por_apellidos
                FROM horarios_examenes he
                LEFT JOIN usuarios u ON he.creado_por = u.id
                WHERE he.id = $1
            `;

            const result = await fastify.pg.query(scheduleQuery, [scheduleId]);
            return result.rows[0] || null;
        } catch (error) {
            fastify.log.error('Error obteniendo horario por ID:', error);
            throw error;
        }
    }

    // Método auxiliar para validar conflictos de horarios
    static async checkScheduleConflict(fastify, fecha_examen, hora_inicio, hora_fin, excludeId = null) {
        try {
            let conflictQuery = `
                SELECT id FROM horarios_examenes 
                WHERE fecha_examen = $1 
                AND (
                    (hora_inicio <= $2 AND hora_fin > $2) OR
                    (hora_inicio < $3 AND hora_fin >= $3) OR
                    (hora_inicio >= $2 AND hora_fin <= $3)
                )
            `;
            let params = [fecha_examen, hora_inicio, hora_fin];

            if (excludeId) {
                conflictQuery += ' AND id != $4';
                params.push(excludeId);
            }

            const result = await fastify.pg.query(conflictQuery, params);
            return result.rows.length > 0;
        } catch (error) {
            fastify.log.error('Error verificando conflictos de horario:', error);
            throw error;
        }
    }

}

module.exports = AdminService;