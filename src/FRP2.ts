export const FRP2 = {}

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

type FRP_SINGLETON = {
    nextTickId: number,
    nextProducerId: number,
    nextConsumerId: number,
    nextDemanderId: number,
    consumers: { [k: number]: { onTick: () => void } },
    demanders: { 
        [k: number]: {
            onOff: () => void, 
            producerId: number, 
            addedAt: number
        }
    },
    tick?: { id: number, producerId: number, consumed: Set<number> },
}