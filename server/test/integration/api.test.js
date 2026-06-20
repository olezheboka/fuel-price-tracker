import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

// Force the isolated DB path and a known CRON secret BEFORE importing the app.
// dotenv.config() won't override vars that already exist, so these win.
process.env.POSTGRES_URL = '';
process.env.CRON_SECRET = 'test-secret';
delete process.env.VERCEL;

let app;
beforeAll(async () => {
    app = (await import('../../index.js')).default;
});

// The public API surface is the highest-value security boundary: it must
// validate input, gate the scrape trigger, and 404 cleanly — without leaking
// internals or crashing. These checks all run before any DB/network work.
describe('GET /api/health', () => {
    it('should_return_200_with_status_ok', async () => {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
    });
});

describe('GET /api/prices/history input validation', () => {
    it('should_return_400_for_an_invalid_fuel_type', async () => {
        const res = await request(app).get('/api/prices/history?type=DROP%20TABLE');
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error');
    });

    it('should_return_400_for_an_unknown_fuel_type', async () => {
        const res = await request(app).get('/api/prices/history?type=Petrol99');
        expect(res.status).toBe(400);
    });

    it('should_not_leak_a_stack_trace_in_the_error_body', async () => {
        const res = await request(app).get('/api/prices/history?type=bad');
        expect(JSON.stringify(res.body)).not.toMatch(/at \//);
    });
});

describe('GET /api/scrape authorization', () => {
    it('should_return_401_without_a_valid_bearer_token', async () => {
        const res = await request(app).get('/api/scrape');
        expect(res.status).toBe(401);
    });

    it('should_return_401_with_a_wrong_token', async () => {
        const res = await request(app).get('/api/scrape').set('Authorization', 'Bearer nope');
        expect(res.status).toBe(401);
    });
});

describe('unknown API routes', () => {
    it('should_return_404_json_for_an_unknown_api_path', async () => {
        const res = await request(app).get('/api/does-not-exist');
        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('error');
    });
});
