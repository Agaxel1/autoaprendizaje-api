// src/schemas/admin.js

// === ESTADÍSTICAS DEL DASHBOARD ===

const dashboardStats = {
    summary: 'Obtener estadísticas del dashboard',
    description: 'Obtiene estadísticas generales para el dashboard de administración',
    tags: ['Administración'],
    security: [{ bearerAuth: [] }],
    response: {
        200: {
            type: 'object',
            properties: {
                totalUsers: { type: 'integer', description: 'Total de usuarios activos' },
                totalStudents: { type: 'integer', description: 'Total de estudiantes' },
                totalTeachers: { type: 'integer', description: 'Total de docentes' },
                totalCourses: { type: 'integer', description: 'Total de cursos' },
                activeCourses: { type: 'integer', description: 'Cursos activos' },
                newRegistrations: { type: 'integer', description: 'Nuevos registros en la semana' },
                systemStatus: { type: 'string', description: 'Estado del sistema' }
            }
        },
        403: {
            type: 'object',
            properties: {
                error: { type: 'string' },
                code: { type: 'string' }
            }
        }
    }
};

// === GESTIÓN DE USUARIOS ===

const getUsers = {
    summary: 'Obtener lista de usuarios',
    description: 'Obtiene una lista paginada de usuarios con filtros opcionales',
    tags: ['Administración', 'Usuarios'],
    security: [{ bearerAuth: [] }],
    querystring: {
        type: 'object',
        properties: {
            page: { type: 'integer', minimum: 1, default: 1, description: 'Página actual' },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20, description: 'Elementos por página' },
            search: { type: 'string', description: 'Buscar por nombre, email o código' },
            role: { type: 'string', enum: ['estudiante', 'docente', 'administrador'], description: 'Filtrar por rol' },
            status: { type: 'string', enum: ['activo', 'inactivo'], description: 'Filtrar por estado' }
        }
    },
    response: {
        200: {
            type: 'object',
            properties: {
                users: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'integer' },
                            codigo_institucional: { type: ['string', 'null'] },
                            email: { type: 'string' },
                            nombres: { type: 'string' },
                            apellidos: { type: 'string' },
                            activo: { type: 'boolean' },
                            fecha_creacion: { type: 'string', format: 'date-time' },
                            fecha_actualizacion: { type: ['string', 'null'], format: 'date-time' },
                            // CORRECCIÓN: Permitir tanto array de strings como null
                            roles: {
                                type: ['array', 'null'],
                                items: { type: 'string' },
                                default: []
                            }
                        }
                    }
                },
                pagination: {
                    type: 'object',
                    properties: {
                        page: { type: 'integer' },
                        limit: { type: 'integer' },
                        total: { type: 'integer' },
                        totalPages: { type: 'integer' },
                        hasNext: { type: 'boolean' },
                        hasPrev: { type: 'boolean' }
                    }
                }
            }
        }
    }
};

const userStats = {
    summary: 'Obtener estadísticas de usuarios',
    description: 'Obtiene estadísticas detalladas sobre usuarios del sistema',
    tags: ['Administración', 'Usuarios'],
    security: [{ bearerAuth: [] }],
    response: {
        200: {
            type: 'object',
            properties: {
                total_usuarios: { type: 'string' },
                usuarios_activos: { type: 'string' },
                usuarios_inactivos: { type: 'string' },
                nuevos_ultimo_mes: { type: 'string' },
                nuevos_ultima_semana: { type: 'string' },
                roles_distribution: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            rol: { type: 'string' },
                            cantidad: { type: 'string' }
                        }
                    }
                }
            }
        }
    }
};

const getUser = {
    summary: 'Obtener usuario específico',
    description: 'Obtiene información detallada de un usuario por su ID',
    tags: ['Administración', 'Usuarios'],
    security: [{ bearerAuth: [] }],
    params: {
        type: 'object',
        required: ['id'],
        properties: {
            id: { type: 'integer', description: 'ID del usuario' }
        }
    },
    response: {
        200: {
            type: 'object',
            properties: {
                id: { type: 'integer' },
                codigo_institucional: { type: 'string' },
                email: { type: 'string' },
                nombres: { type: 'string' },
                apellidos: { type: 'string' },
                activo: { type: 'boolean' },
                fecha_creacion: { type: 'string', format: 'date-time' },
                fecha_actualizacion: { type: 'string', format: 'date-time' },
                roles: {
                    type: 'array',
                    items: { type: 'string' }
                }
            }
        },
        404: {
            type: 'object',
            properties: {
                error: { type: 'string' },
                code: { type: 'string' }
            }
        }
    }
};

