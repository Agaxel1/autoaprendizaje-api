// src/plugins/db.js
const fp = require('fastify-plugin');
const dbConfig = require('../config/database');

async function dbConnector(fastify, options) {
  try {
    await fastify.register(require('@fastify/postgres'), dbConfig);
    
    // Test connection
    const client = await fastify.pg.connect();
    await client.query('SELECT NOW()');
    client.release();
    
    fastify.log.info('✅ Conexión a PostgreSQL establecida correctamente');
    
    // Add utility methods
    fastify.decorate('db', {
      // Transaction helper
      withTransaction: async (callback) => {
        const client = await fastify.pg.connect();
        try {
          await client.query('BEGIN');
          const result = await callback(client);
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
      
      // Pagination helper
      paginate: (query, params, page = 1, limit = 20) => {
        const offset = (page - 1) * limit;
        const paginatedQuery = `${query} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        return fastify.pg.query(paginatedQuery, [...params, limit, offset]);
      },
      
      // Count helper for pagination
      count: async (table, whereClause = '', params = []) => {
        const query = `SELECT COUNT(*) as total FROM ${table} ${whereClause}`;
        const result = await fastify.pg.query(query, params);
        return parseInt(result.rows[0].total);
      }
    });
    
  } catch (error) {
    fastify.log.error('❌ Error conectando a PostgreSQL:', error);
    throw error;
  }
}

module.exports = fp(dbConnector);