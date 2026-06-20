import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Security headers are served by Vercel from vercel.json (not the Express app),
// so the right place to lock them is the config itself. This guards against a
// careless edit silently dropping the CSP / HSTS / framing protections.
const dir = path.dirname(fileURLToPath(import.meta.url));
const vercel = JSON.parse(
    fs.readFileSync(path.join(dir, '..', '..', '..', 'vercel.json'), 'utf8')
);

function headersFor(srcSpec) {
    const route = (vercel.routes || []).find((r) => r.src === srcSpec);
    return (route && route.headers) || {};
}

describe('vercel.json security headers', () => {
    // Find whichever route block actually carries the CSP (the HTML routes).
    const candidates = ['/(.*)', '/'];
    const htmlHeaders =
        candidates.map(headersFor).find((h) => h['Content-Security-Policy']) || {};

    it('should_define_a_content_security_policy', () => {
        expect(htmlHeaders['Content-Security-Policy']).toBeTruthy();
    });

    it('should_deny_framing_and_set_nosniff', () => {
        expect(htmlHeaders['X-Frame-Options']).toBe('DENY');
        expect(htmlHeaders['X-Content-Type-Options']).toBe('nosniff');
    });

    it('should_enable_hsts_with_a_long_max_age', () => {
        const hsts = htmlHeaders['Strict-Transport-Security'] || '';
        expect(hsts).toMatch(/max-age=\d{7,}/);
    });

    it('should_restrict_default_and_object_src_in_the_csp', () => {
        const csp = htmlHeaders['Content-Security-Policy'];
        expect(csp).toMatch(/default-src 'self'/);
        expect(csp).toMatch(/object-src 'none'/);
        expect(csp).toMatch(/frame-ancestors 'none'/);
    });
});
