export default () => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error(
      'JWT_SECRET env var is missing or too short (minimum 32 characters). ' +
        'Set it in your .env file before starting the server.',
    );
  }

  return {
    server: {
      host: process.env.HOST || '127.0.0.1',
      port: parseInt(process.env.PORT || '3001', 10),
    },
    database: {
      url: process.env.DATABASE_URL,
    },
    jwt: {
      secretCode: jwtSecret,
      jwtTime: process.env.JWT_EXPIRES || '24h',
    },
  };
};
