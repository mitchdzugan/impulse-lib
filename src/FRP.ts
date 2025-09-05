export const FRP = {}

/*
type MPromise<T> = T | Promise<T>
type MPromiseF<Args extends any[], T> = (...args: Args) => MPromise<T>
function ensurePromise<T>(maybeP: MPromise<T>): Promise<T> {
    if (maybeP instanceof Promise) {
        return maybeP
    } else {
        return Promise.resolve(maybeP)
    }
}
function ensurePromiseF<Args extends any[], T>(
    f: (...a: Args) => MPromise<T>
): (...a: Args) => Promise<T> {
    return (...args: Args) => Promise.resolve().then(() => f(...args))
}
*/

type FRP_SINGLETON = {
    nextTickId: number,
    nextProducerId: number,
    nextConsumerId: number,
    nextDemanderId: number,
    consumers: {
        [k: number]: { onTick: () => void, producerSpec: ProducerSpec }
    },
    demanders: {
        [k: number]: { onOff: () => void, producerId: number, addedAt: number }
    },
    tick?: { id: number, producerId: number, consumed: Set<number> },
}

const FRP_SINGLETON : FRP_SINGLETON = {
    nextTickId: 0,
    nextProducerId: 0,
    nextConsumerId: 0,
    nextDemanderId: 0,
    consumers: {},
    demanders: {},
}

function assertConsumingStatus(b: boolean, msg: string) {
    if ((FRP_SINGLETON.tick !== undefined) !== b) {
        throw msg
    }
}

const assertConsuming = (msg: string) => assertConsumingStatus(true, msg)
const assertNotConsuming = (msg: string) => assertConsumingStatus(false, msg)

function currTickId(): number {
    assertConsuming('cannot determine tickId outside of consumers')
    return FRP_SINGLETON.tick.id
}

function currProducerId(): number {
    assertConsuming('cannot determine producerId outside of consumers')
    return FRP_SINGLETON.tick.producerId
}

function currConsumed(): Set<number> {
    assertConsuming('cannot determine `consumed set` outside of consumers')
    return FRP_SINGLETON.tick.consumed
}

function emit(tickId: number, producerId: number) {
    assertNotConsuming('cannot emit events in consumers')
    const consumed = new Set<number>()
    FRP_SINGLETON.tick = { id: tickId, producerId, consumed }
    for (const consumer of Object.values(FRP_SINGLETON.consumers)) {
        consumer.onTick()
        if (consumer.producerSpec.producers.has(producerId)) {
            consumed.add(producerId)
        }
    }
    Promise.resolve().then(() => {
        const toDelete = []
        for (const demanderId in FRP_SINGLETON.demanders) {
            const demander = FRP_SINGLETON.demanders[demanderId]
            const wasAddedPrior = demander.addedAt < tickId
            if (!consumed.has(demander.producerId) && wasAddedPrior) {
                demander.onOff()
                toDelete.push(demanderId)
            }
        }
        for (const demanderId of toDelete) {
            delete FRP_SINGLETON.demanders[demanderId]
        }
    })
    delete FRP_SINGLETON.tick
}

type Emission<a> = undefined | [a]
type OnUp = () => void

abstract class ProducerSpec {
    #resolved: undefined | {
        producers: Set<number>,
        onUps: Map<number, OnUp>
    }
    #updatedAt: number = 0

    get resolved(): { producers: Set<number>, onUps: Map<number, OnUp> } {
        this.#resolved ||= this.resolve()
        return this.#resolved
    }

    get producers(): Set<number> {
        return this.resolved.producers
    }

    get onUps(): Map<number, OnUp> {
        return this.resolved.onUps
    }

    onUp() {
        for (const onUp of this.onUps.values()) { onUp() }
    }

    ensureUpdated(consumed: Set<number>) {
        const tickId = currTickId()
        if (this.#updatedAt === tickId) { return }
        if (this.needsUpdate) {
            this.#resolved = this.resolve()
        }
        for (const producerId of this.#resolved.producers) {
            consumed.add(producerId)
        }
        this.#updatedAt = tickId
    }

    abstract get needsUpdate(): boolean
    abstract resolve(): {
        producers: Set<number>,
        onUps: Map<number, OnUp>
    }
}