const createUser = {
    summary: 'Crear nuevo usuario',
    description: 'Crea un nuevo usuario en el sistema',
    tags: ['Administración', 'Usuarios'],
    security: [{ bearerAuth: [] }],
    body: {
        type: 'object',
        required: ['email', 'nombres', 'apellidos'],
        properties: {
            codigo_institucional: { type: 'string', maxLength: 20, description: 'Código institucional' },
            email: { type: 'string', format: 'email', maxLength: 100, description: 'Email del usuario' },
            nombres: { type: 'string', maxLength: 100, description: 'Nombres del usuario' },
            apellidos: { type: 'string', maxLength: 100, description: 'Apellidos del usuario' },
            password: { type: 'string', minLength: 8, description: 'Contraseña del usuario' },
            roles: {
                type: 'array',
                items: { type: 'string', enum: ['estudiante', 'docente', 'administrador'] },
                default: ['estudiante'],
                description: 'Roles del usuario'
            }
        }
    },
    response: {
        201: {
            type: 'object',
            properties: {
                message: { type: 'string' },
                usuario: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        codigo_institucional: { type: 'string' },
                        email: { type: 'string' },
                        nombres: { type: 'string' },
                        apellidos: { type: 'string' },
                        activo: { type: 'boolean' },
                        fecha_creacion: { type: 'string', format: 'date-time' },
                        roles: {
                            type: 'array',
                            items: { type: 'string' }
                        }
                    }
                }
            }
        },
        409: {
            type: 'object',
            properties: {
                error: { type: 'string' },
                code: { type: 'string' }
            }
        }
    }
};

const updateUser = {
    summary: 'Actualizar usuario',
    description: 'Actualiza la información de un usuario existente',
    tags: ['Administración', 'Usuarios'],
    security: [{ bearerAuth: [] }],
    params: {
        type: 'object',
        required: ['id'],
        properties: {
            id: { type: 'integer', description: 'ID del usuario' }
        }
    },
    body: {
        type: 'object',
        required: ['email', 'nombres', 'apellidos'],
        properties: {
            codigo_institucional: { type: 'string', maxLength: 20 },
            email: { type: 'string', format: 'email', maxLength: 100 },
            nombres: { type: 'string', maxLength: 100 },
            apellidos: { type: 'string', maxLength: 100 },
            password: { type: 'string', minLength: 8, description: 'Nueva contraseña (opcional)' }
        }
    },
    response: {
        200: {
            type: 'object',
            properties: {
                message: { type: 'string' },
                usuario: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        codigo_institucional: { type: 'string' },
                        email: { type: 'string' },
                        nombres: { type: 'string' },
                        apellidos: { type: 'string' },
                        activo: { type: 'boolean' },
                        fecha_actualizacion: { type: 'string', format: 'date-time' }
                    }
                }
            }
        },
        404: {
            type: 'object',
            properties: {
                error: { type: 'string' },
                code: { type: 'string' }
            }
        }
    }
};

const deleteUser = {
    summary: 'Eliminar usuario',
    description: 'Desactiva un usuario del sistema',
    tags: ['Administración', 'Usuarios'],
    security: [{ bearerAuth: [] }],
    params: {
        type: 'object',
        required: ['id'],
        properties: {
            id: { type: 'integer', description: 'ID del usuario a eliminar' }
        }
    },
    response: {
        200: {
            type: 'object',
            properties: {
                message: { type: 'string' }
            }
        },
        404: {
            type: 'object',
            properties: {
                error: { type: 'string' },
                code: { type: 'string' }
            }
        }
    }
};

const changeUserRole = {
    summary: 'Cambiar rol de usuario',
    description: 'Cambia el rol de un usuario específico',
    tags: ['Administración', 'Usuarios'],
    security: [{ bearerAuth: [] }],
    params: {
        type: 'object',
        required: ['id'],
        properties: {
            id: { type: 'integer', description: 'ID del usuario' }
        }
    },
    body: {
        type: 'object',
        required: ['rol'],
        properties: {
            rol: {
                type: 'string',
                enum: ['estudiante', 'docente', 'administrador'],
                description: 'Nuevo rol del usuario'
            }
        }
    },
    response: {
        200: {
            type: 'object',
            properties: {
                message: { type: 'string' }
            }
        },
        404: {
            type: 'object',
            properties: {
                error: { type: 'string' },
                code: { type: 'string' }
            }
        }
    }
};

