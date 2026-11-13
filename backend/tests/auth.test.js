process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-for-corptalk-authentication';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-corptalk-authentication';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
jest.setTimeout(30000);

jest.mock('../src/services/emailService', () => ({
  sendOtpEmail: jest.fn().mockResolvedValue(undefined),
}));

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const createApp = require('../src/app');

const MONGODB_MEMORY_SERVER_VERSION = '7.0.14';
const User = require('../src/models/user');
const Otp = require('../src/models/otp');
const RefreshSession = require('../src/models/refreshSession');
const { sendOtpEmail } = require('../src/services/emailService');

const app = createApp();
let mongo;

const latestCode = () => sendOtpEmail.mock.calls[sendOtpEmail.mock.calls.length - 1][0].code;
const sessionCookie = (response) =>
  response.headers['set-cookie'].find((cookie) => cookie.startsWith('refreshToken=')).split(';')[0];

const registerAndVerify = async (email) => {
  const signup = await request(app).post('/api/v1/auth/signup').send({
    name: 'Test User',
    email,
    password: 'strong-test-password',
  });
  expect(signup.status).toBe(201);
  const code = latestCode();
  const verification = await request(app).post('/api/v1/auth/verify-otp').send({ email, code });
  expect(verification.status).toBe(200);
};

beforeAll(async () => {
  console.info('auth-test: starting MongoMemoryServer');
  mongo = await MongoMemoryServer.create({
    binary: { version: MONGODB_MEMORY_SERVER_VERSION },
  });
  console.info('auth-test: MongoMemoryServer started');
  mongoose.connection.on('error', (error) =>
    console.error('auth-test: mongo connection error', error),
  );
  await mongoose.connect(mongo.getUri(), { serverSelectionTimeoutMS: 5000 });
  console.info('auth-test: Mongoose connected');
  await Promise.all([User.init(), Otp.init(), RefreshSession.init()]);
  console.info('auth-test: model indexes initialized');
});

afterEach(async () => {
  await Promise.all([User.deleteMany({}), Otp.deleteMany({}), RefreshSession.deleteMany({})]);
  sendOtpEmail.mockClear();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('authentication API', () => {
  test('verifies email, signs in, returns profile and rotates refresh sessions', async () => {
    const email = 'first.user@example.com';
    await registerAndVerify(email);

    const login = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'strong-test-password',
    });
    expect(login.status).toBe(200);
    expect(login.body.data).toHaveProperty('accessToken');
    expect(login.body.data).not.toHaveProperty('refreshToken');
    expect(login.headers['set-cookie'][0]).toContain('HttpOnly');
    const oldCookie = sessionCookie(login);

    const profile = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);
    expect(profile.status).toBe(200);
    expect(profile.body.data.user).toMatchObject({ email, name: 'Test User', isVerified: true });

    const refreshed = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie);
    expect(refreshed.status).toBe(200);
    const newCookie = sessionCookie(refreshed);
    expect(newCookie).not.toBe(oldCookie);

    const replay = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie);
    expect(replay.status).toBe(401);
    const revokedFamily = await request(app).post('/api/v1/auth/refresh').set('Cookie', newCookie);
    expect(revokedFamily.status).toBe(401);
  });

  test('locks an OTP after three incorrect attempts', async () => {
    const email = 'locked.user@example.com';
    await request(app).post('/api/v1/auth/signup').send({
      name: 'Locked User',
      email,
      password: 'strong-test-password',
    });
    const code = latestCode();
    const wrongCode = code === '000000' ? '000001' : '000000';

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ email, code: wrongCode });
      expect(response.status).toBe(400);
    }

    const lockedAttempt = await request(app).post('/api/v1/auth/verify-otp').send({ email, code });
    expect(lockedAttempt.status).toBe(400);
    const otp = await Otp.findOne({ purpose: 'email_verification' });
    expect(otp.attempts).toBe(3);
  });

  test('resets the password and invalidates the previous credentials', async () => {
    const email = 'reset.user@example.com';
    await registerAndVerify(email);
    const resetRequest = await request(app).post('/api/v1/auth/forgot-password').send({ email });
    expect(resetRequest.status).toBe(202);

    const reset = await request(app).post('/api/v1/auth/reset-password').send({
      email,
      code: latestCode(),
      password: 'new-strong-password',
    });
    expect(reset.status).toBe(200);

    const oldLogin = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'strong-test-password',
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'new-strong-password',
    });
    expect(newLogin.status).toBe(200);
  });
});
