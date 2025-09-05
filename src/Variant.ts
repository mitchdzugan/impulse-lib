export type Proxy<T> = {
    __typeRef: (t: T) => T
}
type PropertyWrappingType<T extends Proxy<any>> =
    ReturnType<T['__typeRef']>
export function Proxy<T>(): Proxy<T> { return { __typeRef: (t) => t } }

type VarTypeDefLike = {
    family: any,
    variants: { [k: string | number | symbol]: Proxy<any> },
}
type VarTFromDefLike<Def extends VarTypeDefLike> = {
    [K in keyof Def['variants']]: PropertyWrappingType<Def['variants'][K]>
}

type VarSpecFull<T, A> = {
    [K in keyof T]: (v: T[K]) => A
}
type VarSpec<T, A> = VarSpecFull<T, A> | (
    Partial<VarSpecFull<T, A>> & { _: () => A }
)

function isObj(a: any): any {
    return typeof a === 'object' && !Array.isArray(a) && a !== null
}

function toPretty(a: any): any {
    if (!a) { return a }
    else if (Array.isArray(a)) {
        return a.map(toPretty)
    } else if (isObj(a)) {
        const customPretty = a.pretty
        if (customPretty) { return customPretty }
        const res: any = {}
        for (const k in a) {
            res[k] = toPretty(a[k])
        }
        return res
    }
    return a
}

type VarMks<S, T> = {
    [K in keyof T]: (v: T[K]) => {
        data: T[K],
        variant: { family: S, label: K, id: number, nth: number },
        impl<A>(spec: VarSpec<T, A>): A
        isA(...ks: (keyof T)[]): boolean
        get pretty(): any
    }
}
type PVarMks<S, T> = Partial<VarMks<S, T>>
export type VariantVal<S, T> = ReturnType<VarMks<S, T>[keyof T]>
type VarDef<S, T> = VarMks<S, T> & {
    <A>(spec: VarSpec<T, A>): (v: VariantVal<S, T>) => A
}

type DefVariantLike<T> = {
    [K in keyof T]: (...args: any[]) => { data: any, variant: { family: any } }
}

export type VariantValFrom<T extends DefVariantLike<T>> = VariantVal<
    ReturnType<T[keyof T]>['variant']['family'],
    { [K in keyof T]: ReturnType<T[K]>['data'] }
>

export type VarDefFrom<VarTypeDef extends VarTypeDefLike> =
    VarDef<VarTypeDef['family'], VarTFromDefLike<VarTypeDef>>

export function VariantTypeDef<
    const VarTypeDef extends VarTypeDefLike
>(typeDef: VarTypeDef): VarTypeDef { return typeDef }

export function DefVariant<
    const VarTypeDef extends VarTypeDefLike
>(typeDef: VarTypeDef): VarDefFrom<VarTypeDef> {
    const family = typeDef.family
    const keys = Object.keys(typeDef.variants)
    return DefVariantImpl(family)<VarTFromDefLike<VarTypeDef>>(...keys)
}

function DefVariantImpl<const S extends string>(family: S) {
    return function DevVar__<T>(...keys: (keyof T)[]): VarDef<S, T> {
        const mks: PVarMks<S, T> = {}
        const variantId = ++nextVariantId
        let nextVariantNth = 0
        function impl<A>(spec: VarSpec<T, A>) {
            return function(v: VariantVal<S, T>) {
                const variantLabel = v.variant.label
                if ('_' in spec) {
                    const fn = (spec as Partial<VarSpecFull<T, A>>)[variantLabel]
                    return fn ? fn(v.data) : spec['_']()
                } else {
                    const fn = spec[variantLabel]
                    return fn(v.data)
                }
            }
        }
        function isA(v: VariantVal<S, T>, ...ks: (keyof T)[]) {
            const { label } = v.variant
            for (const k of ks) { if (k === label) { return true } }
            return false
        }
        for (const k of keys) {
            const variantNth = ++nextVariantNth
            mks[k] = (obj: T[typeof k]) => {
                const res = {
                    data: obj,
                    variant: { family, label: k, id: variantId, nth: variantNth },
                    impl<A>(spec: VarSpec<T, A>): A {
                        return impl(spec)(res as VariantVal<S, T>)
                    },
                    isA(...ks: (keyof T)[]) {
                        return isA(res as VariantVal<S, T>, ...ks)
                    },
                    get pretty() {
                        return {
                            __variant: `${family}:${String(k)}`,
                            ...toPretty(obj)
                        }
                    }
                }
                return res
            }
        }
        return Object.assign(impl, mks as VarMks<S, T>)
    }
}
let nextVariantId = 0
type VoidVals<T extends number | string | symbol> = { [K in T]: void }
export function DefEnum<const S extends string>(family: S) {
    return function<K extends number | string | symbol>(...keys: K[]): VarDef<S, VoidVals<K>> {
        return DefVariantImpl<S>(family)<VoidVals<K>>(...keys)
    }
}
