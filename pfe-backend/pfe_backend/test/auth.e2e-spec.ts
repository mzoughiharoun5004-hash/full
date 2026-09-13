import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

// Credentials come from SeederService (src/seeder/seeder.service.ts), which
// upserts this admin account on every application bootstrap.
const SEEDED_ADMIN = { email: 'admin@example.com', password: 'Admin@123' };

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/login — valid credentials return access_token + userInfo', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send(SEEDED_ADMIN)
      .expect(200);

    expect(res.body).toHaveProperty('access_token');
    expect(typeof res.body.access_token).toBe('string');
    expect(res.body).toHaveProperty('userInfo');
    expect(res.body.userInfo).toMatchObject({ email: SEEDED_ADMIN.email });
    // The safe-user projection must never leak the password hash.
    expect(res.body.userInfo).not.toHaveProperty('password');
  });

  it('POST /auth/login — wrong password returns 401', () =>
    request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: SEEDED_ADMIN.email, password: 'wrongpassword' })
      .expect(401));

  it('POST /auth/login — unknown email returns 401', () =>
    request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever' })
      .expect(401));

  it('POST /auth/login — malformed email is rejected by DTO validation', () =>
    request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'not-an-email', password: 'whatever' })
      .expect(400));

  it('GET /users/me — requires an Authorization header', () =>
    request(app.getHttpServer()).get('/users/me').expect(401));

  it('GET /users/me — rejects a malformed Authorization header', () =>
    request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', 'not-a-bearer-token')
      .expect(401));

  it('GET /users/me — returns the current user for a valid token', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send(SEEDED_ADMIN)
      .expect(200);

    const meRes = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${loginRes.body.access_token}`)
      .expect(200);

    expect(meRes.body).toMatchObject({ email: SEEDED_ADMIN.email });
  });
});
