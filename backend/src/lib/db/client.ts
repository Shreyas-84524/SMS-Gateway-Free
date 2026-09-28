import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

class DatabaseService {
  private pool: Pool | null = null;
  private isConnected = false;

  private getPool(): Pool {
    if (!this.pool) {
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) {
        throw new Error('DATABASE_URL environment variable is not configured');
      }

      this.pool = new Pool({
        connectionString,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
          ? false
          : { rejectUnauthorized: false },
      });

      this.pool.on('error', (err) => {
        console.error('Unexpected PostgreSQL Pool Error:', err);
      });
    }
    return this.pool;
  }

  public async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = []
  ): Promise<QueryResult<T>> {
    const pool = this.getPool();
    const start = Date.now();
    try {
      const res = await pool.query<T>(text, params);
      return res;
    } catch (error) {
      console.error('Database query error:', { text, error });
      throw error;
    }
  }

  public async getClient(): Promise<PoolClient> {
    const pool = this.getPool();
    return await pool.connect();
  }

  public async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      if (!process.env.DATABASE_URL) {
        return { healthy: false, error: 'DATABASE_URL_NOT_SET' };
      }
      const res = await this.query('SELECT 1 as health');
      return { healthy: res.rows.length > 0 };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { healthy: false, error: msg };
    }
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

export const db = new DatabaseService();
