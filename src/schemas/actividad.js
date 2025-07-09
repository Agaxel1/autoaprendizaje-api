// src/schemas/actividad.js

const getTaskActivities = {
  summary: 'Obtener actividades de una tarea',
  description: 'Obtener todas las actividades de una tarea específica con su progreso',
  tags: ['Actividades'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['taskId'],
    properties: {
      taskId: { 
        type: 'integer',
        description: 'ID de la tarea'
      }
    }
  },
  response: {
    200: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          nombre: { type: 'string' },
          descripcion: { type: 'string' },
          tipo: { type: 'string', enum: ['pregunta', 'juego'] },
          orden: { type: 'integer' },
          completado: { type: 'boolean' },
          desbloqueado: { type: 'boolean' },
          puntuacion: { type: 'number' },
          fecha_completado: { type: 'string', format: 'date-time' },
          tiempo_empleado_segundos: { type: 'integer' }
        }
      }
    }
  }
};

const getActivity = {
  summary: 'Obtener detalles de una actividad',
  description: 'Obtener información detallada de una actividad específica',
  tags: ['Actividades'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { 
        type: 'integer',
        description: 'ID de la actividad'
      }
    }
  },
  response: {
    200: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        nombre: { type: 'string' },
        descripcion: { type: 'string' },
        tipo: { type: 'string', enum: ['pregunta', 'juego'] },
        orden: { type: 'integer' },
        completado: { type: 'boolean' },
        desbloqueado: { type: 'boolean' },
        puntuacion: { type: 'number' },
        fecha_completado: { type: 'string', format: 'date-time' },
        tiempo_empleado_segundos: { type: 'integer' },
        tarea: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            nombre: { type: 'string' }
          }
        }
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

const getActivityQuestions = {
  summary: 'Obtener preguntas de una actividad',
  description: 'Obtener las preguntas de una actividad tipo pregunta',
  tags: ['Actividades'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { 
        type: 'integer',
        description: 'ID de la actividad'
      }
    }
  },
  response: {
    200: {
      type: 'object',
      properties: {
        actividad_id: { type: 'integer' },
        preguntas: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              pregunta: { type: 'string' },
              tipo_pregunta: { 
                type: 'string', 
                enum: ['seleccion_multiple', 'emparejamiento', 'ordenamiento', 'verdadero_falso']
              },
              opciones: { type: 'object' },
              nivel_dificultad: { 
                type: 'string', 
                enum: ['facil', 'medio', 'dificil']
              }
            }
          }
        }
      }
    }
  }
};

const completeActivity = {
  summary: 'Completar una actividad',
  description: 'Marcar una actividad como completada con puntuación y tiempo',
  tags: ['Actividades'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { 
        type: 'integer',
        description: 'ID de la actividad'
      }
    }
  },
  body: {
    type: 'object',
    required: ['puntuacion', 'tiempo_empleado_segundos'],
    properties: {
      puntuacion: { 
        type: 'number', 
        minimum: 0, 
        maximum: 100,
        description: 'Puntuación obtenida (0-100)'
      },
      tiempo_empleado_segundos: { 
        type: 'integer', 
        minimum: 0,
        description: 'Tiempo empleado en segundos'
      },
      respuestas: {
        type: 'array',
        description: 'Respuestas del estudiante',
        items: {
          type: 'object',
          properties: {
            pregunta_id: { type: 'integer' },
            respuesta: { type: 'object' },
            es_correcto: { type: 'boolean' }
          }
        }
      }
    }
  },
  response: {
    200: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        progreso: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            completado: { type: 'boolean' },
            puntuacion: { type: 'number' },
            fecha_completado: { type: 'string', format: 'date-time' },
            tiempo_empleado_segundos: { type: 'integer' }
          }
        },
        recompensas: {
          type: 'object',
          properties: {
            utmcoins_ganadas: { type: 'integer' },
            siguiente_desbloqueada: { type: 'boolean' }
          }
        }
      }
    }
  }
};