const toggleUserStatus = {
    summary: 'Activar/Desactivar usuario',
    description: 'Cambia el estado activo/inactivo de un usuario',
    tags: ['Administración', 'Usuarios'],
    security: [{ bearerAuth: [] }],
    params: {
        type: 'object',
        required: ['id'],
        properties: {
            id: { type: 'integer', description: 'ID del usuario' }
        }
    },
    body: {
        type: 'object',
        required: ['active'],
        properties: {
            active: {
                type: 'boolean',
                description: 'Estado activo del usuario'
            }
        }
    },
    response: {
        200: {
            type: 'object',
            properties: {
                message: { type: 'string' }
            }
        },
        404: {
            type: 'object',
            properties: {
                error: { type: 'string' },
                code: { type: 'string' }
            }
        }
    }
};

// === GESTIÓN DE ESTUDIANTES ===

const getStudents = {
    summary: 'Obtener lista de estudiantes',
    description: 'Obtiene una lista paginada de estudiantes',
    tags: ['Administración', 'Estudiantes'],
    security: [{ bearerAuth: [] }],
    querystring: {
        type: 'object',
        properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, default: 20 },
            search: { type: 'string', description: 'Buscar por nombre o email' },
            course: { type: 'string', description: 'Filtrar por curso específico' },
            include_enrollments: {
                type: 'string',
                enum: ['true', 'false'],
                description: 'Incluir inscripciones del estudiante'
            }
        }
    },
    response: {
        200: {
            type: 'object',
            properties: {
                students: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'integer' },
                            codigo_institucional: { type: 'string' },
                            email: { type: 'string' },
                            nombres: { type: 'string' },
                            apellidos: { type: 'string' },
                            fecha_creacion: { type: 'string', format: 'date-time' },
                            cursos_inscritos: { type: 'string' },
                            activo: { type: 'boolean' },
                            inscripciones: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        id: { type: 'integer' },
                                        curso_id: { type: 'integer' },
                                        curso_nombre: { type: 'string' },
                                        curso_codigo: { type: 'string' },
                                        estado: { type: 'string' },
                                        fecha_inscripcion: { type: 'string', format: 'date-time' },
                                        fecha_estado: { type: 'string', format: 'date-time' },
                                        nota_final: { type: ['number', 'null'] }
                                    }
                                }
                            }
                        }
                    }
                },
                pagination: {
                    type: 'object',
                    properties: {
                        page: { type: 'integer' },
                        limit: { type: 'integer' },
                        total: { type: 'integer' },
                        totalPages: { type: 'integer' },
                        hasNext: { type: 'boolean' },
                        hasPrev: { type: 'boolean' }
                    }
                }
            }
        }
    }
};


const getStudentCourses = {
    summary: 'Obtener cursos de un estudiante',
    description: 'Devuelve una lista paginada de los cursos a los que está inscrito un estudiante específico',
    tags: ['Administración', 'Estudiantes'],
    security: [{ bearerAuth: [] }],
    params: {
        type: 'object',
        properties: {
            id: { type: 'integer', description: 'ID del estudiante' }
        },
        required: ['id']
    },
    querystring: {
        type: 'object',
        properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, default: 20 }
        }
    },
    response: {
        200: {
            type: 'object',
            properties: {
                cursos: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            inscripcion_id: { type: 'integer' },
                            curso_id: { type: 'integer' },
                            nombre: { type: 'string' },
                            codigo_curso: { type: 'string' },
                            estado: { type: 'string' },
                            fecha_inscripcion: { type: 'string', format: 'date-time' },
                            fecha_estado: { type: 'string', format: 'date-time' },
                            nota_final: { type: ['number', 'null'] }
                        }
                    }
                },
                pagination: {
                    type: 'object',
                    properties: {
                        page: { type: 'integer' },
                        limit: { type: 'integer' },
                        total: { type: 'integer' },
                        totalPages: { type: 'integer' },
                        hasNext: { type: 'boolean' },
                        hasPrev: { type: 'boolean' }
                    }
                }
            }
        }
    }
};

