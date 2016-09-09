import {IEvent, apples} from './exported';

/** This is a startup */
export class Startup {
    /** Does this work? */
    public static main(): number {
        apples();
        return 1;
    }

    private health: number;

    constructor() {
        this.health = 50;
    }

    get ahealth() {
        return this.health;
    }

    public add(a: IEvent) {
        console.log(a);
        let b: string;
        // b = Startup.main()
        console.log(b);
        return 0;
    }
}

let x: IEvent = { when: 2 };
console.log(x);

Object.assign({}, new Startup());
