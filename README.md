# API Plataforma Educativa

API REST para Sistema de Suficiencia Académica construida con Fastify y PostgreSQL.

## 🚀 Características

- **Arquitectura modular** con separación clara de responsabilidades
- **Autenticación JWT** con roles y permisos
- **Base de datos PostgreSQL** con triggers y funciones avanzadas
- **Documentación automática** con Swagger/OpenAPI
- **Rate limiting** y middleware de seguridad
- **Sistema de gamificación** con UTMCoins y rachas
- **Progreso automático** con desbloqueo de contenido
- **Docker support** para desarrollo y producción

## 📋 Requisitos

- Node.js >= 18.0.0
- PostgreSQL >= 13
- npm >= 8.0.0
- Redis (opcional, para cache)

## 🛠️ Instalación

### Desarrollo Local

1. **Clonar el repositorio**
```bash
git clone <repository-url>
cd plataforma-educativa-api
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**
```bash
cp .env.example .env
# Editar .env con tus configuraciones
```

4. **Configurar base de datos**
```bash
# Crear base de datos en PostgreSQL
createdb plataforma_educativa

# Ejecutar el esquema (usar el archivo paste.txt proporcionado)
psql -d plataforma_educativa -f schema.sql
```

5. **Iniciar servidor de desarrollo**
```bash
npm run dev
```

### Con Docker

1. **Iniciar con Docker Compose**
```bash
docker-compose up -d
```

Esto iniciará:
- API en puerto 3000
- PostgreSQL en puerto 5432
- Redis en puerto 6379
- Nginx en puerto 80

## 📁 Estructura del Proyecto

```
src/
├── config/           # Configuraciones (DB, JWT, Swagger)
├── middleware/       # Middleware personalizado
├── plugins/          # Plugins de Fastify
├── routes/           # Definición de rutas por módulo
│   ├── auth/         # Autenticación
│   ├── usuarios/     # Gestión de usuarios
│   ├── cursos/       # Gestión de cursos
│   ├── actividades/  # Actividades y progreso
│   └── examenes/     # Exámenes y evaluaciones
├── schemas/          # Esquemas de validación JSON
├── services/         # Lógica de negocio
├── utils/            # Utilidades y helpers
└── app.js           # Configuración principal de Fastify
```

## 🔗 API Endpoints

### Autenticación
- `POST /api/auth/login` - Iniciar sesión
- `POST /api/auth/register` - Registrar usuario
- `POST /api/auth/refresh` - Renovar token
- `POST /api/auth/logout` - Cerrar sesión

### Usuarios
- `GET /api/users/profile` - Obtener perfil
- `PUT /api/users/profile` - Actualizar perfil
- `GET /api/users/dashboard` - Dashboard del estudiante
- `GET /api/users/progress` - Progreso del usuario

### Cursos
- `GET /api/courses` - Listar cursos
- `POST /api/courses` - Crear curso (docentes)
- `GET /api/courses/:id` - Obtener curso
- `PUT /api/courses/:id` - Actualizar curso
- `GET /api/courses/:id/levels` - Niveles del curso

### Actividades
- `GET /api/activities/task/:taskId` - Actividades de una tarea
- `GET /api/activities/:id` - Detalles de actividad
- `POST /api/activities/:id/complete` - Completar actividad
- `GET /api/activities/:id/questions` - Preguntas de actividad

### Exámenes
- `GET /api/exams/schedules` - Horarios disponibles
- `POST /api/exams/schedule` - Agendar examen
- `GET /api/exams/results` - Resultados de exámenes

## 🔒 Sistema de Roles

### Estudiante
- Acceso a cursos inscritos
- Completar actividades y exámenes
- Ver progreso y estadísticas
- Sistema de gamificación

### Docente
- Crear y gestionar cursos
- Crear actividades y contenido
- Ver progreso de estudiantes
- Asignar calificaciones

### Administrador
- Gestión completa del sistema
- Crear horarios de examen
- Estadísticas globales
- Configuración del sistema

## 📊 Base de Datos

La base de datos utiliza un esquema avanzado con:

- **Triggers automáticos** para desbloqueo de contenido
- **Funciones PostgreSQL** para cálculos de progreso
- **Índices optimizados** para consultas frecuentes
- **Constraints** para integridad de datos
- **Tipos ENUM** para validación a nivel de BD

### Principales Tablas

- `usuarios` - Información de usuarios
- `cursos` - Cursos y contenido académico
- `niveles` - Niveles dentro de cursos
- `actividades` - Actividades y ejercicios
- `progreso_*` - Seguimiento de progreso
- `examenes_*` - Sistema de exámenes
- `estudiante_utmcoins` - Sistema de gamificación

## 🎮 Sistema de Gamificación

- **UTMCoins**: Moneda virtual por completar actividades
- **Rachas**: Días consecutivos de actividad
- **Progreso visual**: Barras de progreso y logros
- **Desbloqueo automático**: Contenido se desbloquea al completar requisitos

## 🔧 Scripts Disponibles

```bash
npm start          # Iniciar en producción
npm run dev        # Desarrollo con hot-reload
npm test           # Ejecutar tests
npm run lint       # Linter de código
npm run lint:fix   # Corregir errores de lint automáticamente
npm run docker:build # Construir imagen Docker
```

## 📚 Documentación

La documentación interactiva de la API está disponible en:
- **Desarrollo**: http://localhost:3000/docs
- **Producción**: https://tu-dominio.com/docs

## 🚀 Despliegue

### Variables de Entorno Producción

```env
NODE_ENV=production
DATABASE_URL=postgres://user:password@host:5432/db
JWT_SECRET=tu-secreto-super-seguro
ALLOWED_ORIGINS=https://tu-frontend.com
```

### Nginx

Configuración de ejemplo incluida en `nginx/nginx.conf` para:
- Proxy reverso
- SSL/TLS
- Compresión gzip
- Rate limiting

## 🧪 Testing

```bash
# Ejecutar todos los tests
npm test

# Tests con coverage
npm run test:coverage

# Tests en modo watch
npm run test:watch
```

## 🔍 Logging

El sistema utiliza Pino para logging estructurado:
- **Desarrollo**: Output pretty-printed
- **Producción**: JSON estructurado
- **Niveles**: error, warn, info, debug, trace

## 🛡️ Seguridad

- JWT con expiración configurable
- Rate limiting por IP
- Validación de entrada con esquemas JSON
- CORS configurado
- Headers de seguridad
- Sanitización de datos

## 🤝 Contribución

1. Fork el proyecto
2. Crear rama feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit cambios (`git commit -am 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Crear Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para detalles.

## 🐛 Reporte de Bugs

Para reportar bugs o solicitar funcionalidades, crear un issue en el repositorio con:
- Descripción detallada
- Pasos para reproducir
- Entorno (OS, Node.js version, etc.)
- Logs relevantes

## 📞 Soporte

Para soporte técnico contactar:
- Email: dev@plataforma-educativa.com
- Documentación: [Wiki del proyecto]
- Issues: [GitHub Issues]