export function matchEventType(pattern: string, eventType: string): boolean {
  if (pattern === '*') {
    return true;
  }
  if (pattern.includes('*')) {
    const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
    return regex.test(eventType);
  }
  return pattern === eventType;
}
