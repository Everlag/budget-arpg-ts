/**
 * Okay, so we need to be able to handle a few exotic features
 *
 *     - serialize complex relationship; graphs, not trees
 *     - serialize classes with the knowledge that we'll be
 *       able to deserialize into the same classes
 *     - handle typescript interfaces correctly.
 *         This will likely require additional information present
 *         in each... luckily DamageMods already exhibit that pattern
 */

interface IConstructor {
    prototype: Object;
}

class TypeRegistry {
    /** serial to constructor lookup */
    public numToCon: Map<number, IConstructor> = new Map();
    /** constructor to serial lookup */
    public conToNum: Map<IConstructor, number> = new Map();

    /** NOTE: this must be >=1 or logic breaks */
    private next_serial = 1;

    constructor() {
        // code...
    }

    /** Register a type to be deserialized later */
    public register(con: IConstructor) {
        this.numToCon.set(this.next_serial, con);
        this.conToNum.set(con, this.next_serial);
        this.next_serial++;
    }

    public get_serial(obj: Object): number | undefined {
        return this.conToNum.get(obj.constructor);
    }

    public get_constructor(num: number): IConstructor | undefined {
        return this.numToCon.get(num);
    }
}

/** Singleton registry for all of our registration needs */
const registry = new TypeRegistry();

export function register(target: any) {
    let con = (<IConstructor>target);

    if (!con.prototype) throw Error(`${target.name} has no prototype inside register`);

    registry.register(con);
}

interface Iflattened {
    /** Flat object to NODEID */
    nodes: Map<Object, number>;
    /** LINKID to NODEID */
    links: Map<number, number>;
    /** Baseline node to start restoring links from */
    root: Object;
}

/** Store classes of nodes that have specifically registered types */
function saveClasses(flat: Iflattened) {
    let rootSerial = registry.get_serial(flat.root);
    if (rootSerial) {
        let rootRef = <{ [key: string]: any }>flat.root;
        rootRef[ClassNumberField] = rootSerial;
    }

    Array.from(flat.nodes.keys()).forEach(n => {
        if (!n) return;
        let serial = registry.get_serial(n);
        if (!serial) return;

        let ref = <{ [key: string]: any }>n;
        ref[ClassNumberField] = serial
    });
}

/**
 * Convert plain objects to classes and return NODEID to class-ful object map
 */
function restoreClasses(flat: Iflattened): Map<number, Object> {

    let rootRef = <{ [key: string]: any }>flat.root;
    let rootSerial = rootRef[ClassNumberField];
    if(rootSerial) {
        let rootCon = registry.get_constructor(rootSerial);
        if(!rootCon) throw Error('rootSerial exists but no valid constructor recorded');
        let classful = Object.create(rootCon.prototype);
        flat.root = Object.assign(classful, flat.root);
    }

    // Record id to object mapping
    let idToNode: Map<number, Object> = new Map();

    Array.from(flat.nodes).forEach(n=> {
        let [obj, nodeid] = n;
        let objRef = <{ [key: string]: any }>obj;
        if(!obj) {
            idToNode.set(nodeid, obj);
            return;
        }
        let serial = objRef[ClassNumberField];
        // Check if falsey object or no class annotation present
        if(!serial) {
            idToNode.set(nodeid, obj);
            return;
        }

        // Restore class as necessary
        let con = registry.get_constructor(serial);
        if(!con) throw Error('serial exists but no valid constructor recorded');
        let classful = Object.create(con.prototype);
        idToNode.set(nodeid, Object.assign(classful, obj));
    });

    return idToNode;
}

const ClassNumberField = '$CN';
const LinkFlag = '$L';

const LinkFlagMatcher = new RegExp(`\\${LinkFlag}=(.*)`);

/**
 * NOTE: links start at extremely high values
 */
