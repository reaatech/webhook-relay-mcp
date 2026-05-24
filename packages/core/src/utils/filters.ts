interface FilterOperators {
  $eq?: Record<string, unknown>;
  $neq?: Record<string, unknown>;
  $gt?: Record<string, unknown>;
  $gte?: Record<string, unknown>;
  $lt?: Record<string, unknown>;
  $lte?: Record<string, unknown>;
  $in?: Record<string, unknown[]>;
  $nin?: Record<string, unknown[]>;
  $regex?: Record<string, string>;
  $exists?: Record<string, boolean>;
  $and?: Record<string, unknown>[];
  $or?: Record<string, unknown>[];
  $not?: Record<string, unknown>;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function coerceForComparison(a: unknown, b: unknown): [unknown, unknown] {
  if (typeof a === 'number' && typeof b === 'string') {
    const num = Number(b);
    if (!Number.isNaN(num)) return [a, num];
  }
  if (typeof a === 'string' && typeof b === 'number') {
    const num = Number(a);
    if (!Number.isNaN(num)) return [num, b];
  }
  return [a, b];
}

function compareValues(eventValue: unknown, filterValue: unknown, operator: string): boolean {
  const [ev, fv] = coerceForComparison(eventValue, filterValue);

  switch (operator) {
    case '$eq':
      return ev === fv;
    case '$neq':
      return ev !== fv;
    case '$gt':
      if (typeof ev !== 'number' || typeof fv !== 'number') return false;
      return ev > fv;
    case '$gte':
      if (typeof ev !== 'number' || typeof fv !== 'number') return false;
      return ev >= fv;
    case '$lt':
      if (typeof ev !== 'number' || typeof fv !== 'number') return false;
      return ev < fv;
    case '$lte':
      if (typeof ev !== 'number' || typeof fv !== 'number') return false;
      return ev <= fv;
    case '$in':
      if (!Array.isArray(fv)) return false;
      return fv.some((v) => {
        const [ev2, fv2] = coerceForComparison(ev, v);
        return ev2 === fv2;
      });
    case '$nin':
      if (!Array.isArray(fv)) return false;
      return !fv.some((v) => {
        const [ev2, fv2] = coerceForComparison(ev, v);
        return ev2 === fv2;
      });
    case '$regex': {
      if (typeof fv !== 'string') return false;
      try {
        return new RegExp(fv).test(String(ev));
      } catch {
        return false;
      }
    }
    case '$exists': {
      const shouldExist = Boolean(fv);
      return shouldExist ? ev !== undefined && ev !== null : ev === undefined || ev === null;
    }
    default:
      return false;
  }
}

function evaluateNode(node: Record<string, unknown>, event: Record<string, unknown>): boolean {
  const keys = Object.keys(node);

  for (const key of keys) {
    if (key.startsWith('$')) {
      const op = key as keyof FilterOperators;

      switch (op) {
        case '$and': {
          const conditions = node[op] as Record<string, unknown>[];
          return conditions.every((c) => evaluateNode(c, event));
        }
        case '$or': {
          const conditions = node[op] as Record<string, unknown>[];
          return conditions.some((c) => evaluateNode(c, event));
        }
        case '$not': {
          const condition = node[op] as Record<string, unknown>;
          return !evaluateNode(condition, event);
        }
        default: {
          const pairs = node[op] as Record<string, unknown>;
          for (const [fieldPath, filterValue] of Object.entries(pairs)) {
            const eventValue = getNestedValue(event, fieldPath);
            if (!compareValues(eventValue, filterValue, op)) {
              return false;
            }
          }
          return true;
        }
      }
    }
  }

  return true;
}

export function evaluateFilter(
  filter: Record<string, unknown>,
  event: Record<string, unknown>,
): boolean {
  if (!filter || Object.keys(filter).length === 0) return true;
  return evaluateNode(filter, event);
}
