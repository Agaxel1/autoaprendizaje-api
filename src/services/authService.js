// src/services/authService.js 
const fetch = require('node-fetch');

class AuthService {
  static async login(fastify, { email, password }) {
    try {
      // Para pruebas: simular que siempre da éxito con usuario falso
      const data = {
        success: true,
        user: {
          email,
          cedula: Math.floor(1000000000 + Math.random() * 9000000000).toString(),
          nombres: 'Axel Gabriel',
          apellidos: 'Menendez Villamar'
        }
      };


      // Código real para llamar API externa:
      // const response = await fetch('https://university.edu/api/auth', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ email, password })
      // });

      // if (!response.ok) {
      //   throw new Error('Error comunicándose con API externa');
      // }

      // const data = await response.json();

      // if (!data.success) {
      //   const error = new Error('Credenciales inválidas según API externa');
      //   error.code = 'INVALID_CREDENTIALS';
      //   throw error;
      // }

      const externalUser = data.user;
      console.log('👤 Usuario externo simulado:', externalUser);

      // Verificar si existe
      const userQuery = `
        SELECT u.*, array_agg(ur.rol) as roles
        FROM usuarios u
        LEFT JOIN usuario_roles ur ON u.id = ur.usuario_id
        WHERE u.email = $1 OR u.codigo_institucional = $2
        GROUP BY u.id
        LIMIT 1
      `;
      const result = await fastify.pg.query(userQuery, [externalUser.email, externalUser.cedula]);
      let usuario;

      if (result.rows.length === 0) {
        console.log('👤 Usuario no existe, creando nuevo...');
        const insertUserQuery = `
          INSERT INTO usuarios (codigo_institucional, email, nombres, apellidos, activo)
          VALUES ($1, $2, $3, $4, true)
          RETURNING *
        `;
        const insertResult = await fastify.pg.query(insertUserQuery, [
          externalUser.cedula,
          externalUser.email,
          externalUser.nombres,
          externalUser.apellidos
        ]);
        usuario = insertResult.rows[0];

        await fastify.pg.query(
          'INSERT INTO usuario_roles (usuario_id, rol) VALUES ($1, $2)',
          [usuario.id, 'estudiante']
        );

        usuario.roles = ['estudiante'];
      } else {
        console.log('👤 Usuario existe, actualizando...');
        usuario = result.rows[0];
        if (!usuario.activo) {
          await fastify.pg.query(
            'UPDATE usuarios SET activo = true, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = $1',
            [usuario.id]
          );
        }
        // Validar y asignar roles si faltan
        if (!usuario.roles || usuario.roles.length === 0 || usuario.roles[0] === null) {
          await fastify.pg.query(
            'INSERT INTO usuario_roles (usuario_id, rol) VALUES ($1, $2)',
            [usuario.id, 'estudiante']
          );
          usuario.roles = ['estudiante'];
        } else if (typeof usuario.roles === 'string') {
          usuario.roles = usuario.roles.replace(/[{}]/g, '').split(',').filter(Boolean);
        }
      }

      // Crear payload para los tokens
      const tokenPayload = {
        usuario_id: usuario.id,
        email: usuario.email,
        roles: usuario.roles
      };
      console.log('🔑 Creando tokens para payload:', tokenPayload);

      // Crear ambos tokens usando el helper
      const { accessToken, refreshToken, tokenDurationMs, refreshDurationMs } = fastify.createTokens(tokenPayload);
      console.log('✅ Tokens creados exitosamente');

      await fastify.pg.query(
        'UPDATE usuarios SET fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = $1',
        [usuario.id]
      );

      const response = {
        token: accessToken,        // Access token
        refreshToken: refreshToken, // Refresh token
        tokenDurationMs: tokenDurationMs, // Duración del token en millisegundos
        refreshDurationMs: refreshDurationMs, // Duración del refresh en millisegundos
        usuario: {
          id: usuario.id,
          email: usuario.email,
          nombres: usuario.nombres,
          apellidos: usuario.apellidos,
          codigo_institucional: usuario.codigo_institucional,
          roles: usuario.roles
        }
      };
      
      console.log('📦 Respuesta de login preparada:', { 
        ...response, 
        token: 'HIDDEN', 
        refreshToken: 'HIDDEN',
        tokenDurationMs: response.tokenDurationMs,
        refreshDurationMs: response.refreshDurationMs
      });
      
      return response;

    } catch (error) {
      console.error('🔥 Error detallado en login:', error);
      throw error;
    }
  }
}

module.exports = AuthService;