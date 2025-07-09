// src/routes/auth/index.js
const authSchemas = require('../../schemas/auth');
const authService = require('../../services/authService');

async function authRoutes(fastify, options) {


  // POST /api/auth/login
  fastify.post('/login', {
    schema: authSchemas.login
  }, async (request, reply) => {
    try {
      const { email, password } = request.body;


      // Validaciones básicas
      if (!email || !password) {
        return reply.code(400).send({
          error: 'Email y contraseña son requeridos',
          code: 'MISSING_FIELDS'
        });
      }

      // Llamar al servicio de autenticación
      const result = await authService.login(fastify, { email, password });

      fastify.log.info('✅ Login exitoso, enviando respuesta');

      return reply.code(200).send(result);

    } catch (error) {
      fastify.log.error('❌ Error en endpoint de login:', error);

      // Manejar errores específicos
      if (error.code === 'INVALID_CREDENTIALS') {
        return reply.code(401).send({
          error: error.message || 'Credenciales inválidas',
          code: error.code
        });
      }

      if (error.code === 'LOGIN_ERROR') {
        return reply.code(500).send({
          error: error.message || 'Error interno del servidor',
          code: error.code
        });
      }

      // Error genérico para cualquier otro caso
      return reply.code(500).send({
        error: 'Error interno del servidor',
        code: 'INTERNAL_ERROR'
      });
    }
  });

  // POST /api/auth/register
  fastify.post('/register', {
    schema: authSchemas.register
  }, async (request, reply) => {
    try {
      const result = await authService.register(fastify, request.body);
      return reply.code(201).send(result);
    } catch (error) {
      fastify.log.error('Error en registro:', error);

      if (error.code === '23505') {
        return reply.code(409).send({
          error: 'El email ya está registrado',
          code: 'EMAIL_EXISTS'
        });
      }

      return reply.code(500).send({
        error: 'Error al registrar usuario',
        code: 'REGISTRATION_ERROR'
      });
    }
  });

  // POST /api/auth/refresh
  fastify.post('/refresh', {
    schema: authSchemas.refresh
  }, async (request, reply) => {
    try {
      // El refresh token viene en el body, no en el header
      const { refreshToken } = request.body;

      if (!refreshToken) {
        return reply.code(400).send({
          error: 'Refresh token requerido',
          code: 'REFRESH_TOKEN_MISSING'
        });
      }

      try {
        // Verificar el refresh token usando el helper
        const decoded = fastify.verifyRefreshToken(refreshToken);

        console.log("✅ Refresh token válido, creando nuevo access token:", JSON.stringify(decoded));

        // Crear nuevo access token con la misma información
        const newAccessToken = fastify.jwt.sign({
          usuario_id: decoded.usuario_id,
          email: decoded.email,
          roles: decoded.roles
        });

        return reply.send({
          token: newAccessToken,
          // Mantener el mismo refresh token (opcional: podrías crear uno nuevo)
          refreshToken: refreshToken,
          message: 'Token renovado exitosamente'
        });

      } catch (refreshError) {
        console.log("❌ Error verificando refresh token:", refreshError.message);

        // Si el refresh token expiró o es inválido
        if (refreshError.name === 'TokenExpiredError') {
          return reply.code(401).send({
            error: 'Refresh token expirado',
            code: 'REFRESH_TOKEN_EXPIRED'
          });
        }

        return reply.code(401).send({
          error: 'Refresh token inválido',
          code: 'REFRESH_TOKEN_INVALID'
        });
      }

    } catch (error) {
      fastify.log.error('Error renovando token:', error);
      return reply.code(500).send({
        error: 'Error al renovar token',
        code: 'TOKEN_REFRESH_ERROR'
      });
    }
  });

  // POST /api/auth/logout
  fastify.post('/logout', {
    preHandler: fastify.authenticate,
    schema: authSchemas.logout
  }, async (request, reply) => {
    try {
      // En una implementación real, aquí podrías invalidar el token
      // agregándolo a una blacklist en Redis o base de datos

      return reply.send({
        message: 'Sesión cerrada exitosamente'
      });

    } catch (error) {
      fastify.log.error('Error en logout:', error);
      return reply.code(500).send({
        error: 'Error al cerrar sesión',
        code: 'LOGOUT_ERROR'
      });
    }
  });

  // GET /api/auth/verify
  fastify.get('/verify', {
    preHandler: fastify.authenticate,
    schema: authSchemas.verify
  }, async (request, reply) => {
    try {
      console.log('🔍 Iniciando verificación de token');
      console.log('👤 Usuario desde token:', request.user);

      const { usuario_id } = request.user;
      console.log('🆔 Usuario ID:', usuario_id);

      const userQuery = `
      SELECT 
        u.id, 
        u.email, 
        u.nombres, 
        u.apellidos, 
        u.codigo_institucional, 
        u.activo,
        COALESCE(array_agg(ur.rol::text) FILTER (WHERE ur.rol IS NOT NULL), ARRAY[]::text[]) as roles
      FROM usuarios u
      LEFT JOIN usuario_roles ur ON u.id = ur.usuario_id
      WHERE u.id = $1 AND u.activo = true
      GROUP BY u.id
    `;

      console.log('📊 Ejecutando query con usuario_id:', usuario_id);
      const result = await fastify.pg.query(userQuery, [usuario_id]);
      console.log('📋 Resultado de la query:', result.rows);

      if (result.rows.length === 0) {
        console.log('❌ Usuario no encontrado');
        return reply.code(404).send({
          error: 'Usuario no encontrado',
          code: 'USER_NOT_FOUND'
        });
      }

      const usuario = result.rows[0];
      console.log('👤 Datos del usuario:', usuario);

      // Procesar roles
      let roles = [];
      if (usuario.roles && Array.isArray(usuario.roles)) {
        roles = usuario.roles.filter(Boolean);
      }

      const responseData = {
        valid: true,
        usuario: {
          id: usuario.id,
          email: usuario.email,
          nombres: usuario.nombres,
          apellidos: usuario.apellidos,
          codigo_institucional: usuario.codigo_institucional,
          roles: roles.map(rol => rol)
        }
      };
      console.log("CHAO " + JSON.stringify(responseData));
      return reply.send(responseData);

    } catch (error) {
      console.error('💥 Error verificando token:', error);
      fastify.log.error('Error verificando token:', error);
      return reply.code(500).send({
        error: 'Error al verificar token',
        code: 'TOKEN_VERIFICATION_ERROR'
      });
    }
  });

  fastify.log.info('✅ Rutas de autenticación registradas');
}

module.exports = authRoutes;