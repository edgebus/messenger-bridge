/**
 * TypeScript method decorator
 */
export function Bind<T extends Function>(
  _target: Object,
  methodName: string | symbol,
  descriptor: TypedPropertyDescriptor<T>,
) {
  return {
    configurable: true,
    get(this: T): T {
      const value = descriptor.value !== undefined ? descriptor.value.bind(this) : undefined;
      Object.defineProperty(this, methodName, {
        value,
        configurable: true,
        ...(descriptor.configurable !== undefined ? { writable: descriptor.configurable } : {}),
        ...(descriptor.writable !== undefined ? { writable: descriptor.writable } : {}),
      });
      return value;
    },
  };
}