class DirectProducerSpec extends ProducerSpec {
    #producers: Set<number>
    #onUps: Map<number, () => void>
    constructor(onUp: undefined | (() => void), ...producerIds: number[]) {
        super()
        this.#producers = new Set(producerIds)
        this.#onUps = new Map()
        if (onUp) {
            for (const producerId of this.#producers) {
                this.#onUps.set(producerId, onUp)
            }
        }
    }
    get needsUpdate() {
        for (const onUp of this.#onUps.values()) { onUp() }
        return false
    }
    resolve() {
        return {
            producers: this.#producers,
            onUps: this.#onUps,
        }
    }
}

class JoinProducerSpec extends ProducerSpec {
    #producerSpecs: ProducerSpec[]
    constructor(...producerSpecs: ProducerSpec[]) {
        super()
        this.#producerSpecs = producerSpecs
    }

    get needsUpdate() {
        for (const spec of this.#producerSpecs) {
            if (spec.needsUpdate) { return true }
        }
        return false
    }

    resolve() {
        const producers = new Set<number>()
        const onUps = new Map<number, OnUp>()
        for (const spec of this.#producerSpecs) {
            for (const producerId of spec.producers) {
                producers.add(producerId)
            }
            spec.onUps.forEach((onUp, producerId) => {
                onUps.set(producerId, onUp)
            })
        }
        return { producers, onUps }
    }
}

class BindProducerSpec extends ProducerSpec {
    #outerSpec: ProducerSpec
    #getInnerSpec?: () => ProducerSpec | undefined
    #innerSpec?: ProducerSpec
    constructor(
        outerSpec: ProducerSpec,
        getInnerSpec: () => ProducerSpec | undefined
    ) {
        super()
        this.#outerSpec = outerSpec
        this.#getInnerSpec = getInnerSpec
        this.#innerSpec = undefined
    }

    get needsUpdate() {
        const innerSpec = this.#getInnerSpec()
        const result = !Object.is(this.#innerSpec, innerSpec) || (
            this.#outerSpec.needsUpdate || this.#innerSpec?.needsUpdate
        )
        this.#innerSpec = innerSpec
        return result
    }

    resolve() {
        const producers = new Set<number>()
        const onUps = new Map<number, OnUp>()

        for (const producerId of this.#outerSpec.producers) {
            producers.add(producerId)
        }
        for (const producerId of this.#innerSpec?.producers || []) {
            producers.add(producerId)
        }

        this.#outerSpec.onUps.forEach((onUp, producerId) => {
            onUps.set(producerId, onUp)
        })
        this.#innerSpec?.onUps.forEach((onUp, producerId) => {
            onUps.set(producerId, onUp)
        })

        return { producers, onUps }
    }
}

export abstract class Event<a> {
    public producerId: number
    abstract resolveEmission(): Emission<a>

    #emission: Emission<a> = undefined
    #atTickId: number = 0
    #producerSpec: ProducerSpec

    constructor(mkProducerSpec: (selfId: number) => ProducerSpec) {
        this.producerId = ++FRP_SINGLETON.nextProducerId
        this.#producerSpec = mkProducerSpec(this.producerId)
    }

