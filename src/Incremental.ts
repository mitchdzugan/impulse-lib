import { None, Some, type Maybe } from "./Maybe"
import * as LHM from './LHM'

type IncrementalDefLike = {
    props: {
        [k: string | number | symbol]: {
            T: any,
            peek: any,
            put: any,
            overwrite: any,
        }
    }
    push: any
    delete?: void
}

type IncrementalDef<T extends IncrementalDefLike> = T

type Source<T extends IncrementalDefLike> = {
    [K in keyof T['props']]: T['props'][K]['T']
}
type PropsKey<T extends IncrementalDefLike> = keyof T['props']
type PropsPeek<T extends IncrementalDefLike, K extends PropsKey<T>> = T['props'][K]['peek']
type PropGetFn<T extends IncrementalDefLike> = <K extends PropsKey<T>>(k: K) => PropsPeek<T, K>

export class Incremental<T extends IncrementalDefLike> {
    private source: Source<T>
    private overwrites: Map<keyof T, Maybe<T[keyof T]>> = new Map()
    private isFinal: boolean
    private propPeekFn: PropGetFn<T>
    constructor(
        source: Source<T>,
        propPeekFn: PropGetFn<T>
    ) {
        this.isFinal = false
        this.source = source
        this.propPeekFn = propPeekFn
    }

    propPeek<K extends PropsKey<T>>(k: K): PropsPeek<T, K> {
        return this.propPeekFn(k)
    }
}

type IncrementalArrayDef<T> = IncrementalDef<{
    props: {
        [n: number]: {
            T: T
            peek: Maybe<T>
            put: never
            overwrite: T
        }
    }
    push: T
}>

function IncrementalArray<T>(source: T[]) {
    return new Incremental<IncrementalArrayDef<T>>(
        source,
        (i) => (i >= 0 && i < source.length) ? Some(source[i]) : None()
    )
}

const lhm = LHM.fromVals('a', 'b', 'c')
for (const [k, v] of lhm) {
    console.log({ k, v })
}
console.log(lhm.json)