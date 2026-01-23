import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, '../track_hub.db');

// Enable verbose mode for debugging
const sqlite = sqlite3.verbose();

export const db = new sqlite.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    throw err;
  }
  console.log('Connected to SQLite database at', dbPath);
});

// Promisify database operations for cleaner async/await syntax
export const runQuery = <T = any>(sql: string, params: any[] = []): Promise<T[]> => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('Query error:', err.message);
        reject(err);
      } else {
        resolve(rows as T[]);
      }
    });
  });
};

export const runQuerySingle = <T = any>(sql: string, params: any[] = []): Promise<T | undefined> => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        console.error('Query error:', err.message);
        reject(err);
      } else {
        resolve(row as T);
      }
    });
  });
};

export default db;
