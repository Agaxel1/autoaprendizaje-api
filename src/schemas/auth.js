// src/schemas/auth.js

const login = {
  summary: 'Iniciar sesión',
  description: 'Autenticar usuario y generar token JWT',
  tags: ['Autenticación'],
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: {
        type: 'string',
        format: 'email',
        description: 'Email del usuario'
      },
      password: {
        type: 'string',
        minLength: 6,
        description: 'Contraseña del usuario'
      }
    }
  },
  response: {
    200: {
      type: 'object',
      properties: {
        token: { type: 'string' },
        refreshToken: { type: 'string' },
        tokenDurationMs: { type: 'number' },     
        refreshDurationMs: { type: 'number' },
        usuario: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            email: { type: 'string' },
            nombres: { type: 'string' },
            apellidos: { type: 'string' },
            codigo_institucional: { type: 'string' },
            roles: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      }
    },
    401: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        code: { type: 'string' }
      }
    }
  }
};

const register = {
  summary: 'Registrar nuevo usuario',
  description: 'Crear cuenta de usuario en el sistema',
  tags: ['Autenticación'],
  body: {
    type: 'object',
    required: ['email', 'nombres', 'apellidos'],
    properties: {
      codigo_institucional: {
        type: 'string',
        maxLength: 20,
        description: 'Código institucional del usuario'
      },
      email: {
        type: 'string',
        format: 'email',
        maxLength: 100,
        description: 'Email del usuario'
      },
      nombres: {
        type: 'string',
        maxLength: 100,
        description: 'Nombres del usuario'
      },
      apellidos: {
        type: 'string',
        maxLength: 100,
        description: 'Apellidos del usuario'
      },
      password: {
        type: 'string',
        minLength: 8,
        description: 'Contraseña del usuario'
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
            email: { type: 'string' },
            nombres: { type: 'string' },
            apellidos: { type: 'string' },
            codigo_institucional: { type: 'string' },
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

const refresh = {
  summary: 'Renovar token JWT',
  description: 'Generar un nuevo token JWT para el usuario autenticado',
  tags: ['Autenticación'],
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      type: 'object',
      properties: {
        token: { type: 'string' },
        message: { type: 'string' }
      }
    },
    401: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        code: { type: 'string' }
      }
    }
  }
};

const logout = {
  summary: 'Cerrar sesión',
  description: 'Cerrar la sesión del usuario actual',
  tags: ['Autenticación'],
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      type: 'object',
      properties: {
        message: { type: 'string' }
      }
    }
  }
};

const verify = {
  summary: 'Verificar token',
  description: 'Verificar la validez del token JWT y obtener información del usuario',
  tags: ['Autenticación'],
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      type: 'object',
      properties: {
        valid: { type: 'boolean' },
        usuario: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            email: { type: 'string' },
            nombres: { type: 'string' },
            apellidos: { type: 'string' },
            roles: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      }
    },
    401: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        code: { type: 'string' }
      }
    }
  }
};

const changePassword = {
  summary: 'Cambiar contraseña',
  description: 'Cambiar la contraseña del usuario autenticado',
  tags: ['Autenticación'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['currentPassword', 'newPassword'],
    properties: {
      currentPassword: {
        type: 'string',
        description: 'Contraseña actual'
      },
      newPassword: {
        type: 'string',
        minLength: 8,
        description: 'Nueva contraseña'
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
    400: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        code: { type: 'string' }
      }
    }
  }
};

const requestPasswordReset = {
  summary: 'Solicitar reset de contraseña',
  description: 'Solicitar un token para resetear la contraseña',
  tags: ['Autenticación'],
  body: {
    type: 'object',
    required: ['email'],
    properties: {
      email: {
        type: 'string',
        format: 'email',
        description: 'Email del usuario'
      }
    }
  },
  response: {
    200: {
      type: 'object',
      properties: {
        message: { type: 'string' }
      }
    }
  }
};

const resetPassword = {
  summary: 'Resetear contraseña',
  description: 'Resetear la contraseña usando un token válido',
  tags: ['Autenticación'],
  body: {
    type: 'object',
    required: ['token', 'newPassword'],
    properties: {
      token: {
        type: 'string',
        description: 'Token de reset de contraseña'
      },
      newPassword: {
        type: 'string',
        minLength: 8,
        description: 'Nueva contraseña'
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
  login,
  register,
  refresh,
  logout,
  verify,
  changePassword,
  requestPasswordReset,
  resetPassword
};