const submitAnswers = {
  summary: 'Enviar respuestas de una actividad',
  description: 'Enviar respuestas de una actividad para calificación automática',
  tags: ['Actividades'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { 
        type: 'integer',
        description: 'ID de la actividad'
      }
    }
  },
  body: {
    type: 'object',
    required: ['respuestas'],
    properties: {
      respuestas: {
        type: 'array',
        description: 'Respuestas del estudiante',
        items: {
          type: 'object',
          required: ['pregunta_id', 'respuesta'],
          properties: {
            pregunta_id: { type: 'integer' },
            respuesta: { type: 'object' },
            tiempo_respuesta: { type: 'integer' }
          }
        }
      },
      tiempo_empleado_segundos: { 
        type: 'integer', 
        minimum: 0,
        description: 'Tiempo total empleado en segundos'
      }
    }
  },
  response: {
    200: {
      type: 'object',
      properties: {
        puntuacion: { type: 'number' },
        respuestas_correctas: { type: 'integer' },
        total_preguntas: { type: 'integer' },
        porcentaje: { type: 'number' },
        feedback: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              pregunta_id: { type: 'integer' },
              es_correcto: { type: 'boolean' },
              respuesta_correcta: { type: 'object' },
              explicacion: { type: 'string' }
            }
          }
        }
      }
    }
  }
};

const getActivityProgress = {
  summary: 'Obtener progreso de actividad',
  description: 'Obtener el progreso detallado de una actividad específica',
  tags: ['Actividades'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { 
        type: 'integer',
        description: 'ID de la actividad'
      }
    }
  },
  response: {
    200: {
      type: 'object',
      properties: {
        actividad_id: { type: 'integer' },
        completado: { type: 'boolean' },
        desbloqueado: { type: 'boolean' },
        puntuacion: { type: 'number' },
        fecha_completado: { type: 'string', format: 'date-time' },
        tiempo_empleado_segundos: { type: 'integer' },
        intentos: { type: 'integer' },
        mejor_puntuacion: { type: 'number' }
      }
    }
  }
};

const createActivity = {
  summary: 'Crear nueva actividad',
  description: 'Crear una nueva actividad en una tarea (solo docentes)',
  tags: ['Actividades'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['tarea_id', 'nombre', 'tipo'],
    properties: {
      tarea_id: { type: 'integer' },
      nombre: { 
        type: 'string', 
        maxLength: 100,
        description: 'Nombre de la actividad'
      },
      descripcion: { 
        type: 'string',
        description: 'Descripción de la actividad'
      },
      tipo: { 
        type: 'string', 
        enum: ['pregunta', 'juego'],
        description: 'Tipo de actividad'
      },
      orden: { 
        type: 'integer', 
        minimum: 1,
        description: 'Orden de la actividad en la tarea'
      }
    }
  },
  response: {
    201: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        tarea_id: { type: 'integer' },
        nombre: { type: 'string' },
        descripcion: { type: 'string' },
        tipo: { type: 'string' },
        orden: { type: 'integer' },
        activo: { type: 'boolean' },
        fecha_creacion: { type: 'string', format: 'date-time' }
      }
    }
  }
};

const updateActivity = {
  summary: 'Actualizar actividad',
  description: 'Actualizar una actividad existente (solo docentes)',
  tags: ['Actividades'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { 
        type: 'integer',
        description: 'ID de la actividad'
      }
    }
  },
  body: {
    type: 'object',
    properties: {
      nombre: { 
        type: 'string', 
        maxLength: 100,
        description: 'Nombre de la actividad'
      },
      descripcion: { 
        type: 'string',
        description: 'Descripción de la actividad'
      },
      orden: { 
        type: 'integer', 
        minimum: 1,
        description: 'Orden de la actividad en la tarea'
      },
      activo: { 
        type: 'boolean',
        description: 'Si la actividad está activa'
      }
    }
  },
  response: {
    200: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        tarea_id: { type: 'integer' },
        nombre: { type: 'string' },
        descripcion: { type: 'string' },
        tipo: { type: 'string' },
        orden: { type: 'integer' },
        activo: { type: 'boolean' },
        fecha_creacion: { type: 'string', format: 'date-time' }
      }
    }
  }
};

module.exports = {
  getTaskActivities,
  getActivity,
  getActivityQuestions,
  completeActivity,
  submitAnswers,
  getActivityProgress,
  createActivity,
  updateActivity
};