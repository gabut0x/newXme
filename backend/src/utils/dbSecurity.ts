import { logger } from './logger.js';

/**
 * Database security utilities to prevent SQL injection and ensure safe queries
 */
export class DatabaseSecurity {
  
  /**
   * Validate and sanitize SQL parameters
   */
  static validateSqlParams(params: any[]): any[] {
    return params.map(param => {
      if (typeof param === 'string') {
        // Remove potential SQL injection characters
        return param.replace(/['"\\;]/g, '');
      }
      if (typeof param === 'number') {
        // Ensure it's a safe number
        return Number.isFinite(param) ? param : 0;
      }
      return param;
    });
  }

  /**
   * Validate table and column names to prevent injection
   */
  static validateIdentifier(identifier: string): boolean {
    // Only allow alphanumeric characters, underscores, and hyphens
    return /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(identifier);
  }

  /**
   * Escape SQL identifiers (table names, column names)
   */
  static escapeIdentifier(identifier: string): string {
    if (!this.validateIdentifier(identifier)) {
      throw new Error(`Invalid SQL identifier: ${identifier}`);
    }
    return `"${identifier}"`;
  }

  /**
   * Build safe WHERE clause with parameterized queries
   */
  static buildWhereClause(conditions: Record<string, any>): { clause: string; params: any[] } {
    const clauses: string[] = [];
    const params: any[] = [];

    for (const [column, value] of Object.entries(conditions)) {
      if (!this.validateIdentifier(column)) {
        throw new Error(`Invalid column name: ${column}`);
      }
      
      if (value === null || value === undefined) {
        clauses.push(`${this.escapeIdentifier(column)} IS NULL`);
      } else if (Array.isArray(value)) {
        const placeholders = value.map(() => '?').join(', ');
        clauses.push(`${this.escapeIdentifier(column)} IN (${placeholders})`);
        params.push(...value);
      } else {
        clauses.push(`${this.escapeIdentifier(column)} = ?`);
        params.push(value);
      }
    }

    return {
      clause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
      params
    };
  }

  /**
   * Validate ORDER BY clause to prevent injection
   */
  static validateOrderBy(orderBy?: string): string {
    const trimmed = (orderBy || '').trim();
    if (!trimmed) {
      throw new Error('ORDER BY clause cannot be empty');
    }
    const parts = trimmed.split(/\s+/);
    const column: string = parts[0] ?? '';
    const direction = parts[1]?.toUpperCase();

    if (!this.validateIdentifier(column)) {
      throw new Error(`Invalid column name in ORDER BY: ${column}`);
    }

    if (direction && !['ASC', 'DESC'].includes(direction)) {
      throw new Error(`Invalid sort direction: ${direction}`);
    }

    return `${this.escapeIdentifier(column)}${direction ? ` ${direction}` : ''}`;
  }

  /**
   * Validate LIMIT clause
   */
  static validateLimit(limit: number, offset: number = 0): { limit: number; offset: number } {
    const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit))); // Max 1000 records
    const safeOffset = Math.max(0, Math.floor(offset));
    
    return { limit: safeLimit, offset: safeOffset };
  }

  /**
   * Log database operations for security monitoring
   */
  static logDatabaseOperation(operation: string, table: string, userId?: number, conditions?: any): void {
    logger.info('Database operation:', {
      operation,
      table,
      userId,
      conditions,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Validate user ownership of resource (IDOR protection)
   */
  static async validateResourceOwnership(
    db: any,
    table: string,
    resourceId: number,
    userId: number,
    userIdColumn: string = 'user_id'
  ): Promise<boolean> {
    try {
      if (!this.validateIdentifier(table) || !this.validateIdentifier(userIdColumn)) {
        throw new Error('Invalid table or column name');
      }

      const query = `SELECT 1 FROM ${this.escapeIdentifier(table)} WHERE id = ? AND ${this.escapeIdentifier(userIdColumn)} = ?`;
      const result = await db.get(query, [resourceId, userId]);
      
      return !!result;
    } catch (error) {
      logger.error('Resource ownership validation failed:', error);
      return false;
    }
  }

  /**
   * Safe pagination query builder
   */
  static buildPaginationQuery(
    baseQuery: string,
    orderBy: string = 'id',
    limit: number = 20,
    offset: number = 0
  ): { query: string; params: any[] } {
    const safeOrderBy = this.validateOrderBy(orderBy);
    const { limit: safeLimit, offset: safeOffset } = this.validateLimit(limit, offset);
    
    const query = `${baseQuery} ORDER BY ${safeOrderBy} LIMIT ? OFFSET ?`;
    const params = [safeLimit, safeOffset];
    
    return { query, params };
  }
}

/**
 * Database query builder with built-in security
 */
export class SecureQueryBuilder {
  private table: string;
  private selectFields: string[] = ['*'];
  private whereConditions: Record<string, any> = {};
  private orderByClause: string = 'id';
  private limitValue: number = 100;
  private offsetValue: number = 0;

  constructor(table: string) {
    if (!DatabaseSecurity.validateIdentifier(table)) {
      throw new Error(`Invalid table name: ${table}`);
    }
    this.table = table;
  }

  select(fields: string[]): this {
    this.selectFields = fields.filter(field => {
      if (field === '*') return true;
      return DatabaseSecurity.validateIdentifier(field);
    });
    return this;
  }

  where(conditions: Record<string, any>): this {
    this.whereConditions = { ...this.whereConditions, ...conditions };
    return this;
  }

  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this.orderByClause = `${column} ${direction}`;
    return this;
  }

  limit(limit: number): this {
    this.limitValue = limit;
    return this;
  }

  offset(offset: number): this {
    this.offsetValue = offset;
    return this;
  }

  build(): { query: string; params: any[] } {
    const safeTable = DatabaseSecurity.escapeIdentifier(this.table);
    const safeFields = this.selectFields.map(field => 
      field === '*' ? '*' : DatabaseSecurity.escapeIdentifier(field)
    ).join(', ');

    let query = `SELECT ${safeFields} FROM ${safeTable}`;
    let params: any[] = [];

    // Add WHERE clause
    if (Object.keys(this.whereConditions).length > 0) {
      const { clause, params: whereParams } = DatabaseSecurity.buildWhereClause(this.whereConditions);
      query += ` ${clause}`;
      params.push(...whereParams);
    }

    // Add ORDER BY
    const safeOrderBy = DatabaseSecurity.validateOrderBy(this.orderByClause);
    query += ` ORDER BY ${safeOrderBy}`;

    // Add LIMIT and OFFSET
    const { limit, offset } = DatabaseSecurity.validateLimit(this.limitValue, this.offsetValue);
    query += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    return { query, params };
  }
}