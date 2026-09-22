function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default () => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error(
      'JWT_SECRET env var is missing or too short (minimum 32 characters). ' +
        'Set it in your .env file before starting the server.',
    );
  }

  // Redis is opt-in. Previously `redis.host` defaulted to 'localhost', so the
  // bootstrap always tried to connect and crashed wherever Redis was absent.
  const redisConfigured = Boolean(
    process.env.REDIS_URL ?? process.env.REDIS_HOST,
  );
  const redisEnabled = process.env.REDIS_ENABLED
    ? process.env.REDIS_ENABLED.toLowerCase() === 'true'
    : redisConfigured;

  return {
    server: {
      host: process.env.HOST || '127.0.0.1',
      port: parseInt(process.env.PORT || '3001', 10),
    },
    database: {
      url: process.env.DATABASE_URL,
    },
    redis: {
      enabled: redisEnabled,
      url: process.env.REDIS_URL || null,
      host: process.env.REDIS_HOST || 'localhost',
      port: toInt(process.env.REDIS_PORT, 6379),
      password: process.env.REDIS_PASSWORD || null,
      db: toInt(process.env.REDIS_DB, 0),
    },
    scorm: {
      // TTL for packages uploaded to the /scorm/upload preview feature.
      uploadTtlHours: toInt(process.env.SCORM_UPLOAD_TTL_HOURS, 24),
      // Sweep cadence; 0 disables the background job.
      cleanupIntervalMinutes: toInt(
        process.env.SCORM_CLEANUP_INTERVAL_MINUTES,
        60,
      ),
    },
    jwt: {
      secretCode: jwtSecret,
      jwtTime: process.env.JWT_EXPIRES || '24h',
    },
    ai: {
      groqApiKey: process.env.GROQ_API_KEY,
      pexelsApiKey: process.env.PEXELS_API_KEY,
      provider: process.env.AI_PROVIDER ?? 'groq',
      model: process.env.AI_MODEL ?? 'openai/gpt-oss-20b',
    },
  };
};
