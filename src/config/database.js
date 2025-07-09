// src/config/database.js
const config = {
  development: {
    connectionString: process.env.DATABASE_URL,
    ssl: false
  },
  test: {
    connectionString: process.env.TEST_DATABASE_URL,
    ssl: false
  },
  production: {
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  }
};

const environment = process.env.NODE_ENV || 'development';

module.exports = {
  ...config[environment],
  // Pool configuration
  max: parseInt(process.env.DB_POOL_MAX) || 20,
  min: parseInt(process.env.DB_POOL_MIN) || 5,
  acquire: parseInt(process.env.DB_POOL_ACQUIRE) || 60000,
  idle: parseInt(process.env.DB_POOL_IDLE) || 10000
};