export const DOM = {}

type Stack<a> = null | [a, Stack<a>]
type Ident = [string, Stack<string>]

function nextIdent(step: string, curr?: Ident): Ident {
    return [curr ? `${curr[0]}>${step}` : step, [step, curr ? curr[1] : null]]
}

class DomContext {
    public ident: Ident
    public usedIdents: Set<string>
    constructor(identStep?: string, parent?: DomContext) {
        this.ident = nextIdent(identStep || '|', parent?.ident)
        this.usedIdents = new Set();
    }
}

type DOM<a> = (dc: DomContext) => a

function step<a>(s: string, inner: DOM<a>): DOM<a> {
    return (ctx) => {
        const innerCtx = new DomContext(s, ctx)
        return inner(innerCtx)
    }
}