    get emission(): Emission<a> {
        return this.isAtCurrTickId ?
            this.#emission :
            this.resolveEmissionAndMakeCurrent()
    }
    get hasEmission(): boolean { return this.#emission !== undefined }
    get isAtCurrTickId(): boolean { return this.#atTickId === currTickId() }
    get producerSpec(): ProducerSpec { return this.#producerSpec }
    get producers(): Set<number> { return this.#producerSpec.producers }

    isDependant(producerId: number): boolean {
        return this.#producerSpec.producers.has(producerId)
    }

    resolveEmissionAndMakeCurrent(): Emission<a> {
        const isDependant = this.isDependant(currProducerId())
        const emission = (() => (
            isDependant ? this.resolveEmission() : undefined
        ))()
        this.setEmission(emission)
        const consumed = currConsumed()
        if (isDependant) {
            this.#producerSpec.ensureUpdated(consumed)
        } else {
            this.#producerSpec.onUp()
            for (const producerId of this.#producerSpec.producers) {
                consumed.add(producerId)
            }
        }
        return this.#emission
    }

    setEmission(emission: Emission<a>, tickId: number = currTickId()) {
        this.#emission = emission && [emission[0]]
        this.#atTickId = tickId
    }
}

function mkOnTick<a>(onVal: (a: a) => void, event: Event<a>): () => void {
    return () => {
        const emission = event.emission
        emission && onVal(emission[0])
    }
}

class BaseEventProducer<a, b> extends Event<a> {
    protected emitterResult: Promise<b>
    constructor(emitter: (le: (a: a) => void) => b, onUp?: () => void) {
        super((selfId) => new DirectProducerSpec(onUp, selfId))
        const localEmit = (value: a) => {
            const tickId = ++FRP_SINGLETON.nextTickId
            this.setEmission([value], tickId)
            return emit(tickId, this.producerId)
        }
        this.emitterResult = Promise.resolve().then(() => emitter(localEmit))
    }

    resolveEmission() {
        return undefined
    }
}

abstract class OnDemandProd<a> extends BaseEventProducer<a, (a: a) => void> {}
class EventProducerOnDemandClass<a> extends OnDemandProd<a> {
    #isUp: boolean = false
    #onUp: (le: (a: a) => void) => () => void
    #onDown: Promise<() => void>
    constructor(onUp: (le: (a: a) => void) => (() => void)) {
        super((emit) => emit, () => this.onUp())
        this.#onUp = onUp
        this.#onDown = Promise.resolve(() => {})
    }

    onUp() {
        if (this.#isUp) { return }
        this.#isUp = true
        const demanderId = ++FRP_SINGLETON.nextDemanderId
        this.#onDown = this.emitterResult.then(this.#onUp)
        FRP_SINGLETON.demanders[demanderId] = {
            addedAt: FRP_SINGLETON.nextTickId,
            producerId: this.producerId,
            onOff: () => this.onDown()
        }
    }

    onDown() {
        this.#isUp = false
        this.#onDown.then((onDown) => onDown())
        this.#onDown = Promise.resolve(() => {})
    }
}
export function mkProducerOnDemand<a>(
    emitter: (le: (a: a) => void) => (() => void)
): Event<a> {
    return new EventProducerOnDemandClass(emitter)
}

type EventProducer<a> = BaseEventProducer<a, void>
export function mkProducer<a>(
    emitter: (le: (a: a) => void) => void
): Event<a> {
    return new BaseEventProducer(emitter)
}

export function consume<a>(
    event: Event<a>,
    onVal: (a: a) => void
): () => void {
    const consumerId = ++FRP_SINGLETON.nextConsumerId
    const onTick = mkOnTick(onVal, event)
    FRP_SINGLETON.consumers[consumerId] = (
        { onTick, producerSpec: event.producerSpec }
    )
    return () => { delete FRP_SINGLETON.consumers[consumerId] }
}

function tout(t: number): Promise<void> {
    return new Promise((r) => setTimeout(() => r(), t))
}

type EventClassMWFnArgs<tfrom, tfnres, tstate> = {
    fn: (v: tfrom) => tfnres,
    emission: Emission<tfrom>,
    state: tstate,
}

type EventClassMWFn<tfrom, tfnres, tstate, tto> =
    (args: EventClassMWFnArgs<tfrom, tfnres, tstate>) => Emission<tto>


function EventClassMW<tfrom, tfnres, tstate, tto>(
    mw: EventClassMWFn<tfrom, tfnres, tstate, tto>
): (
    source: Event<tfrom>,
    fn: (v: tfrom) => tfnres,
    initialState: tstate
) => Event<tto> {
    const EventClassSimpleDep = class extends Event<tto> {
        #fn: (v: tfrom) => tfnres
        #source: Event<tfrom>
        #state: tstate
        constructor(
            source: Event<tfrom>,
            fn: (v: tfrom) => tfnres,
            initialState: tstate
        ) {
            super(() => source.producerSpec)
            this.#source = source
            this.#fn = fn
            this.#state = initialState
        }

        resolveEmission() {
            return mw({
                fn: this.#fn,
                emission: this.#source.emission,
                state: this.#state
            })
        }
    }

    return (source, fn, initialState) => (
        new EventClassSimpleDep(source, fn, initialState)
    )
}

const EventMapMk = EventClassMW((C) => C.emission && [C.fn(C.emission[0])])
export function map<a, b>(source: Event<a>, fn: (a: a) => b): Event<b> {
    return EventMapMk(source, fn, undefined) as Event<b>
}

type UniqueArg<a> = {
    emission: Emission<a>
    state: { lastEmission?: Emission<a> }
}
const EventUniqueMk = EventClassMW(function <a>(arg: UniqueArg<a>) {
    const { emission, state } = arg
    const shouldUpdate = emission && (
        !state.lastEmission || !Object.is(emission[0], state.lastEmission[0])
    )
    if (shouldUpdate) {
        state.lastEmission = emission
        return emission
    }
})
type UniqueEvent<a> = Event<a> & { lastOr(a: a): a }
export function unique<a>(source: Event<a>): UniqueEvent<a> {
    const state: { lastEmission?: [a] } = {}
    const e = EventUniqueMk(source, () => {}, state) as UniqueEvent<a>
    e.lastOr = (defaultValue: a) => (
        state.lastEmission ? state.lastEmission[0] : defaultValue
    )
    return e
}

class EventJoinClass<a> extends Event<a> {
    #events: Event<a>[]
    constructor(events: Event<a>[]) {
        super(() => new JoinProducerSpec(...events.map(e => e.producerSpec)))
        this.#events = events
    }

    resolveEmission() {
        for (const event of this.#events) {
            const emission = event.emission
            if (emission) { return emission }
        }
    }
}
export function join<a>(...events: Event<a>[]): Event<a> {
    return new EventJoinClass(events)
}

class EventBindClass<a, b> extends Event<b> {
    #source: Event<a>
    #bind: (a: a) => Event<b>
    #inner?: Event<b>
    constructor(source: Event<a>, bind: (a: a) => Event<b>) {
        const outerSpec = source.producerSpec
        super(() => (
            new BindProducerSpec(outerSpec, () => this.#inner?.producerSpec
        )))
        this.#source = source
        this.#bind = bind
    }

    resolveEmission() {
        const outerEmission = this.#source.emission
        if (outerEmission) {
            this.#inner = this.#bind(outerEmission[0])
        }
        return this.#inner?.emission
    }
}
export function bind<a, b>(
    source: Event<a>, bind: (a: a) => Event<b>
): Event<b> {
    return new EventBindClass(source, bind)
}

export type Signal<a> = { get value(): a, event: Event<a> }

export function Signal<a>(inEvent: Event<a>, initialValue: a): Signal<a> {
    const event = unique(inEvent)
    return { event, get value() { return event.lastOr(initialValue) } }
}

export function s_bind<a, b>(
    source: Signal<a>, bind_fn: (a: a) => Signal<b>
): Signal<b> {
    const s_initial = bind_fn(source.value)
    const s_event: UniqueEvent<Signal<b>> = unique(map(source.event, bind_fn))
    return {
        event: bind(s_event, ({ event }) => event),
        get value() {
            return s_event.lastOr(s_initial).value
        }
    }
}
/*
type Eobj = { e?: Event<number>, i: number }

const a: Eobj = { i: 1000 }
const b: Eobj = { i: 2000 }
const c: Eobj = { i: 3000 }

const e1 = mkProducer<Eobj>(async (emit) => {
    emit(a)
    await tout(1000)
    emit(b)
    await tout(1000)
    emit(b)
    await tout(1000)
    emit(c)
    await tout(1000)
    emit(a)
    await tout(1000)
    emit(b)
})

let einstNum = 0;
const e2 = bind(e1, (eobj) => {
    eobj.e ||= mkProducerOnDemand<number>((_emit: (i: number) => void) => {
        const instNum = ++einstNum
        console.log('EON:::[', eobj.i, ']')
        function emit(n: number) { _emit(instNum*10000 + n + eobj.i) }
        let i = 0
        const intervalId = setInterval(() => emit(++i), 300)
        setTimeout(() => clearInterval(intervalId), 5000)
        return () => {
            clearInterval(intervalId)
            console.log('EOFF::[', eobj.i, ']')
        }
    })
    return map(eobj.e, x => x * 10)
})

consume(e2, (val) => console.log(`NEW E2 EMISSION :: <% ${val} %>`))
*/