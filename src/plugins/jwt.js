const fp = require('fastify-plugin');
const env = require('../config/environment');

// Función para convertir tiempo a milisegundos
function parseTimeToMs(timeString) {
  if (typeof timeString === 'number') return timeString;
  if (!timeString) return 15000; // 15s por defecto
  
  const timeStr = timeString.toString().toLowerCase();
  const value = parseInt(timeStr);
  
  if (timeStr.includes('ms')) return value;
  if (timeStr.includes('s')) return value * 1000;
  if (timeStr.includes('m')) return value * 60 * 1000;
  if (timeStr.includes('h')) return value * 60 * 60 * 1000;
  if (timeStr.includes('d')) return value * 24 * 60 * 60 * 1000;
  
  // Si no tiene unidad, asumimos segundos
  return value * 1000;
}

async function jwtPlugin(fastify, opts) {
  await fastify.register(require('@fastify/jwt'), {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRY}
  });

  // Método helper para crear ambos tokens
  fastify.decorate('createTokens', function(payload) {
    const accessToken = this.jwt.sign(payload);
    
    // Crear refresh token usando un secret diferente manualmente
    const jwt = require('jsonwebtoken');
    const refreshSecret = env.JWT_REFRESH_SECRET || env.JWT_SECRET + '_refresh';
    const refreshToken = jwt.sign(payload, refreshSecret, { 
      expiresIn: env.JWT_REFRESH_EXPIRY 
    });
    
    // Calcular duración en milisegundos
    const tokenDurationMs = parseTimeToMs(env.JWT_EXPIRY);
    const refreshDurationMs = parseTimeToMs(env.JWT_REFRESH_EXPIRY);
    
    return { 
      accessToken, 
      refreshToken,
      tokenDurationMs,     
      refreshDurationMs     
    };
  });

  // Método helper para verificar refresh token
  fastify.decorate('verifyRefreshToken', function(token) {
    const jwt = require('jsonwebtoken');
    const refreshSecret = env.JWT_REFRESH_SECRET || env.JWT_SECRET + '_refresh';
    return jwt.verify(token, refreshSecret);
  });
  
  fastify.log.info('✅ Plugin JWT registrado correctamente con refresh tokens');
}

module.exports = fp(jwtPlugin);