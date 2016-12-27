const ClassNumberField = 'SerialClassFlavor';

interface IConstructor {
    name: string;
    prototype: { [key: string]: any };
}

class TypeRegistry {
    /** serial to constructor lookup */
    private keyToCon: Map<string, IConstructor> = new Map();

    /** The next serial number we can use for classes */
    private nextSerial = 1;

    /** Register a type to be deserialized later */
    public register(con: IConstructor) {
        // Sanity check
        // 
        // Technically, this does limit our ability to handle inheritance
        // but that's fine for now.
        if (con.prototype[ClassNumberField]) throw `attempted to register already registered class ${con.name}`;

        // Compute and add the serial to the constructor
        let key = `${con.name}${this.nextSerial}`;
        con.prototype[ClassNumberField] = `${con.name}${this.nextSerial}`;

        // Note the mapping of serial to constructor
        this.keyToCon.set(key, con);
        this.nextSerial++;
    }

    public get_serial(obj: Object): string | undefined {
        // Avoid lookup cost on arrays
        if (obj.constructor.prototype === Array.prototype) return undefined;
        let con = <IConstructor>obj.constructor;
        return con.prototype[ClassNumberField];
    }

    public get_constructor(key: string): IConstructor | undefined {
        return this.keyToCon.get(key);
    }
}

/** Singleton registry for all of our registration needs */
const registry = new TypeRegistry();

/** 
 * Registration decorator for classes
 *
 * NOTE: when classes are extended, apply the decorator to only
 *       the class extending.
 */
export function registerClass(target: any) {
    let con = (<IConstructor>target);

    // Sanity check to ensure we're actually getting a prototype
    if (!con.prototype) throw Error(`${target.name} has no prototype inside register`);

    registry.register(con);
}

/** 
 * Create a snapshot of current state
 *
 * This is a lossy snapshot, once serialized all
 * circular references are stripped.
 *
 * NOTE: all class annotations are added using @register decorator
 *       which modified the prototype of every class.
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
        return value;
    });
}

// Export registration of a class by default
export default registerClass;
