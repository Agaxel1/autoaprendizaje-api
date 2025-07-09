require('dotenv').config(); // Asegúrate de tener .env con JWT_SECRET

const jwt = require('jsonwebtoken');

// 1. Usamos la misma clave del entorno
const secret = process.env.JWT_SECRET;

// 2. Simulamos los datos del usuario
const payload = {
  usuario_id: 27,
  email: 'asasa123@utm.edu.ec',
  roles: ['estudiante']
};

// 3. Generamos el token
const token = jwt.sign(payload, secret, { expiresIn: '1h' });

console.log('✅ Token generado:');
console.log(token);

// 4. Verificamos el token
try {
  const decoded = jwt.verify(token, secret);
  console.log('\n✅ Token verificado correctamente:');
  console.log(decoded);
} catch (err) {
  console.error('\n❌ Error verificando token:');
  console.error(err.message);
}
