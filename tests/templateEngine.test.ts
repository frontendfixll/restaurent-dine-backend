import {
  renderTemplate,
  extractVariables,
} from '../src/modules/notifications/template.engine';

describe('renderTemplate', () => {
  test('replaces flat variables', () => {
    const { rendered, missing } = renderTemplate('Hello {{name}}', { name: 'Priya' });
    expect(rendered).toBe('Hello Priya');
    expect(missing).toEqual([]);
  });

  test('handles dot paths', () => {
    const { rendered } = renderTemplate('Total: {{order.total}}', { order: { total: 250 } });
    expect(rendered).toBe('Total: 250');
  });

  test('replaces missing with empty in non-strict', () => {
    const { rendered, missing } = renderTemplate('Hello {{name}}', {});
    expect(rendered).toBe('Hello ');
    expect(missing).toEqual(['name']);
  });

  test('throws on missing in strict mode', () => {
    expect(() => renderTemplate('Hello {{name}}', {}, { strict: true })).toThrow(
      /Missing template variables/,
    );
  });

  test('ignores whitespace inside braces', () => {
    const { rendered } = renderTemplate('Hi {{   name }}', { name: 'A' });
    expect(rendered).toBe('Hi A');
  });

  test('handles multiple vars', () => {
    const { rendered } = renderTemplate('{{a}} {{b}} {{a}}', { a: 'X', b: 'Y' });
    expect(rendered).toBe('X Y X');
  });
});

describe('extractVariables', () => {
  test('extracts unique vars', () => {
    expect(extractVariables('{{a}} {{b}} {{a}} {{c.d}}')).toEqual(['a', 'b', 'c.d']);
  });

  test('returns empty for vanilla text', () => {
    expect(extractVariables('hello world')).toEqual([]);
  });
});
