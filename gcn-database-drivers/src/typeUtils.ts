export function isBoolean(obj: unknown): obj is boolean {
    return typeof obj === 'boolean';
}

export function isNumber(obj: unknown): obj is number {
    return typeof obj === 'number';
}

export function isString(obj: unknown): obj is string {
    return typeof obj === 'string';
}

export function isObject(obj: unknown): obj is object {
    return obj !== null && typeof obj === 'object';
}

export function isInIs<T, K extends PropertyKey, R extends boolean = true>(
    field: K,
    obj: object,
    typeTest: (obj: unknown) => obj is T,
    required?: R
): obj is R extends true ? { [P in K]: T } : { [P in K]?: T } {
    return field in obj ? typeTest((obj as any)[field]) : !required;
}

export function isTypeArray<T>(obj: unknown, typeTest: (obj: unknown) => obj is T): obj is T[] {
    return Array.isArray(obj) && (obj.length === 0 || obj.every(typeTest));
}