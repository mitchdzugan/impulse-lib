import { None, Some, type Maybe } from "./Maybe"
import { VariantTypeDef, DefEnum, DefVariant, Proxy, type VarDefFrom, type VariantValFrom } from "./Variant"

//////////// |V| LHM Cons |V| ////////////

type LHMConsDefSpec<T> = {
    family: 'LHMCons'
    variants: { Vals: Proxy<T[]> }
}
type LHMConsDef<T> = VarDefFrom<LHMConsDefSpec<T>>
const __LHMCons: LHMConsDef<any> = DefVariant({
    family: 'LHMCons',
    variants: { Vals: Proxy<any[]>() }
})
function MkLHMCons<T>(): LHMConsDef<T> { return __LHMCons }
type LHMCons<T> = VariantValFrom<LHMConsDef<T>>

//////////// |^| LHM Cons |^| ////////////

type LHMId<T> = number

type LHMNode<T> = {
    prev?: LHMNode<T>
    next?: LHMNode<T>
    val: T
    id: LHMId<T>
}

class LHMClass<T> {
    private data: { [k: LHMId<T>]: LHMNode<T> } = {}
    private nextLHMId: number = 1
    private takeId(): LHMId<T> { return this.nextLHMId++ }
    private ends?: [LHMNode<T>, LHMNode<T>]

    constructor(cons: LHMCons<T>) {
        cons.impl({
            Vals: (vals) => {
                for (const val of vals) {
                    this.push(val)
                }
            }
        })
    }

    private get first() { return this.ends && this.ends[0] }
    private get last() { return this.ends && this.ends[1] }

    *[Symbol.iterator](): Iterator<[LHMId<T>, T]> {
        let node = this.first
        while (node) {
            yield [node.id, node.val]
            node = node.next
        }
    }

    at(k: LHMId<T>): Maybe<T> {
        const node = this.data[k]
        return (node) ? Some(node.val) : None()
    }

    push(val: T): LHMId<T> {
        const id = this.takeId()
        const prev = this.last
        const node = { prev, id, val }
        this.data[id] = node
        if (prev) {
            prev.next = node
            this.ends[1] = node
        } else {
            this.ends = [node, node]
        }
        return id
    }

    get json(): any {
        return { lhmEntries: [...this] }
    }
}

type LHM<T> = LHMClass<T>

export function fromVals<T>(...vals: T[]): LHM<T> {
    const LHMCons = MkLHMCons<T>()
    return new LHMClass(LHMCons.Vals(vals))
}

export function Empty<T>(): LHM<T> { return fromVals() }