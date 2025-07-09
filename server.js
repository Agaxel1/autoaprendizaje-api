require('dotenv').config();

const buildApp = require('./src/app'); // Importa la función que construye la app

const start = async () => {
  try {
    const app = await buildApp(); // Espera a que la app se construya con plugins y rutas

    const port = process.env.PORT || 3000;
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });

    console.log(`🚀 Servidor corriendo en http://${host}:${port}`);
    console.log(`📚 Documentación en http://${host}:${port}/docs`);

    // Graceful shutdown (opcionalmente aquí)
    const signals = ['SIGINT', 'SIGTERM'];
    signals.forEach((signal) => {
      process.on(signal, async () => {
        console.log(`\n🛑 Recibida señal ${signal}, cerrando servidor...`);
        try {
          await app.close();
          console.log('✅ Servidor cerrado correctamente');
          process.exit(0);
        } catch (err) {
          console.error('❌ Error al cerrar servidor:', err);
          process.exit(1);
        }
      });
    });

  } catch (err) {
    console.error('Error iniciando el servidor:', err);
    process.exit(1);
  }
};

start();
