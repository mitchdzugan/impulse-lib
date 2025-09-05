class MaybeClass<T> {
    private wrappedValue?: [T]
    constructor(value?: T) {
        if (value !== undefined) {
            this.wrappedValue = [value]
        }
    }

    private case<A>(withSome: (v: T) => A, withNone: () => A): A {
        return this.wrappedValue ? withSome(this.wrappedValue[0]) : withNone()
    }

    or(defaultValue: T) { return this.case((v) => v, () => defaultValue) }

    map<R>(fn: (v: T) => R): Maybe<R> {
        return this.case((v) => Some(fn(v)), () => None())
    }
}

export type Maybe<T> = MaybeClass<T>
export function fromNullable<T>(v?: T | null): Maybe<T> {
    return new MaybeClass(Object.is(v, null) ? undefined : v)
}
export function Some<T>(v: T): Maybe<T> { return new MaybeClass(v) }
export function None<T>(): Maybe<T> { return new MaybeClass() }