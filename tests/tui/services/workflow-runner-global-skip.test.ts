import { describe, it, expect } from 'vitest';
import { findGlobalDisallowedWords } from '../../../src/tui/services/workflow-runner.js';

describe('findGlobalDisallowedWords', () => {
  it('returns empty array when global words list is empty', () => {
    expect(findGlobalDisallowedWords('JIRA ticket', 'some body', [])).toEqual([]);
  });

  it('detects a global word in subject (case-insensitive)', () => {
    expect(findGlobalDisallowedWords('[JIRA]', 'clean body', ['[JIRA]'])).toEqual(['[JIRA]']);
  });

  it('detects a global word in body (case-insensitive)', () => {
    expect(findGlobalDisallowedWords('clean subject', 'ServiceNow ticket created', ['ServiceNow'])).toEqual(['ServiceNow']);
  });

  it('detects multiple global words', () => {
    const result = findGlobalDisallowedWords('[JIRA] task', 'ServiceNow alert', ['[JIRA]', 'ServiceNow']);
    expect(result).toContain('[JIRA]');
    expect(result).toContain('ServiceNow');
  });

  it('returns empty when no global words appear in subject or body', () => {
    expect(findGlobalDisallowedWords('Normal email', 'Please review this.', ['[JIRA]', 'ServiceNow'])).toEqual([]);
  });

  it('is case-insensitive', () => {
    expect(findGlobalDisallowedWords('servicenow ALERT', '', ['ServiceNow'])).toEqual(['ServiceNow']);
  });
});

describe('findGlobalDisallowedWords — word-boundary matching', () => {
  // Regression: short keywords like "ot" or "gis" were matching as substrings
  // inside Spanish words (e.g. "otro", "nota", "registro") causing false positives.

  it('does not match "ot" inside "otro"', () => {
    expect(findGlobalDisallowedWords('Cambio en otro entorno', '', ['ot'])).toEqual([]);
  });

  it('does not match "ot" inside "nota"', () => {
    expect(findGlobalDisallowedWords('Nota informativa', 'Ver nota adjunta', ['ot'])).toEqual([]);
  });

  it('does not match "gis" inside "registro"', () => {
    expect(findGlobalDisallowedWords('Actualización de registro', 'nuevo registro creado', ['gis'])).toEqual([]);
  });

  it('does not match "gis" inside "logística"', () => {
    expect(findGlobalDisallowedWords('Reunión de logística', '', ['gis'])).toEqual([]);
  });

  it('matches "ot" when it appears as a standalone word', () => {
    expect(findGlobalDisallowedWords('Incidencia OT abierta', '', ['ot'])).toEqual(['ot']);
  });

  it('matches "gis" when it appears as a standalone word', () => {
    expect(findGlobalDisallowedWords('Datos del sistema GIS', '', ['gis'])).toEqual(['gis']);
  });

  it('matches "azure" as a whole word but not inside a compound word', () => {
    expect(findGlobalDisallowedWords('Retirada del pool Azure programada', '', ['azure'])).toEqual(['azure']);
    expect(findGlobalDisallowedWords('Configuración notazure interna', '', ['azure'])).toEqual([]);
  });

  // Scenario: email about pool/infrastructure removal — "ot" and "gis" must not
  // fire just because the body contains "otro", "nota", or "registro".
  it('does not trigger short keywords on a typical infrastructure-notification body', () => {
    const subject = 'FW: [Action required] Scheduled pool removal';
    const body = [
      'Se ha programado la retirada del pool de servidores.',
      'Para más información consulta el registro de cambios.',
      'Nota: el proceso afecta a otro entorno no productivo.',
    ].join('\n');
    expect(findGlobalDisallowedWords(subject, body, ['ot', 'gis'])).toEqual([]);
  });
});
