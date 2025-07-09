// src/config/swagger.js

module.exports = {
  swagger: {
    info: {
      title: 'API Plataforma Educativa',
      description: 'API REST para Sistema de Suficiencia Académica',
      version: '1.0.0',
      contact: {
        name: 'Equipo de Desarrollo',
        email: 'dev@plataforma-educativa.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    host: process.env.NODE_ENV === 'production' 
      ? 'api.plataforma-educativa.com' 
      : `localhost:${process.env.PORT || 3000}`,
    schemes: process.env.NODE_ENV === 'production' ? ['https'] : ['http'],
    consumes: ['application/json'],
    produces: ['application/json'],
    securityDefinitions: {
      bearerAuth: {
        type: 'apiKey',
        name: 'Authorization',
        in: 'header',
        description: 'Token JWT en formato: Bearer {token}'
      }
    },
    tags: [
      {
        name: 'Autenticación',
        description: 'Endpoints para autenticación y autorización'
      },
      {
        name: 'Usuarios',
        description: 'Gestión de perfiles y datos de usuarios'
      },
      {
        name: 'Cursos',
        description: 'Gestión de cursos y contenido académico'
      },
      {
        name: 'Niveles',
        description: 'Gestión de niveles dentro de los cursos'
      },
      {
        name: 'Actividades',
        description: 'Gestión de actividades y progreso'
      },
      {
        name: 'Exámenes',
        description: 'Gestión de exámenes y evaluaciones'
      },
      {
        name: 'Administración',
        description: 'Endpoints administrativos y configuración'
      }
    ],
    definitions: {
      Error: {
        type: 'object',
        required: ['error', 'code'],
        properties: {
          error: {
            type: 'string',
            description: 'Mensaje de error'
          },
          code: {
            type: 'string',
            description: 'Código de error'
          },
          details: {
            type: 'object',
            description: 'Detalles adicionales del error'
          }
        }
      },
      Usuario: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          codigo_institucional: { type: 'string' },
          email: { type: 'string' },
          nombres: { type: 'string' },
          apellidos: { type: 'string' },
          activo: { type: 'boolean' },
          fecha_creacion: { type: 'string', format: 'date-time' },
          fecha_actualizacion: { type: 'string', format: 'date-time' }
        }
      },
      Curso: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          codigo_curso: { type: 'string' },
          nombre: { type: 'string' },
          descripcion: { type: 'string' },
          porcentaje_minimo_examen: { type: 'number' },
          activo: { type: 'boolean' },
          fecha_creacion: { type: 'string', format: 'date-time' }
        }
      },
      Nivel: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          curso_id: { type: 'integer' },
          nombre: { type: 'string' },
          descripcion: { type: 'string' },
          orden: { type: 'integer' },
          activo: { type: 'boolean' }
        }
      },
      Actividad: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          nombre: { type: 'string' },
          descripcion: { type: 'string' },
          tipo: { type: 'string', enum: ['pregunta', 'juego'] },
          orden: { type: 'integer' },
          completado: { type: 'boolean' },
          desbloqueado: { type: 'boolean' },
          puntuacion: { type: 'number' }
        }
      },
      Progreso: {
        type: 'object',
        properties: {
          porcentaje_completado: { type: 'number' },
          actividades_completadas: { type: 'integer' },
          total_actividades: { type: 'integer' },
          fecha_completado: { type: 'string', format: 'date-time' }
        }
      }
    }
  },
  exposeRoute: true
};