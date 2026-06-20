import { describe, it, expect } from 'vitest';
import { toCanonical as circlekCanonical } from '../../scrapers/circlek.js';
import { toCanonical as viadaCanonical } from '../../scrapers/viada.js';
import { TYPE_MAP as virsiTypeMap } from '../../scrapers/virsi.js';

// Mis-mapping a raw fuel name silently mislabels a whole column for a chain, so
// each provider's name->canonical-id mapping is a high-value pure unit.
describe('CircleK toCanonical', () => {
    it('should_map_95miles_to_95', () => expect(circlekCanonical('95miles')).toBe('95'));
    it('should_map_98miles_plus_to_98', () => expect(circlekCanonical('98miles+')).toBe('98'));
    it('should_map_dmiles_to_diesel', () => expect(circlekCanonical('Dmiles')).toBe('diesel'));
    it('should_map_dmiles_plus_to_pro', () => expect(circlekCanonical('Dmiles+')).toBe('pro'));
    it('should_map_autogaze_to_gas', () => expect(circlekCanonical('Autogāze')).toBe('gas'));
    it('should_omit_xtl_renewable_diesel', () => expect(circlekCanonical('miles+ XTL')).toBe(null));
    it('should_omit_unknown_fuel', () => expect(circlekCanonical('AdBlue')).toBe(null));
});

describe('Viada toCanonical (by image src)', () => {
    it('should_map_95ecto_to_95', () => expect(viadaCanonical('/img/petrol_95ecto_new.png')).toBe('95'));
    it('should_map_98_to_98', () => expect(viadaCanonical('/img/petrol_98.png')).toBe('98'));
    it('should_map_d_ecto_to_pro', () => expect(viadaCanonical('/img/d_ecto.png')).toBe('pro'));
    it('should_map_petrol_d_to_diesel', () => expect(viadaCanonical('/img/petrol_d.png')).toBe('diesel'));
    it('should_map_gaze_to_gas', () => expect(viadaCanonical('/img/gaze.png')).toBe('gas'));
    it('should_omit_e85', () => expect(viadaCanonical('/img/e85.png')).toBe(null));
    it('should_omit_premium_95_ectoplus', () => expect(viadaCanonical('/img/95ectoplus.png')).toBe(null));
});

describe('Virsi TYPE_MAP (by data-type)', () => {
    it('should_map_data_types_to_canonical_ids', () => {
        expect(virsiTypeMap['95e']).toBe('95');
        expect(virsiTypeMap['98e']).toBe('98');
        expect(virsiTypeMap['dd']).toBe('diesel');
        expect(virsiTypeMap['lpg']).toBe('gas');
    });
    it('should_not_define_premium_diesel_which_virsi_does_not_sell', () => {
        expect(virsiTypeMap['ddplus']).toBeUndefined();
        expect(Object.values(virsiTypeMap)).not.toContain('pro');
    });
});