let nextNode = 1;
let nextLink = 1;
function flatten(root: Object,
    isRoot = false,
    flat: Iflattened = {
        root: {},
        nodes: new Map(),
        links: new Map(),
    }) {

    // Give it a signature we can traverse
    let walkable = <{ [key: string]: any }>root;

    // Insert root into the node list
    flat.nodes.set(root, nextNode++);
    // If we can't actually walk this, skip
    if (!walkable) return flat;

    // Walk the object
    Object.keys(walkable).forEach(key => {
        let value = walkable[key];
        if (typeof value !== 'object') return;
        console.log('handling object key', key);

        let obj: Object = value;

        // If we have encountered this node, make a link instead
        console.log('not already seen!')

        // We haven't seen this node yet, so we flatten it,
        // add it to our node list, and make it into a link
        if (!flat.nodes.has(obj)) {
            nextNode++;
            flatten(value, false, flat);
            flat.nodes.set(value, nextNode);
            nextNode++;
        }

        // Indicate this value is a link and set the link
        walkable[key] = `${LinkFlag}=${nextLink}`;
        // And make the link in the links
        flat.links.set(nextLink, flat.nodes.get(value));
        nextLink++;
    });

    // Note root as special and remove from our general node list
    if (isRoot) flat.root = walkable;
    flat.nodes.delete(root);

    return flat;
}

/** TODO: All nodes pointed to by root will be reattached */
function inflate(flat: Iflattened,
    isRoot = false,
    idToNode: Map<number, Object> = new Map(),
    node: Object | null = null) {

    if(isRoot) {
        // Revive all our of classes
        idToNode = restoreClasses(flat);
        node = flat.root;
    }

    if(!node) return;

    // Reconnect all links for current node and descend
    let walkable = <{ [key: string]: any }>node;
    Object.keys(walkable).forEach(key => {

        // console.log(key, walkable[key], walkable);

        let match = LinkFlagMatcher.exec(walkable[key]);

        // Skip non-link fields
        if(match == null) return;

        // console.log(match);

        // Fetch the link
        let link = Number(match[1]);
        // Fetch the node number from the link map
        let nodeid = flat.links.get(link);
        if(!nodeid) throw Error(`invalid nodeid=${nodeid} discovered on valid link=${link}`);
        // Grab the node and link it up.
        let node = idToNode.get(nodeid);
        walkable[key] = node;

        // Descend the node to reconnect anything we need to
        inflate(flat, false, idToNode, node);
    });
}

/** 
 * Create a snapshot that can be deserialized for full functionality
 *
 * This is a destructive operation that will
 * effectively destroy the root object
 */
export function snapshot(root: Object) {

    // Reset globals
    nextNode = 1;
    nextLink = 1;

    let flat = flatten(root, true);

    // Ensure we can restore classes as possible
    saveClasses(flat);

    return JSON.stringify({
        root: flat.root,
        nodes: [...flat.nodes],
        links: [...flat.links],
    });

}

/** Deserialize a snapshot taken with snapshot */
export function revive(json: string) {

    let raw = JSON.parse(json);
    if(!raw.nodes || !raw.nodes || !raw.links ) {
        throw Error('cannot revive invalid snapshot');
    }

    let flat: Iflattened = {
        root: <Object>raw.root,
        nodes: new Map<Object, number>(raw.nodes),
        links: new Map<number, number>(raw.links),
    }

    inflate(flat, true);

    return flat.root;

}

/** 
 * Create a snapshot of current state that cannot be continued.
 */
export function lossySnapshot(root: Object) {
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

(<any>window).flatten = flatten;
(<any>window).printFlatten = (flat: Iflattened) => {

    flat.nodes.forEach((value, key) => {
        console.log(key, value);
    })


    flat.links.forEach((value, key) => {
        console.log(key, value);
    })
};
(<any>window).snapshot = snapshot;
(<any>window).revive = revive;
(<any>window).lossySnapshot = lossySnapshot;
(<any>window).registry = registry;


(<any>window).testClass = class testClass {

    public apples = 2;

    constructor() {
        // code...
    }

    public print() {
        console.log(this.apples);
    }
}

