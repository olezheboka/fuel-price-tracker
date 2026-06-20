import { describe, it, expect } from 'vitest';
import { convertQueryToPg } from '../../db.js';

// The DB abstraction rewrites SQLite-style `?` placeholders to Postgres `$n`.
// A regression here corrupts every Postgres query in production.
describe('convertQueryToPg', () => {
    it('should_number_placeholders_left_to_right', () => {
        expect(convertQueryToPg('INSERT INTO t (a, b, c) VALUES (?, ?, ?)'))
            .toBe('INSERT INTO t (a, b, c) VALUES ($1, $2, $3)');
    });

    it('should_leave_queries_without_placeholders_unchanged', () => {
        expect(convertQueryToPg('SELECT * FROM fuel_prices')).toBe('SELECT * FROM fuel_prices');
    });

    it('should_handle_a_single_placeholder', () => {
        expect(convertQueryToPg('SELECT price FROM fuel_prices WHERE type = ?'))
            .toBe('SELECT price FROM fuel_prices WHERE type = $1');
    });
});
