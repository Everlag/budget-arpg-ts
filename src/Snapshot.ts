interface IConstructor {
    name: string;
    prototype: Object;
}

class TypeRegistry {
    /** serial to constructor lookup */
    private keyToCon: Map<string, IConstructor> = new Map();
    /** constructor to serial lookup */
    private conToKey: Map<IConstructor, string> = new Map();

    /** The next serial number we can use for classes */
    private nextSerial = 1;

    /** Register a type to be deserialized later */
    public register(con: IConstructor) {
        // Sanity check
        if (this.conToKey.get(con)) throw `attempted to register already registered class ${con.name}`;
        let key = `${con.name}${this.nextSerial}`;
        this.keyToCon.set(key, con);
        this.conToKey.set(con, key);
        this.nextSerial++;
    }

    public get_serial(obj: Object): string | undefined {
        // Avoid lookup cost on arrays
        if (obj.constructor.prototype === Array.prototype) return undefined;
        return this.conToKey.get(obj.constructor);
    }

    public get_constructor(key: string): IConstructor | undefined {
        return this.keyToCon.get(key);
    }
}

/** Singleton registry for all of our registration needs */
const registry = new TypeRegistry();

/** Registration decorator for classes */
export function registerClass(target: any) {
    let con = (<IConstructor>target);

    if (!con.prototype) throw Error(`${target.name} has no prototype inside register`);

    registry.register(con);
}

const ClassNumberField = 'SerialClassFlavor';

/** 
 * Annotate an object with which class it has if that class has been registered
 *
 * This is implementation does not descend into the object,
 * rather each object property should be checked.
 */
function annotateClass(obj: Object) {

    // Skip null
    if (obj == null) return;

    let ref = <{ [key: string]: any }>obj;

    let serial = registry.get_serial(obj);
    if (serial) ref[ClassNumberField] = serial;
}

/** 
 * Create a snapshot of current state
 *
 * This is a lossy snapshot, once serialized all
 * circular references are stripped.
 */
export function snapshot(root: Object) {
    let cache: Map<Object, null> = new Map();
    return JSON.stringify(root, (key, value) => {
        // Ignore things that cannot cause circular references
        if (typeof value !== 'object' && value !== null) return value;
        // We've seen this before, discard it
        if (cache.has(value)) return;
        // Note that we've seen it
        cache.set(value, null);
        // And add a class annotation if it needs one
        annotateClass(value);
        return value;
    });
}

// Export registration of a class by default
export default registerClass;