const enrollStudentToCourse = {
    summary: 'Inscribir estudiante en curso',
    description: 'Inscribe un estudiante específico en un curso',
    tags: ['Administración', 'Estudiantes'],
    security: [{ bearerAuth: [] }],
    params: {
        type: 'object',
        properties: {
            courseId: { type: 'integer' }
        },
        required: ['courseId']
    },
    body: {
        type: 'object',
        properties: {
            usuario_id: { type: 'integer' },
            estado: { type: 'string', enum: ['inscrito', 'completado', 'retirado'] }
        },
        required: ['usuario_id']
    },
    response: {
        200: {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                message: { type: 'string' }
            }
        }
    }
};
const updateStudentEnrollment = {
    summary: 'Actualizar inscripción de estudiante',
    description: 'Permite actualizar los detalles de una inscripción',
    tags: ['Administración', 'Estudiantes'],
    security: [{ bearerAuth: [] }],
    params: {
        type: 'object',
        properties: {
            enrollmentId: { type: 'integer' }
        },
        required: ['enrollmentId']
    },
    body: {
        type: 'object',
        properties: {
            estado: { type: 'string', enum: ['inscrito', 'completado', 'retirado'] },
            nota_final: { type: 'number' }
        }
    },
    response: {
        200: {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                message: { type: 'string' }
            }
        }
    }
};

const removeStudentFromCourse = {
    summary: 'Eliminar inscripción de estudiante',
    description: 'Elimina la inscripción del estudiante de un curso',
    tags: ['Administración', 'Estudiantes'],
    security: [{ bearerAuth: [] }],
    params: {
        type: 'object',
        properties: {
            enrollmentId: { type: 'integer' }
        },
        required: ['enrollmentId']
    },
    response: {
        200: {
            type: 'object',
            properties: {
                success: { type: 'boolean' }
            }
        }
    }
};


// === GESTIÓN DE DOCENTES ===

const getTeachers = {
    summary: 'Obtener lista de docentes',
    description: 'Obtiene una lista paginada de docentes',
    tags: ['Administración', 'Docentes'],
    security: [{ bearerAuth: [] }],
    querystring: {
        type: 'object',
        properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            search: { type: 'string', description: 'Buscar por nombre o email' },
            department: { type: 'string', description: 'Filtrar por departamento' }
        }
    },
    response: {
        200: {
            type: 'object',
            properties: {
                teachers: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'integer' },
                            codigo_institucional: { type: 'string' },
                            email: { type: 'string' },
                            nombres: { type: 'string' },
                            apellidos: { type: 'string' },
                            fecha_creacion: { type: 'string', format: 'date-time' },
                            cursos_asignados: { type: 'string' }
                        }
                    }
                },
                pagination: {
                    type: 'object',
                    properties: {
                        page: { type: 'integer' },
                        limit: { type: 'integer' },
                        total: { type: 'integer' },
                        totalPages: { type: 'integer' },
                        hasNext: { type: 'boolean' },
                        hasPrev: { type: 'boolean' }
                    }
                }
            }
        }
    }
};

// === ESTADÍSTICAS DE CURSOS ===

const courseStats = {
    summary: 'Obtener estadísticas de cursos',
    description: 'Obtiene estadísticas detalladas sobre cursos del sistema',
    tags: ['Administración', 'Cursos'],
    security: [{ bearerAuth: [] }],
    response: {
        200: {
            type: 'object',
            properties: {
                total_cursos: { type: 'string' },
                cursos_activos: { type: 'string' },
                cursos_inactivos: { type: 'string' },
                nuevos_ultimo_mes: { type: 'string' },
                promedio_porcentaje_minimo: { type: 'string' },
                total_inscripciones: { type: 'string' },
                estudiantes_unicos: { type: 'string' },
                cursos_con_estudiantes: { type: 'string' }
            }
        }
    }
};

// === ACTIVIDAD RECIENTE ===

const getActivity = {
    summary: 'Obtener actividad reciente',
    description: 'Obtiene un log de actividad reciente del sistema',
    tags: ['Administración', 'Actividad'],
    security: [{ bearerAuth: [] }],
    querystring: {
        type: 'object',
        properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
            type: { type: 'string', description: 'Filtrar por tipo de actividad' }
        }
    },
    response: {
        200: {
            type: 'object',
            properties: {
                activity: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            tipo: { type: 'string' },
                            descripcion: { type: 'string' },
                            fecha: { type: 'string', format: 'date-time' },
                            entidad: { type: 'string' }
                        }
                    }
                },
                pagination: {
                    type: 'object',
                    properties: {
                        page: { type: 'integer' },
                        limit: { type: 'integer' },
                        total: { type: 'integer' },
                        totalPages: { type: 'integer' },
                        hasNext: { type: 'boolean' },
                        hasPrev: { type: 'boolean' }
                    }
                }
            }
        }
    }
};

