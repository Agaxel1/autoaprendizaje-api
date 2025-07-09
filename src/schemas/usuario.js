// src/schemas/usuario.js

const getProfile = {
  summary: 'Obtener perfil del usuario',
  description: 'Obtener información completa del perfil del usuario autenticado',
  tags: ['Usuarios'],
  security: [{ bearerAuth: [] }],
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

const updateProfile = {
  summary: 'Actualizar perfil del usuario',
  description: 'Actualizar información del perfil del usuario autenticado',
  tags: ['Usuarios'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    properties: {
      nombres: { 
        type: 'string', 
        maxLength: 100,
        description: 'Nombres del usuario'
      },
      apellidos: { 
        type: 'string', 
        maxLength: 100,
        description: 'Apellidos del usuario'
      }
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
        fecha_actualizacion: { type: 'string', format: 'date-time' }
      }
    }
  }
};

const getDashboard = {
  summary: 'Obtener dashboard del estudiante',
  description: 'Obtener información del dashboard con progreso y estadísticas',
  tags: ['Usuarios'],
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      type: 'object',
      properties: {
        estudiante: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            nombres: { type: 'string' },
            apellidos: { type: 'string' }
          }
        },
        estadisticas: {
          type: 'object',
          properties: {
            cursos_inscritos: { type: 'integer' },
            actividades_completadas: { type: 'integer' },
            promedio_general: { type: 'number' },
            utmcoins: { type: 'integer' },
            racha_actual: { type: 'integer' }
          }
        },
        cursos_recientes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              nombre: { type: 'string' },
              progreso: { type: 'number' },
              ultima_actividad: { type: 'string', format: 'date-time' }
            }
          }
        },
        proximas_actividades: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              nombre: { type: 'string' },
              curso: { type: 'string' },
              desbloqueado: { type: 'boolean' }
            }
          }
        }
      }
    }
  }
};

const getProgress = {
  summary: 'Obtener progreso del usuario',
  description: 'Obtener el progreso del usuario en un curso específico o general',
  tags: ['Usuarios'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      curso_id: { 
        type: 'integer',
        description: 'ID del curso (opcional)'
      }
    }
  },
  response: {
    200: {
      type: 'object',
      properties: {
        progreso_general: {
          type: 'object',
          properties: {
            porcentaje_completado: { type: 'number' },
            actividades_completadas: { type: 'integer' },
            total_actividades: { type: 'integer' },
            niveles_completados: { type: 'integer' }
          }
        },
        niveles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              nivel_nombre: { type: 'string' },
              progreso_porcentaje: { type: 'number' },
              actividades_completadas: { type: 'integer' },
              total_actividades: { type: 'integer' },
              desbloqueado: { type: 'boolean' }
            }
          }
        }
      }
    }
  }
};

const getUserCourses = {
  summary: 'Obtener cursos del usuario',
  description: 'Obtener lista de cursos en los que el usuario está inscrito o asignado',
  tags: ['Usuarios'],
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      type: 'object',
      properties: {
        cursos_estudiante: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              nombre: { type: 'string' },
              codigo_curso: { type: 'string' },
              estado: { type: 'string' },
              progreso: { type: 'number' },
              fecha_inscripcion: { type: 'string', format: 'date-time' }
            }
          }
        },
        cursos_docente: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              nombre: { type: 'string' },
              codigo_curso: { type: 'string' },
              tipo_asignacion: { type: 'string' },
              total_estudiantes: { type: 'integer' }
            }
          }
        }
      }
    }
  }
};

const enrollCourse = {
  summary: 'Inscribirse en un curso',
  description: 'Inscribir al estudiante en un curso específico',
  tags: ['Usuarios'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['courseId'],
    properties: {
      courseId: { 
        type: 'integer',
        description: 'ID del curso'
      }
    }
  },
  response: {
    201: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        inscripcion: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            curso_id: { type: 'integer' },
            usuario_id: { type: 'integer' },
            estado: { type: 'string' },
            fecha_inscripcion: { type: 'string', format: 'date-time' }
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

module.exports = {
  getProfile,
  updateProfile,
  getDashboard,
  getProgress,
  getUserCourses,
  enrollCourse
};