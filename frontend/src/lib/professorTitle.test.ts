import { describe, expect, it } from 'vitest';
import {
  extractProfessorTitleTags,
  matchesProfessorTitleTag,
  normalizeProfessorTitleDisplay,
} from './professorTitle';

describe('professorTitle', () => {
  it('extracts deduplicated title tags from composite strings', () => {
    expect(extractProfessorTitleTags('教授、博导')).toEqual(['教授', '博导']);
    expect(extractProfessorTitleTags('副教授/硕导')).toEqual(['副教授', '硕导']);
  });

  it('normalizes display order and separator', () => {
    expect(normalizeProfessorTitleDisplay('博导/教授')).toBe('教授 / 博导');
    expect(normalizeProfessorTitleDisplay('副教授，硕导')).toBe('副教授 / 硕导');
  });

  it('matches title filter by included tag instead of full string equality', () => {
    expect(matchesProfessorTitleTag('教授、博导', '教授')).toBe(true);
    expect(matchesProfessorTitleTag('教授、博导', '博导')).toBe(true);
    expect(matchesProfessorTitleTag('教授、博导', '副教授')).toBe(false);
  });
});
