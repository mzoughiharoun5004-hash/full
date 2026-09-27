import { DataSource } from 'typeorm';
import { databaseOptions } from './config/db.config';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not configured');
}

export default new DataSource(
  // The CLI explicitly controls when migrations run; only Nest production
  // startup enables automatic migration execution.
  databaseOptions(databaseUrl, false),
);
