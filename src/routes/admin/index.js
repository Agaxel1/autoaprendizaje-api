// src/routes/admin/index.js
const adminSchemas = require('../../schemas/admin');
const adminService = require('../../services/AdminService');

async function adminRoutes(fastify, options) {

    // Middleware para verificar que el usuario sea administrador
    const requireAdmin = async (request, reply) => {
        try {
            // Verificar que el usuario esté autenticado
            await fastify.authenticate(request, reply);

            // Verificar que tenga rol de administrador
            const { roles } = request.user;

            if (!roles || !Array.isArray(roles) || !roles.includes('administrador')) {
                return reply.code(403).send({
                    error: 'Acceso denegado. Se requieren permisos de administrador',
                    code: 'ADMIN_ACCESS_REQUIRED'
                });
            }
        } catch (error) {
            return reply.code(401).send({
                error: 'Token inválido o expirado',
                code: 'UNAUTHORIZED'
            });
        }
    };

    // === ESTADÍSTICAS DEL DASHBOARD ===

    // GET /api/admin/dashboard/stats
    fastify.get('/dashboard/stats', {
        preHandler: requireAdmin,
        schema: adminSchemas.dashboardStats
    }, async (request, reply) => {
        try {
            const stats = await adminService.getDashboardStats(fastify);
            return reply.send(stats);
        } catch (error) {
            fastify.log.error('Error obteniendo estadísticas del dashboard:', error);
            return reply.code(500).send({
                error: 'Error al obtener estadísticas',
                code: 'STATS_ERROR'
            });
        }
    });

    // === GESTIÓN DE USUARIOS ===

    // GET /api/admin/users - Versión corregida
    // GET /api/admin/users - Versión corregida para la estructura real
    fastify.get('/users', {
        preHandler: requireAdmin
        // schema: adminSchemas.getUsers
    }, async (request, reply) => {
        try {
            console.log('🔍 Obteniendo usuarios...');
            const { page = 1, limit = 20, search = '', role = '', status = '' } = request.query;

            const offset = (page - 1) * limit;
            let whereConditions = ['u.activo = true'];
            let queryParams = [];
            let paramIndex = 1;

            // Filtro por búsqueda
            if (search) {
                whereConditions.push(`(u.nombres ILIKE $${paramIndex} OR u.apellidos ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`);
                queryParams.push(`%${search}%`);
                paramIndex++;
            }

            // Filtro por rol (si se especifica)
            if (role) {
                whereConditions.push(`EXISTS (SELECT 1 FROM usuario_roles ur WHERE ur.usuario_id = u.id AND ur.rol = $${paramIndex})`);
                queryParams.push(role);
                paramIndex++;
            }

            // Filtro por estado (si se especifica)
            if (status) {
                const isActive = status === 'activo';
                whereConditions.push(`u.activo = $${paramIndex}`);
                queryParams.push(isActive);
                paramIndex++;
            }

            const whereClause = whereConditions.join(' AND ');

            // Query CORREGIDA para obtener usuarios con sus roles
            const usersQuery = `
            SELECT 
                u.id,
                u.codigo_institucional,
                u.email,
                u.nombres,
                u.apellidos,
                u.activo,
                u.fecha_creacion,
                u.fecha_actualizacion,
                CASE 
                    WHEN COUNT(ur.rol) = 0 THEN ARRAY[]::text[]
                    ELSE array_agg(DISTINCT ur.rol::text ORDER BY ur.rol::text)
                END as roles
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
            WHERE ${whereClause}
        `;

            queryParams.push(limit, offset);

            console.log('📊 Ejecutando query:', usersQuery);
            console.log('📝 Parámetros:', queryParams);

            // EJECUTAR QUERIES
            let usersResult, countResult;

            try {
                // Query de usuarios
                usersResult = await fastify.pg.query(usersQuery, queryParams);
                console.log('✅ Query de usuarios ejecutada exitosamente');

                // Query de conteo - ajustar parámetros (sin limit y offset)
                const countParams = queryParams.slice(0, -2);
                console.log('📊 Ejecutando count query con parámetros:', countParams);

                countResult = await fastify.pg.query(countQuery, countParams);
                console.log('✅ Query de conteo ejecutada exitosamente');

            } catch (queryError) {
                console.error('❌ Error en query SQL:', queryError);
                console.error('Query problemática:', usersQuery);
                console.error('Parámetros:', queryParams);

                // Fallback: obtener usuarios sin roles primero
                console.log('🔄 Intentando query de fallback...');

                const fallbackQuery = `
                SELECT 
                    u.id,
                    u.codigo_institucional,
                    u.email,
                    u.nombres,
                    u.apellidos,
                    u.activo,
                    u.fecha_creacion,
                    u.fecha_actualizacion
                FROM usuarios u
                WHERE u.activo = true
                ORDER BY u.fecha_creacion DESC
                LIMIT $1 OFFSET $2
            `;

                const fallbackCountQuery = `
                SELECT COUNT(*) as total
                FROM usuarios u
                WHERE u.activo = true
            `;

                const [fallbackUsers, fallbackCount] = await Promise.all([
                    fastify.pg.query(fallbackQuery, [limit, offset]),
                    fastify.pg.query(fallbackCountQuery)
                ]);

                // Obtener roles para cada usuario por separado
                const usersWithRoles = await Promise.all(
                    fallbackUsers.rows.map(async (user) => {
                        try {
                            const rolesResult = await fastify.pg.query(
                                'SELECT rol::text FROM usuario_roles WHERE usuario_id = $1',
                                [user.id]
                            );

                            return {
                                ...user,
                                roles: rolesResult.rows.map(row => row.rol)
                            };
                        } catch (roleError) {
                            console.error(`Error obteniendo roles para usuario ${user.id}:`, roleError);
                            return {
                                ...user,
                                roles: []
                            };
                        }
                    })
                );

                usersResult = { rows: usersWithRoles };
                countResult = fallbackCount;
            }

            console.log('✅ Usuarios obtenidos:', usersResult.rows.length);

            // Procesar usuarios para asegurar formato correcto de roles
            const processedUsers = usersResult.rows.map(user => {
                console.log(`🔍 Procesando usuario ${user.id}:`, {
                    nombre: `${user.nombres} ${user.apellidos}`,
                    roles_raw: user.roles,
                    roles_type: typeof user.roles
                });

                // Procesar roles dependiendo del formato
                if (Array.isArray(user.roles)) {
                    // Ya es array, solo filtrar nulls y vacíos
                    user.roles = user.roles.filter(role => role !== null && role !== undefined && role !== '');
                    console.log(`✅ Roles procesados como array:`, user.roles);
                } else if (typeof user.roles === 'string') {
                    // Es string de PostgreSQL array: {rol1,rol2}
                    console.log(`🔄 Convirtiendo string a array:`, user.roles);
                    user.roles = user.roles
                        .replace(/^{|}$/g, '') // Remover llaves { }
                        .split(',')
                        .map(role => role.trim())
                        .filter(role => role.length > 0);
                    console.log(`✅ Roles convertidos:`, user.roles);
                } else {
                    // No hay roles o formato inesperado
                    console.log(`⚠️  Roles en formato inesperado, asignando array vacío`);
                    user.roles = [];
                }

                return user;
            });

            const total = parseInt(countResult.rows[0].total);
            const totalPages = Math.ceil(total / limit);

            const response = {
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

            console.log('📤 Enviando respuesta exitosa con', processedUsers.length, 'usuarios');
            return reply.send(response);

        } catch (error) {
            console.error('❌ Error crítico obteniendo usuarios:', error);
            console.error('Stack trace:', error.stack);
            fastify.log.error('Error obteniendo usuarios:', error);

            return reply.code(500).send({
                error: 'Error al obtener usuarios',
                code: 'USERS_FETCH_ERROR',
                details: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });

    // GET /api/admin/users/stats - Estadísticas de usuarios
    fastify.get('/users/stats', {
        preHandler: requireAdmin
        //schema: adminSchemas.userStats
    }, async (request, reply) => {
        try {
            console.log('📊 Obteniendo estadísticas...');

            // Query para contar usuarios activos
            const totalUsersQuery = 'SELECT COUNT(*) as total FROM usuarios WHERE activo = true';

            // Query REAL para distribución de roles
            const rolesQuery = `
            SELECT 
                ur.rol::text as rol,
                COUNT(DISTINCT ur.usuario_id) as cantidad
            FROM usuario_roles ur
            JOIN usuarios u ON ur.usuario_id = u.id
            WHERE u.activo = true
            GROUP BY ur.rol
            ORDER BY cantidad DESC
        `;

            // Ejecutar ambas queries
            const [totalResult, rolesResult] = await Promise.all([
                fastify.pg.query(totalUsersQuery),
                fastify.pg.query(rolesQuery)
            ]);

            console.log('✅ Roles obtenidos:', rolesResult.rows);

            // Procesar distribución de roles
            const allRoles = ['estudiante', 'docente', 'administrador'];
            const rolesDistribution = allRoles.map(rol => {
                const found = rolesResult.rows.find(r => r.rol === rol);
                return {
                    rol,
                    cantidad: found ? parseInt(found.cantidad) : 0
                };
            });

            const response = {
                total_usuarios: totalResult.rows[0].total || '0',
                usuarios_activos: totalResult.rows[0].total || '0',
                usuarios_inactivos: '0',
                nuevos_ultimo_mes: '0',
                nuevos_ultima_semana: '0',
                roles_distribution: rolesDistribution  // 👈 AHORA CON DATOS REALES
            };

            console.log('📤 Estadísticas:', response);
            return reply.send(response);

        } catch (error) {
            console.error('❌ Error obteniendo estadísticas:', error);
            return reply.code(500).send({
                error: 'Error al obtener estadísticas',
                code: 'USER_STATS_ERROR'
            });
        }
    });

    // GET /api/admin/users/:id - Obtener usuario específico
    fastify.get('/users/:id', {
        preHandler: requireAdmin,
        schema: adminSchemas.getUser
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const user = await adminService.getUserById(fastify, id);

            if (!user) {
                return reply.code(404).send({
                    error: 'Usuario no encontrado',
                    code: 'USER_NOT_FOUND'
                });
            }

            return reply.send(user);
        } catch (error) {
            fastify.log.error('Error obteniendo usuario:', error);
            return reply.code(500).send({
                error: 'Error al obtener usuario',
                code: 'USER_FETCH_ERROR'
            });
        }
    });

    // POST /api/admin/users - Crear nuevo usuario
    fastify.post('/users', {
        preHandler: requireAdmin,
        schema: adminSchemas.createUser
    }, async (request, reply) => {
        try {
            const userData = request.body;
            const newUser = await adminService.createUser(fastify, userData);
            return reply.code(201).send(newUser);
        } catch (error) {
            fastify.log.error('Error creando usuario:', error);

            if (error.code === '23505') {
                return reply.code(409).send({
                    error: 'El email ya está registrado',
                    code: 'EMAIL_EXISTS'
                });
            }

            return reply.code(500).send({
                error: 'Error al crear usuario',
                code: 'USER_CREATE_ERROR'
            });
        }
    });


    // POST /api/admin/users/:id/roles - Agregar rol a usuario
    fastify.post('/users/:id/roles', {
        preHandler: requireAdmin,
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
                    role: { type: 'string', enum: ['estudiante', 'docente', 'administrador'] }
                },
                required: ['role']
            }
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const { role } = request.body;

            const result = await adminService.addUserRole(fastify, id, role);

            if (!result) {
                return reply.code(404).send({
                    error: 'Usuario no encontrado',
                    code: 'USER_NOT_FOUND'
                });
            }

            return reply.send({
                message: `Rol ${role} agregado exitosamente al usuario`
            });
        } catch (error) {
            fastify.log.error('Error agregando rol:', error);

            if (error.code === '23505') {
                return reply.code(409).send({
                    error: 'El usuario ya tiene este rol',
                    code: 'ROLE_ALREADY_EXISTS'
                });
            }

            return reply.code(500).send({
                error: 'Error al agregar rol',
                code: 'ADD_ROLE_ERROR'
            });
        }
    });

    // DELETE /api/admin/users/:id/roles/:role - Remover rol específico
    fastify.delete('/users/:id/roles/:role', {
        preHandler: requireAdmin,
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    role: { type: 'string' }
                },
                required: ['id', 'role']
            }
        }
    }, async (request, reply) => {
        try {
            const { id, role } = request.params;

            const result = await adminService.removeUserRole(fastify, id, role);

            if (!result) {
                return reply.code(404).send({
                    error: 'Usuario o rol no encontrado',
                    code: 'USER_OR_ROLE_NOT_FOUND'
                });
            }

            return reply.send({
                message: `Rol ${role} removido exitosamente del usuario`
            });
        } catch (error) {
            fastify.log.error('Error removiendo rol:', error);
            return reply.code(500).send({
                error: 'Error al remover rol',
                code: 'REMOVE_ROLE_ERROR'
            });
        }
    });

    // GET /api/admin/users/:id/roles - Obtener roles de usuario
    fastify.get('/users/:id/roles', {
        preHandler: requireAdmin,
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string' }
                },
                required: ['id']
            }
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const roles = await adminService.getUserRoles(fastify, id);

            if (roles === null) {
                return reply.code(404).send({
                    error: 'Usuario no encontrado',
                    code: 'USER_NOT_FOUND'
                });
            }

            return reply.send({ roles });
        } catch (error) {
            fastify.log.error('Error obteniendo roles de usuario:', error);
            return reply.code(500).send({
                error: 'Error al obtener roles',
                code: 'GET_ROLES_ERROR'
            });
        }
    });

    // === CONFIGURACIÓN DEL SISTEMA ===

    // GET /api/admin/config - Obtener configuración del sistema
    fastify.get('/config', {
        preHandler: requireAdmin
    }, async (request, reply) => {
        try {
            const config = await adminService.getSystemConfig(fastify);
            return reply.send(config);
        } catch (error) {
            fastify.log.error('Error obteniendo configuración:', error);
            return reply.code(500).send({
                error: 'Error al obtener configuración',
                code: 'CONFIG_FETCH_ERROR'
            });
        }
    });

    // PUT /api/admin/config - Actualizar configuración del sistema
    fastify.put('/config', {
        preHandler: requireAdmin,
        schema: {
            body: {
                type: 'object',
                properties: {
                    siteName: { type: 'string' },
                    allowRegistration: { type: 'boolean' },
                    emailSettings: {
                        type: 'object',
                        properties: {
                            smtpHost: { type: 'string' },
                            smtpPort: { type: 'number' },
                            fromEmail: { type: 'string' }
                        }
                    },
                    securitySettings: {
                        type: 'object',
                        properties: {
                            sessionTimeout: { type: 'number' },
                            maxLoginAttempts: { type: 'number' }
                        }
                    }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const configData = request.body;
            const updatedConfig = await adminService.updateSystemConfig(fastify, configData);
            return reply.send(updatedConfig);
        } catch (error) {
            fastify.log.error('Error actualizando configuración:', error);
            return reply.code(500).send({
                error: 'Error al actualizar configuración',
                code: 'CONFIG_UPDATE_ERROR'
            });
        }
    });

    // === BACKUP Y MANTENIMIENTO ===

    // POST /api/admin/backup - Crear backup del sistema
    fastify.post('/backup', {
        preHandler: requireAdmin
    }, async (request, reply) => {
        try {
            const backup = await adminService.createBackup(fastify);
            return reply.send(backup);
        } catch (error) {
            fastify.log.error('Error creando backup:', error);
            return reply.code(500).send({
                error: 'Error al crear backup',
                code: 'BACKUP_CREATE_ERROR'
            });
        }
    });

    // GET /api/admin/backup - Obtener lista de backups
    fastify.get('/backup', {
        preHandler: requireAdmin
    }, async (request, reply) => {
        try {
            const backups = await adminService.getBackups(fastify);
            return reply.send(backups);
        } catch (error) {
            fastify.log.error('Error obteniendo backups:', error);
            return reply.code(500).send({
                error: 'Error al obtener backups',
                code: 'BACKUP_FETCH_ERROR'
            });
        }
    });

    // POST /api/admin/backup/:id/restore - Restaurar backup
    fastify.post('/backup/:id/restore', {
        preHandler: requireAdmin,
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string' }
                },
                required: ['id']
            }
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const result = await adminService.restoreBackup(fastify, id);
            return reply.send(result);
        } catch (error) {
            fastify.log.error('Error restaurando backup:', error);
            return reply.code(500).send({
                error: 'Error al restaurar backup',
                code: 'BACKUP_RESTORE_ERROR'
            });
        }
    });

    // === LOGS Y AUDITORÍA ===

    // GET /api/admin/logs - Obtener logs del sistema
    fastify.get('/logs', {
        preHandler: requireAdmin,
        schema: {
            querystring: {
                type: 'object',
                properties: {
                    page: { type: 'number', default: 1 },
                    limit: { type: 'number', default: 50 },
                    level: { type: 'string' },
                    dateFrom: { type: 'string' },
                    dateTo: { type: 'string' }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const { page = 1, limit = 50, level = '', dateFrom = '', dateTo = '' } = request.query;
            const logs = await adminService.getSystemLogs(fastify, { page, limit, level, dateFrom, dateTo });
            return reply.send(logs);
        } catch (error) {
            fastify.log.error('Error obteniendo logs:', error);
            return reply.code(500).send({
                error: 'Error al obtener logs',
                code: 'LOGS_FETCH_ERROR'
            });
        }
    });

    // GET /api/admin/audit - Obtener logs de auditoría
    fastify.get('/audit', {
        preHandler: requireAdmin,
        schema: {
            querystring: {
                type: 'object',
                properties: {
                    page: { type: 'number', default: 1 },
                    limit: { type: 'number', default: 50 },
                    action: { type: 'string' },
                    userId: { type: 'string' },
                    dateFrom: { type: 'string' },
                    dateTo: { type: 'string' }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const { page = 1, limit = 50, action = '', userId = '', dateFrom = '', dateTo = '' } = request.query;
            const auditLogs = await adminService.getAuditLogs(fastify, { page, limit, action, userId, dateFrom, dateTo });
            return reply.send(auditLogs);
        } catch (error) {
            fastify.log.error('Error obteniendo logs de auditoría:', error);
            return reply.code(500).send({
                error: 'Error al obtener logs de auditoría',
                code: 'AUDIT_FETCH_ERROR'
            });
        }
    });

    // === NOTIFICACIONES ===

    // POST /api/admin/notifications - Enviar notificación
    fastify.post('/notifications', {
        preHandler: requireAdmin,
        schema: {
            body: {
                type: 'object',
                properties: {
                    title: { type: 'string' },
                    message: { type: 'string' },
                    type: { type: 'string', enum: ['info', 'warning', 'error', 'success'] },
                    recipients: {
                        type: 'object',
                        properties: {
                            userIds: { type: 'array', items: { type: 'string' } },
                            roles: { type: 'array', items: { type: 'string' } },
                            all: { type: 'boolean' }
                        }
                    }
                },
                required: ['title', 'message', 'recipients']
            }
        }
    }, async (request, reply) => {
        try {
            const notificationData = request.body;
            const result = await adminService.sendNotification(fastify, notificationData);
            return reply.send(result);
        } catch (error) {
            fastify.log.error('Error enviando notificación:', error);
            return reply.code(500).send({
                error: 'Error al enviar notificación',
                code: 'NOTIFICATION_SEND_ERROR'
            });
        }
    });

    // GET /api/admin/notifications - Obtener notificaciones enviadas
    fastify.get('/notifications', {
        preHandler: requireAdmin,
        schema: {
            querystring: {
                type: 'object',
                properties: {
                    page: { type: 'number', default: 1 },
                    limit: { type: 'number', default: 20 }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const { page = 1, limit = 20 } = request.query;
            const notifications = await adminService.getSentNotifications(fastify, { page, limit });
            return reply.send(notifications);
        } catch (error) {
            fastify.log.error('Error obteniendo notificaciones:', error);
            return reply.code(500).send({
                error: 'Error al obtener notificaciones',
                code: 'NOTIFICATIONS_FETCH_ERROR'
            });
        }
    });

    // === ESTADÍSTICAS AVANZADAS ===

    // GET /api/admin/stats/usage - Estadísticas de uso
    fastify.get('/stats/usage', {
        preHandler: requireAdmin,
        schema: {
            querystring: {
                type: 'object',
                properties: {
                    period: { type: 'string', default: '30d' },
                    type: { type: 'string', default: 'all' }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const { period = '30d', type = 'all' } = request.query;
            const stats = await adminService.getUsageStats(fastify, { period, type });
            return reply.send(stats);
        } catch (error) {
            fastify.log.error('Error obteniendo estadísticas de uso:', error);
            return reply.code(500).send({
                error: 'Error al obtener estadísticas de uso',
                code: 'USAGE_STATS_ERROR'
            });
        }
    });

    // GET /api/admin/stats/performance - Estadísticas de performance
    fastify.get('/stats/performance', {
        preHandler: requireAdmin,
        schema: {
            querystring: {
                type: 'object',
                properties: {
                    period: { type: 'string', default: '24h' }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const { period = '24h' } = request.query;
            const stats = await adminService.getPerformanceStats(fastify, { period });
            return reply.send(stats);
        } catch (error) {
            fastify.log.error('Error obteniendo estadísticas de performance:', error);
            return reply.code(500).send({
                error: 'Error al obtener estadísticas de performance',
                code: 'PERFORMANCE_STATS_ERROR'
            });
        }
    });

    // GET /api/admin/metrics/realtime - Métricas en tiempo real
    fastify.get('/metrics/realtime', {
        preHandler: requireAdmin
    }, async (request, reply) => {
        try {
            const metrics = await adminService.getRealTimeMetrics(fastify);
            return reply.send(metrics);
        } catch (error) {
            fastify.log.error('Error obteniendo métricas en tiempo real:', error);
            return reply.code(500).send({
                error: 'Error al obtener métricas',
                code: 'REALTIME_METRICS_ERROR'
            });
        }
    });

    // === IMPORTACIÓN/EXPORTACIÓN DE DATOS ===

    // POST /api/admin/import/users - Importar usuarios desde CSV
    fastify.post('/import/users', {
        preHandler: requireAdmin
    }, async (request, reply) => {
        try {
            // Este endpoint manejaría la subida de archivos CSV
            const result = await adminService.importUsers(fastify, request.file);
            return reply.send(result);
        } catch (error) {
            fastify.log.error('Error importando usuarios:', error);
            return reply.code(500).send({
                error: 'Error al importar usuarios',
                code: 'IMPORT_USERS_ERROR'
            });
        }
    });

    // GET /api/admin/export/users - Exportar usuarios a CSV
    fastify.get('/export/users', {
        preHandler: requireAdmin,
        schema: {
            querystring: {
                type: 'object',
                properties: {
                    format: { type: 'string', enum: ['csv', 'xlsx'], default: 'csv' },
                    role: { type: 'string' },
                    status: { type: 'string' }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const { format = 'csv', role = '', status = '' } = request.query;
            const fileBuffer = await adminService.exportUsers(fastify, { format, role, status });

            reply.type('application/octet-stream');
            reply.header('Content-Disposition', `attachment; filename="users.${format}"`);
            return reply.send(fileBuffer);
        } catch (error) {
            fastify.log.error('Error exportando usuarios:', error);
            return reply.code(500).send({
                error: 'Error al exportar usuarios',
                code: 'EXPORT_USERS_ERROR'
            });
        }
    });

    // === LIMPIEZA Y MANTENIMIENTO ===

    // POST /api/admin/maintenance/cleanup - Limpiar datos obsoletos
    fastify.post('/maintenance/cleanup', {
        preHandler: requireAdmin,
        schema: {
            body: {
                type: 'object',
                properties: {
                    cleanupType: {
                        type: 'string',
                        enum: ['logs', 'sessions', 'temp_files', 'all']
                    },
                    olderThanDays: { type: 'number', default: 30 }
                },
                required: ['cleanupType']
            }
        }
    }, async (request, reply) => {
        try {
            const { cleanupType, olderThanDays = 30 } = request.body;
            const result = await adminService.performCleanup(fastify, { cleanupType, olderThanDays });
            return reply.send(result);
        } catch (error) {
            fastify.log.error('Error en limpieza:', error);
            return reply.code(500).send({
                error: 'Error en operación de limpieza',
                code: 'CLEANUP_ERROR'
            });
        }
    });

    // GET /api/admin/system/health - Estado de salud del sistema
    fastify.get('/system/health', {
        preHandler: requireAdmin
    }, async (request, reply) => {
        try {
            const health = await adminService.getSystemHealth(fastify);
            return reply.send(health);
        } catch (error) {
            fastify.log.error('Error obteniendo estado del sistema:', error);
            return reply.code(500).send({
                error: 'Error al obtener estado del sistema',
                code: 'SYSTEM_HEALTH_ERROR'
            });
        }
    });

    // PUT /api/admin/users/:id - Actualizar usuario
    fastify.put('/users/:id', {
        preHandler: requireAdmin,
        schema: adminSchemas.updateUser
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const userData = request.body;
            const updatedUser = await adminService.updateUser(fastify, id, userData);

            if (!updatedUser) {
                return reply.code(404).send({
                    error: 'Usuario no encontrado',
                    code: 'USER_NOT_FOUND'
                });
            }

            return reply.send(updatedUser);
        } catch (error) {
            fastify.log.error('Error actualizando usuario:', error);
            return reply.code(500).send({
                error: 'Error al actualizar usuario',
                code: 'USER_UPDATE_ERROR'
            });
        }
    });

    // DELETE /api/admin/users/:id - Eliminar usuario
    fastify.delete('/users/:id', {
        preHandler: requireAdmin,
        schema: adminSchemas.deleteUser
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const deleted = await adminService.deleteUser(fastify, id);

            if (!deleted) {
                return reply.code(404).send({
                    error: 'Usuario no encontrado',
                    code: 'USER_NOT_FOUND'
                });
            }

            return reply.send({ message: 'Usuario eliminado exitosamente' });
        } catch (error) {
            fastify.log.error('Error eliminando usuario:', error);
            return reply.code(500).send({
                error: 'Error al eliminar usuario',
                code: 'USER_DELETE_ERROR'
            });
        }
    });

    // PUT /api/admin/users/:id/role - Cambiar rol de usuario
    fastify.put('/users/:id/roles', {
        preHandler: requireAdmin,
        schema: adminSchemas.changeUserRole
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const { rol } = request.body;
            const updated = await adminService.changeUserRole(fastify, id, rol);

            if (!updated) {
                return reply.code(404).send({
                    error: 'Usuario no encontrado',
                    code: 'USER_NOT_FOUND'
                });
            }

            return reply.send({ message: 'Rol actualizado exitosamente' });
        } catch (error) {
            fastify.log.error('Error cambiando rol de usuario:', error);
            return reply.code(500).send({
                error: 'Error al cambiar rol',
                code: 'ROLE_CHANGE_ERROR'
            });
        }
    });

    // PUT /api/admin/users/:id/status - Activar/Desactivar usuario
    fastify.put('/users/:id/status', {
        preHandler: requireAdmin,
        schema: adminSchemas.toggleUserStatus
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const { active } = request.body;
            const updated = await adminService.toggleUserStatus(fastify, id, active);

            if (!updated) {
                return reply.code(404).send({
                    error: 'Usuario no encontrado',
                    code: 'USER_NOT_FOUND'
                });
            }

            return reply.send({
                message: `Usuario ${active ? 'activado' : 'desactivado'} exitosamente`
            });
        } catch (error) {
            fastify.log.error('Error cambiando estado de usuario:', error);
            return reply.code(500).send({
                error: 'Error al cambiar estado del usuario',
                code: 'STATUS_CHANGE_ERROR'
            });
        }
    });

    // === GESTIÓN DE ESTUDIANTES ===

    // GET /api/admin/students - Obtener estudiantes
    fastify.get('/students', {
        preHandler: requireAdmin,
        schema: adminSchemas.getStudents
    }, async (request, reply) => {
        try {
            const {
                page = 1,
                limit = 20,
                search = '',
                course = '',
                include_enrollments = 'false'
            } = request.query;

            const includeEnrollments = include_enrollments === 'true';

            const students = await adminService.getStudents(fastify, {
                page,
                limit,
                search,
                course,
                includeEnrollments
            });
            return reply.send(students);
        } catch (error) {
            fastify.log.error('Error obteniendo estudiantes:', error);
            return reply.code(500).send({
                error: 'Error al obtener estudiantes',
                code: 'STUDENTS_FETCH_ERROR'
            });
        }
    });

    // GET /api/admin/students/:id/courses - Obtener cursos de un estudiante
    fastify.get('/students/:id/courses', {
        preHandler: requireAdmin,
        schema: adminSchemas.getStudentCourses  // Puedes definirlo si quieres validación
    }, async (request, reply) => {
        try {
            const studentId = parseInt(request.params.id);
            const { page = 1, limit = 20 } = request.query;
            const result = await adminService.getStudentCourses(fastify, studentId, { page, limit });
            return reply.send(result);
        } catch (error) {
            fastify.log.error('Error obteniendo cursos del estudiante:', error);
            return reply.code(500).send({
                error: 'Error al obtener cursos del estudiante',
                code: 'STUDENT_COURSES_FETCH_ERROR'
            });
        }
    });

    // POST /api/courses/:id/enroll-student
    fastify.post('/courses/:id/enroll-student', {
        preHandler: requireAdmin,
        schema: adminSchemas.enrollStudent  // puedes definirla
    }, async (request, reply) => {
        try {
            const courseId = parseInt(request.params.id);
            const studentData = request.body;
            const result = await adminService.enrollStudent(fastify, courseId, studentData);
            return reply.send(result);
        } catch (error) {
            fastify.log.error('Error inscribiendo estudiante:', error);
            return reply.code(500).send({
                error: 'Error al inscribir estudiante',
                code: 'STUDENT_ENROLL_ERROR'
            });
        }
    });


    // PUT /api/admin/student-enrollments/:id
    fastify.put('/student-enrollments/:id', {
        preHandler: requireAdmin,
        schema: adminSchemas.updateEnrollment  // opcional
    }, async (request, reply) => {
        try {
            const enrollmentId = parseInt(request.params.id);
            const enrollmentData = request.body;
            const result = await adminService.updateEnrollment(fastify, enrollmentId, enrollmentData);
            return reply.send(result);
        } catch (error) {
            fastify.log.error('Error actualizando inscripción:', error);
            return reply.code(500).send({
                error: 'Error al actualizar inscripción',
                code: 'ENROLLMENT_UPDATE_ERROR'
            });
        }
    });

    // DELETE /api/admin/student-enrollments/:id
    fastify.delete('/student-enrollments/:id', {
        preHandler: requireAdmin
    }, async (request, reply) => {
        try {
            const enrollmentId = parseInt(request.params.id);
            await adminService.deleteEnrollment(fastify, enrollmentId);
            return reply.send({ success: true });
        } catch (error) {
            fastify.log.error('Error eliminando inscripción:', error);
            return reply.code(500).send({
                error: 'Error al eliminar inscripción',
                code: 'ENROLLMENT_DELETE_ERROR'
            });
        }
    });


    // === GESTIÓN DE DOCENTES ===

    // GET /api/admin/teachers - Obtener docentes
    fastify.get('/teachers', {
        preHandler: requireAdmin,
        schema: {
            querystring: {
                type: 'object',
                properties: {
                    page: { type: 'number', default: 1 },
                    limit: { type: 'number', default: 20 },
                    search: { type: 'string', default: '' },
                    department: { type: 'string', default: '' },
                    include_assignments: { type: 'string', default: 'false' }
                }
            }
        }
    }, async (request, reply) => {
        try {
            console.log('👨‍🏫 GET /teachers - Parámetros recibidos:', request.query);

            const {
                page = 1,
                limit = 20,
                search = '',
                department = '',
                include_assignments = 'false'
            } = request.query;

            const includeAssignments = include_assignments === 'true';

            const teachers = await adminService.getTeachers(fastify, {
                page,
                limit,
                search,
                department,
                includeAssignments
            });

            console.log('✅ Docentes obtenidos exitosamente:', teachers.teachers.length);
            return reply.send(teachers);
        } catch (error) {
            console.error('❌ Error en GET /teachers:', error);
            fastify.log.error('Error obteniendo docentes:', error);
            return reply.code(500).send({
                error: 'Error al obtener docentes',
                code: 'TEACHERS_FETCH_ERROR',
                details: error.message
            });
        }
    });

    // === NUEVAS RUTAS PARA GESTIÓN DE ASIGNACIONES DE DOCENTES ===

    // PUT /api/admin/teacher-assignments/:id - Actualizar asignación de docente
    fastify.put('/teacher-assignments/:id', {
        preHandler: requireAdmin,
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
                    tipo_asignacion: {
                        type: 'string',
                        enum: ['titular', 'asistente', 'colaborador']
                    },
                    activo: { type: 'boolean' }
                },
                required: ['tipo_asignacion', 'activo']
            }
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const assignmentData = request.body;

            console.log('🔄 PUT /teacher-assignments - Actualizando:', { id, assignmentData });

            const result = await adminService.updateTeacherAssignment(fastify, id, assignmentData);

            if (!result) {
                return reply.code(404).send({
                    error: 'Asignación no encontrada',
                    code: 'ASSIGNMENT_NOT_FOUND'
                });
            }

            console.log('✅ Asignación actualizada exitosamente');
            return reply.send(result);

        } catch (error) {
            console.error('❌ Error actualizando asignación:', error);
            fastify.log.error('Error actualizando asignación de docente:', error);
            return reply.code(500).send({
                error: 'Error al actualizar asignación',
                code: 'ASSIGNMENT_UPDATE_ERROR',
                details: error.message
            });
        }
    });

    // DELETE /api/admin/teacher-assignments/:id - Remover asignación de docente
    fastify.delete('/teacher-assignments/:id', {
        preHandler: requireAdmin,
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string' }
                },
                required: ['id']
            }
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params;

            console.log('🗑️ DELETE /teacher-assignments - Removiendo:', id);

            const result = await adminService.removeTeacherFromCourse(fastify, id);

            if (!result) {
                return reply.code(404).send({
                    error: 'Asignación no encontrada',
                    code: 'ASSIGNMENT_NOT_FOUND'
                });
            }

            console.log('✅ Asignación removida exitosamente');
            return reply.send(result);

        } catch (error) {
            console.error('❌ Error removiendo asignación:', error);
            fastify.log.error('Error removiendo asignación de docente:', error);
            return reply.code(500).send({
                error: 'Error al remover asignación',
                code: 'ASSIGNMENT_REMOVE_ERROR',
                details: error.message
            });
        }
    });

    // GET /api/admin/teachers/:id/courses - Obtener cursos de un docente específico
    fastify.get('/teachers/:id/courses', {
        preHandler: requireAdmin,
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string' }
                },
                required: ['id']
            },
            querystring: {
                type: 'object',
                properties: {
                    page: { type: 'number', default: 1 },
                    limit: { type: 'number', default: 20 }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const { page = 1, limit = 20 } = request.query;

            console.log('📚 GET /teachers/:id/courses - Obteniendo cursos del docente:', id);

            const result = await adminService.getTeacherCourses(fastify, id, { page, limit });

            if (!result) {
                return reply.code(404).send({
                    error: 'Docente no encontrado',
                    code: 'TEACHER_NOT_FOUND'
                });
            }

            console.log('✅ Cursos del docente obtenidos:', result.courses.length);
            return reply.send(result);

        } catch (error) {
            console.error('❌ Error obteniendo cursos del docente:', error);
            fastify.log.error('Error obteniendo cursos del docente:', error);
            return reply.code(500).send({
                error: 'Error al obtener cursos del docente',
                code: 'TEACHER_COURSES_ERROR',
                details: error.message
            });
        }
    });



    // === ESTADÍSTICAS DE CURSOS ===

    // GET /api/admin/courses/stats - Estadísticas de cursos
    fastify.get('/courses/stats', {
        preHandler: requireAdmin,
        schema: adminSchemas.courseStats
    }, async (request, reply) => {
        try {
            const stats = await adminService.getCourseStats(fastify);
            return reply.send(stats);
        } catch (error) {
            fastify.log.error('Error obteniendo estadísticas de cursos:', error);
            return reply.code(500).send({
                error: 'Error al obtener estadísticas de cursos',
                code: 'COURSE_STATS_ERROR'
            });
        }
    });

    // === ACTIVIDAD RECIENTE ===

    // GET /api/admin/activity - Obtener actividad reciente
    fastify.get('/activity', {
        preHandler: requireAdmin,
        schema: adminSchemas.getActivity
    }, async (request, reply) => {
        try {
            const { page = 1, limit = 10, type = '' } = request.query;
            const activity = await adminService.getRecentActivity(fastify, { page, limit, type });
            return reply.send(activity);
        } catch (error) {
            fastify.log.error('Error obteniendo actividad:', error);
            return reply.code(500).send({
                error: 'Error al obtener actividad',
                code: 'ACTIVITY_FETCH_ERROR'
            });
        }
    });

    // === REGISTROS RECIENTES ===

    // GET /api/admin/registrations/recent - Obtener registros recientes
    fastify.get('/registrations/recent', {
        preHandler: requireAdmin,
        schema: adminSchemas.getRecentRegistrations
    }, async (request, reply) => {
        try {
            const { days = 7, limit = 50 } = request.query;
            const registrations = await adminService.getRecentRegistrations(fastify, { days, limit });
            return reply.send(registrations);
        } catch (error) {
            fastify.log.error('Error obteniendo registros recientes:', error);
            return reply.code(500).send({
                error: 'Error al obtener registros recientes',
                code: 'RECENT_REGISTRATIONS_ERROR'
            });
        }
    });

    // === REPORTES ===

    // GET /api/admin/reports - Obtener reportes
    fastify.get('/reports', {
        preHandler: requireAdmin,
        schema: adminSchemas.getReports
    }, async (request, reply) => {
        try {
            const { page = 1, limit = 20, type = '', dateFrom = '', dateTo = '' } = request.query;
            const reports = await adminService.getReports(fastify, { page, limit, type, dateFrom, dateTo });
            return reply.send(reports);
        } catch (error) {
            fastify.log.error('Error obteniendo reportes:', error);
            return reply.code(500).send({
                error: 'Error al obtener reportes',
                code: 'REPORTS_FETCH_ERROR'
            });
        }
    });

    // POST /api/admin/reports/generate - Generar reporte
    fastify.post('/reports/generate', {
        preHandler: requireAdmin,
        schema: adminSchemas.generateReport
    }, async (request, reply) => {
        try {
            const { type, parameters } = request.body;
            const report = await adminService.generateReport(fastify, type, parameters);
            return reply.send(report);
        } catch (error) {
            fastify.log.error('Error generando reporte:', error);
            return reply.code(500).send({
                error: 'Error al generar reporte',
                code: 'REPORT_GENERATE_ERROR'
            });
        }
    });


    // === GESTIÓN DE HORARIOS DE EXAMEN ===

    // GET /api/admin/exam-schedules - Obtener horarios de examen
    fastify.get('/exam-schedules', {
        preHandler: requireAdmin,
        schema: {
            querystring: {
                type: 'object',
                properties: {
                    page: { type: 'number', default: 1 },
                    limit: { type: 'number', default: 10 },
                    search: { type: 'string', default: '' },
                    fecha: { type: 'string', default: '' },
                    status: { type: 'string', default: '' }
                }
            }
        }
    }, async (request, reply) => {
        try {
            console.log('📅 GET /exam-schedules - Parámetros recibidos:', request.query);

            const {
                page = 1,
                limit = 10,
                search = '',
                fecha = '',
                status = ''
            } = request.query;

            const result = await adminService.getExamSchedules(fastify, {
                page,
                limit,
                search,
                fecha,
                status
            });

            console.log('✅ Horarios obtenidos exitosamente:', result.schedules.length);
            return reply.send(result);

        } catch (error) {
            console.error('❌ Error en GET /exam-schedules:', error);
            fastify.log.error('Error obteniendo horarios de examen:', error);
            return reply.code(500).send({
                error: 'Error al obtener horarios de examen',
                code: 'EXAM_SCHEDULES_FETCH_ERROR',
                details: error.message
            });
        }
    });

    // GET /api/admin/exam-schedules/stats - Estadísticas de horarios
    fastify.get('/exam-schedules/stats', {
        preHandler: requireAdmin
    }, async (request, reply) => {
        try {
            console.log('📊 Obteniendo estadísticas de horarios de examen...');

            const stats = await adminService.getExamScheduleStats(fastify);

            console.log('✅ Estadísticas obtenidas:', stats);
            return reply.send(stats);

        } catch (error) {
            console.error('❌ Error obteniendo estadísticas:', error);
            return reply.code(500).send({
                error: 'Error al obtener estadísticas',
                code: 'EXAM_STATS_ERROR'
            });
        }
    });

    // POST /api/admin/exam-schedules - Crear nuevo horario
    fastify.post('/exam-schedules', {
        preHandler: requireAdmin,
        schema: {
            body: {
                type: 'object',
                properties: {
                    fecha_examen: { type: 'string', format: 'date' },
                    hora_inicio: { type: 'string' },
                    hora_fin: { type: 'string' },
                    cupos_disponibles: { type: 'number', minimum: 1 }
                },
                required: ['fecha_examen', 'hora_inicio', 'hora_fin', 'cupos_disponibles']
            }
        }
    }, async (request, reply) => {
        try {
            console.log('➕ POST /exam-schedules - Creando horario:', request.body);
            // Agregar el usuario que crea el horario
            const scheduleData = {
                ...request.body,
                creado_por: request.user.usuario_id
            };

            const result = await adminService.createExamSchedule(fastify, scheduleData);

            console.log('✅ Horario creado exitosamente');
            return reply.code(201).send(result);

        } catch (error) {
            console.error('❌ Error creando horario:', error);
            fastify.log.error('Error creando horario de examen:', error);

            if (error.message.includes('Ya existe un horario')) {
                return reply.code(409).send({
                    error: error.message,
                    code: 'SCHEDULE_CONFLICT'
                });
            }

            if (error.message.includes('fecha del examen debe ser futura')) {
                return reply.code(400).send({
                    error: error.message,
                    code: 'INVALID_EXAM_DATE'
                });
            }

            return reply.code(500).send({
                error: 'Error al crear horario de examen',
                code: 'SCHEDULE_CREATE_ERROR'
            });
        }
    });

    // PUT /api/admin/exam-schedules/:id - Actualizar horario
    fastify.put('/exam-schedules/:id', {
        preHandler: requireAdmin,
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
                    fecha_examen: { type: 'string', format: 'date' },
                    hora_inicio: { type: 'string' },
                    hora_fin: { type: 'string' },
                    cupos_disponibles: { type: 'number', minimum: 1 },
                    activo: { type: 'boolean' }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const updateData = request.body;

            console.log('🔄 PUT /exam-schedules - Actualizando:', { id, updateData });
            console.log("Final " ,updateData)

            const result = await adminService.updateExamSchedule(fastify, id, updateData);

            if (!result) {
                return reply.code(404).send({
                    error: 'Horario de examen no encontrado',
                    code: 'SCHEDULE_NOT_FOUND'
                });
            }

            console.log('✅ Horario actualizado exitosamente');
            return reply.send(result);

        } catch (error) {
            console.error('❌ Error actualizando horario:', error);
            return reply.code(500).send({
                error: 'Error al actualizar horario',
                code: 'SCHEDULE_UPDATE_ERROR'
            });
        }
    });

    // DELETE /api/admin/exam-schedules/:id - Eliminar horario
    fastify.delete('/exam-schedules/:id', {
        preHandler: requireAdmin,
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string' }
                },
                required: ['id']
            }
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params;

            console.log('🗑️ DELETE /exam-schedules - Eliminando:', id);

            const deleted = await adminService.deleteExamSchedule(fastify, id);

            if (!deleted) {
                return reply.code(404).send({
                    error: 'Horario no encontrado',
                    code: 'SCHEDULE_NOT_FOUND'
                });
            }

            console.log('✅ Horario eliminado exitosamente');
            return reply.send({
                message: 'Horario eliminado exitosamente'
            });

        } catch (error) {
            console.error('❌ Error eliminando horario:', error);
            
            if (error.message.includes('estudiantes agendados')) {
                return reply.code(400).send({
                    error: error.message,
                    code: 'SCHEDULE_HAS_STUDENTS'
                });
            }

            return reply.code(500).send({
                error: 'Error al eliminar horario',
                code: 'SCHEDULE_DELETE_ERROR'
            });
        }
    });

    // === GESTIÓN DE ESTUDIANTES EN HORARIOS ===

    // GET /api/admin/exam-schedules/:id/students - Obtener estudiantes de un horario
    fastify.get('/exam-schedules/:id/students', {
        preHandler: requireAdmin,
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string' }
                },
                required: ['id']
            }
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params;

            console.log('👥 GET /exam-schedules/:id/students - Obteniendo estudiantes:', id);

            const students = await adminService.getExamStudents(fastify, id);

            console.log('✅ Estudiantes obtenidos:', students.length);
            return reply.send(students);

        } catch (error) {
            console.error('❌ Error obteniendo estudiantes:', error);
            return reply.code(500).send({
                error: 'Error al obtener estudiantes del horario',
                code: 'EXAM_STUDENTS_FETCH_ERROR'
            });
        }
    });

    // GET /api/admin/exam-schedules/:id/available-students - Obtener estudiantes disponibles
    fastify.get('/exam-schedules/:id/available-students', {
        preHandler: requireAdmin,
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string' }
                },
                required: ['id']
            }
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params;

            console.log('🔍 GET /exam-schedules/:id/available-students - Buscando disponibles:', id);

            const students = await adminService.getAvailableStudentsForExam(fastify, id);

            console.log('✅ Estudiantes disponibles encontrados:', students.length);
            return reply.send(students);

        } catch (error) {
            console.error('❌ Error obteniendo estudiantes disponibles:', error);
            return reply.code(500).send({
                error: 'Error al obtener estudiantes disponibles',
                code: 'AVAILABLE_STUDENTS_FETCH_ERROR'
            });
        }
    });

    // POST /api/admin/exam-schedules/:id/students - Agregar estudiante al horario
    fastify.post('/exam-schedules/:id/students', {
        preHandler: requireAdmin,
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
                    estudiante_id: { type: 'number' }
                },
                required: ['estudiante_id']
            }
        }
    }, async (request, reply) => {
        try {
            const { id: horario_id } = request.params;
            const { estudiante_id } = request.body;

            console.log('➕ POST /exam-schedules/:id/students - Agregando estudiante:', { horario_id, estudiante_id });

            const result = await adminService.addStudentToExamSchedule(fastify, horario_id, estudiante_id);

            console.log('✅ Estudiante agregado exitosamente');
            return reply.code(201).send(result);

        } catch (error) {
            console.error('❌ Error agregando estudiante:', error);
            
            if (error.message.includes('No hay cupos disponibles')) {
                return reply.code(400).send({
                    error: error.message,
                    code: 'NO_SLOTS_AVAILABLE'
                });
            }

            if (error.message.includes('ya está agendado')) {
                return reply.code(409).send({
                    error: error.message,
                    code: 'STUDENT_ALREADY_SCHEDULED'
                });
            }

            return reply.code(500).send({
                error: 'Error al agregar estudiante al horario',
                code: 'ADD_STUDENT_ERROR'
            });
        }
    });

    // DELETE /api/admin/exam-schedules/:id/students/:studentId - Remover estudiante del horario
    fastify.delete('/exam-schedules/:id/students/:studentId', {
        preHandler: requireAdmin,
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    studentId: { type: 'string' }
                },
                required: ['id', 'studentId']
            }
        }
    }, async (request, reply) => {
        try {
            const { id: horario_id, studentId: estudiante_id } = request.params;

            console.log('🗑️ DELETE /exam-schedules/:id/students/:studentId - Removiendo:', { horario_id, estudiante_id });

            const result = await adminService.removeStudentFromExamSchedule(fastify, horario_id, estudiante_id);

            console.log('✅ Estudiante removido exitosamente');
            return reply.send(result);

        } catch (error) {
            console.error('❌ Error removiendo estudiante:', error);
            
            if (error.message.includes('no encontrado')) {
                return reply.code(404).send({
                    error: error.message,
                    code: 'APPOINTMENT_NOT_FOUND'
                });
            }

            return reply.code(500).send({
                error: 'Error al remover estudiante del horario',
                code: 'REMOVE_STUDENT_ERROR'
            });
        }
    });

    // PUT /api/admin/exam-schedules/:id/students/:studentId/status - Actualizar estado del estudiante
    fastify.put('/exam-schedules/:id/students/:studentId/status', {
        preHandler: requireAdmin,
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    studentId: { type: 'string' }
                },
                required: ['id', 'studentId']
            },
            body: {
                type: 'object',
                properties: {
                    estado: { type: 'string', enum: ['agendado', 'confirmado', 'cancelado', 'completado'] }
                },
                required: ['estado']
            }
        }
    }, async (request, reply) => {
        try {
            const { id: horario_id, studentId: estudiante_id } = request.params;
            const { estado } = request.body;

            console.log('🔄 PUT /exam-schedules/:id/students/:studentId/status - Actualizando estado:', { horario_id, estudiante_id, estado });

            const result = await adminService.updateStudentExamStatus(fastify, horario_id, estudiante_id, estado);

            console.log('✅ Estado actualizado exitosamente');
            return reply.send(result);

        } catch (error) {
            console.error('❌ Error actualizando estado:', error);
            
            if (error.message.includes('no encontrado')) {
                return reply.code(404).send({
                    error: error.message,
                    code: 'APPOINTMENT_NOT_FOUND'
                });
            }

            return reply.code(500).send({
                error: 'Error al actualizar estado del agendamiento',
                code: 'UPDATE_STATUS_ERROR'
            });
        }
    });

    fastify.log.info('✅ Rutas de administración registradas');
}

module.exports = adminRoutes;