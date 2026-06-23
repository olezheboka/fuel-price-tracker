import { describe, it, expect, beforeEach } from 'vitest';
import { parseFilterCsv, serializeFilterSet, initFilterSet } from '../../src/lib/filters.js';

const ALL = ['Neste', 'CircleK', 'Virsi', 'Viada'];

describe('parseFilterCsv', () => {
  it('should_parse_a_valid_csv_into_a_set', () => {
    expect([...parseFilterCsv('Neste,Viada', ALL)].sort()).toEqual(['Neste', 'Viada']);
  });
  it('should_drop_unknown_tokens', () => {
    expect([...parseFilterCsv('Neste,Hacker', ALL)]).toEqual(['Neste']);
  });
  it('should_return_null_when_nothing_valid_remains', () => {
    expect(parseFilterCsv('Hacker,DROP', ALL)).toBe(null);
    expect(parseFilterCsv('', ALL)).toBe(null);
  });
});

describe('serializeFilterSet (omit-when-default)', () => {
  it('should_omit_when_all_selected', () => {
    expect(serializeFilterSet(new Set(ALL), ALL)).toBe(null);
  });
  it('should_serialize_a_partial_selection_in_canonical_order', () => {
    expect(serializeFilterSet(new Set(['Viada', 'Neste']), ALL)).toBe('Neste,Viada');
  });
  it('should_omit_an_empty_selection', () => {
    expect(serializeFilterSet(new Set(), ALL)).toBe(null);
  });
});

describe('initFilterSet (URL > persisted fallback > default-all)', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('should_read_from_the_url_param_first', () => {
    window.history.replaceState({}, '', '/?stations=Neste,Viada');
    // URL wins even when a (different) persisted fallback is supplied.
    expect([...initFilterSet('stations', ALL, 'CircleK')].sort()).toEqual(['Neste', 'Viada']);
  });

  it('should_fall_back_to_the_persisted_raw_value', () => {
    expect([...initFilterSet('stations', ALL, 'CircleK')]).toEqual(['CircleK']);
  });

  it('should_default_to_all_when_nothing_set', () => {
    expect([...initFilterSet('stations', ALL)].sort()).toEqual([...ALL].sort());
  });

  it('should_default_to_all_when_the_url_value_is_garbage', () => {
    window.history.replaceState({}, '', '/?stations=%E2%98%A0');
    expect([...initFilterSet('stations', ALL)].sort()).toEqual([...ALL].sort());
  });
});
