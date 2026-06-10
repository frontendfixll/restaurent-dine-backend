/**
 * Tiny `{{var}}` and `{{nested.path}}` template engine. No conditionals or
 * loops — keep templates obvious so non-engineers can edit them safely.
 */

const VAR_PATTERN = /\{\{\s*([a-zA-Z_][\w.]*)\s*\}\}/g;

function resolveDotPath(payload: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as object)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, payload);
}

export interface RenderOptions {
  strict?: boolean; // throw if a var is missing
}

export function renderTemplate(
  template: string,
  payload: Record<string, unknown>,
  options: RenderOptions = {},
): { rendered: string; missing: string[] } {
  const missing: string[] = [];
  const rendered = template.replace(VAR_PATTERN, (_match, key: string) => {
    const value = resolveDotPath(payload, key);
    if (value === undefined || value === null) {
      missing.push(key);
      return options.strict ? `{{${key}}}` : '';
    }
    return String(value);
  });
  if (options.strict && missing.length) {
    throw new Error(`Missing template variables: ${missing.join(', ')}`);
  }
  return { rendered, missing };
}

export function extractVariables(template: string): string[] {
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(VAR_PATTERN.source, 'g');
  while ((m = re.exec(template)) !== null) found.add(m[1]);
  return Array.from(found);
}