// === REGISTROS RECIENTES ===

const getRecentRegistrations = {
    summary: 'Obtener registros recientes',
    description: 'Obtiene una lista de usuarios registrados recientemente',
    tags: ['Administración', 'Registros'],
    security: [{ bearerAuth: [] }],
    querystring: {
        type: 'object',
        properties: {
            days: { type: 'integer', minimum: 1, maximum: 365, default: 7, description: 'Días hacia atrás' },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 50, description: 'Límite de resultados' }
        }
    },
    response: {
        200: {
            type: 'object',
            properties: {
                registrations: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'integer' },
                            codigo_institucional: { type: 'string' },
                            email: { type: 'string' },
                            nombres: { type: 'string' },
                            apellidos: { type: 'string' },
                            fecha_creacion: { type: 'string', format: 'date-time' },
                            roles: {
                                type: 'array',
                                items: { type: 'string' }
                            }
                        }
                    }
                },
                period: { type: 'string' },
                total: { type: 'integer' }
            }
        }
    }
};

// === REPORTES ===

const getReports = {
    summary: 'Obtener lista de reportes',
    description: 'Obtiene una lista de reportes generados en el sistema',
    tags: ['Administración', 'Reportes'],
    security: [{ bearerAuth: [] }],
    querystring: {
        type: 'object',
        properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            type: { type: 'string', enum: ['usuarios', 'cursos', 'actividad'], description: 'Tipo de reporte' },
            dateFrom: { type: 'string', format: 'date', description: 'Fecha desde (YYYY-MM-DD)' },
            dateTo: { type: 'string', format: 'date', description: 'Fecha hasta (YYYY-MM-DD)' }
        }
    },
    response: {
        200: {
            type: 'object',
            properties: {
                reports: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'integer' },
                            tipo: { type: 'string' },
                            nombre: { type: 'string' },
                            descripcion: { type: 'string' },
                            fecha_generacion: { type: 'string', format: 'date-time' },
                            generado_por: { type: 'string' },
                            estado: { type: 'string', enum: ['pendiente', 'procesando', 'completado', 'error'] }
                        }
                    }
                },
                pagination: {
                    type: 'object',
                    properties: {
                        page: { type: 'integer' },
                        limit: { type: 'integer' },
                        total: { type: 'integer' },
                        totalPages: { type: 'integer' },
                        hasNext: { type: 'boolean' },
                        hasPrev: { type: 'boolean' }
                    }
                }
            }
        }
    }
};

const generateReport = {
    summary: 'Generar nuevo reporte',
    description: 'Genera un nuevo reporte del tipo especificado',
    tags: ['Administración', 'Reportes'],
    security: [{ bearerAuth: [] }],
    body: {
        type: 'object',
        required: ['type'],
        properties: {
            type: {
                type: 'string',
                enum: ['usuarios', 'cursos', 'actividad'],
                description: 'Tipo de reporte a generar'
            },
            parameters: {
                type: 'object',
                description: 'Parámetros específicos para el reporte',
                properties: {
                    dateFrom: { type: 'string', format: 'date', description: 'Fecha desde' },
                    dateTo: { type: 'string', format: 'date', description: 'Fecha hasta' },
                    includeInactive: { type: 'boolean', default: false, description: 'Incluir elementos inactivos' },
                    format: { type: 'string', enum: ['json', 'csv', 'pdf'], default: 'json', description: 'Formato del reporte' }
                }
            }
        }
    },
    response: {
        200: {
            type: 'object',
            properties: {
                id: { type: 'integer' },
                tipo: { type: 'string' },
                fecha_generacion: { type: 'string', format: 'date-time' },
                estado: { type: 'string' },
                datos: {
                    type: 'object',
                    description: 'Datos del reporte generado'
                }
            }
        },
        400: {
            type: 'object',
            properties: {
                error: { type: 'string' },
                code: { type: 'string' }
            }
        }
    }
};

module.exports = {
    // Estadísticas
    dashboardStats,

    // Usuarios
    getUsers,
    userStats,
    getUser,
    createUser,
    updateUser,
    deleteUser,
    changeUserRole,
    toggleUserStatus,

    // Estudiantes y Docentes
    getStudents,
    getStudentCourses,
    enrollStudentToCourse,
    updateStudentEnrollment,
    removeStudentFromCourse,
    getTeachers,
    // Cursos
    courseStats,

    // Actividad
    getActivity,
    getRecentRegistrations,

    // Reportes
    getReports,
    generateReport
};