define("ARPGState", ["require", "exports", 'js-priority-queue'], function (require, exports, PriorityQueue) {
    "use strict";
    exports.TicksPerSecond = 100;
    exports.MaxEventsPerTick = 1000;
    class State {
        constructor() {
            this.queue = new PriorityQueue({
                comparator: (a, b) => a.when - b.when,
            });
        }
        addEvent(e) {
            if (e.when < this.now) {
                throw Error('provided event has when less than now');
            }
            this.queue.queue(e);
        }
        step() {
            this.now += 1;
            let completed = 0;
            if (this.queue.length === 0)
                return completed;
            let next = this.queue.peek();
            while (!(this.queue.length === 0) &&
                next.when <= this.now &&
                completed < exports.MaxEventsPerTick) {
                let e = this.queue.dequeue();
                let followups = e.apply(this);
                followups.forEach((followup) => this.addEvent(followup));
                completed++;
                if (completed > exports.MaxEventsPerTick) {
                    throw Error(`more than ${exports.MaxEventsPerTick} retired in tick`);
                }
                if (this.queue.length > 0) {
                    next = this.queue.peek();
                }
            }
            return completed;
        }
    }
    exports.State = State;
    class Event {
        constructor(when, action, post) {
            this.when = when;
            this.action = action;
            this.post = post;
            this.used = false;
            this.cancelled = false;
            this.delayed = false;
            if (!this.action) {
                throw Error('invalid passed action');
            }
        }
        apply(state) {
            if (this.used) {
                throw Error('cannot apply already used event');
            }
            this.used = true;
            if (this.cancelled) {
                return [];
            }
            if (this.delayed) {
                if (!this.newWhen) {
                    throw Error('Event delayed but no newWhen present');
                }
                return [new Event(this.newWhen, this.action, this.post)];
            }
            let followups = [];
            followups.push(this.action(state));
            if (this.post)
                followups.push(this.post(state));
            return followups.filter((e) => e !== null);
        }
        cancel() {
            this.cancelled = true;
        }
        delay(newWhen) {
            if (this.when < newWhen) {
                throw Error('cannot delay to less than initial when');
            }
            if (this.delayed && this.newWhen < newWhen) {
                throw Error('cannot delay to less than previous delay');
            }
            this.delayed = true;
            this.newWhen = newWhen;
        }
    }
    exports.Event = Event;
});
define("Damage", ["require", "exports"], function (require, exports) {
    "use strict";
    (function (Elements) {
        Elements[Elements["Fire"] = 0] = "Fire";
        Elements[Elements["Light"] = 1] = "Light";
        Elements[Elements["Cold"] = 2] = "Cold";
    })(exports.Elements || (exports.Elements = {}));
    var Elements = exports.Elements;
    (function (DamageTag) {
        DamageTag[DamageTag["Attack"] = 0] = "Attack";
        DamageTag[DamageTag["DOT"] = 1] = "DOT";
        DamageTag[DamageTag["Melee"] = 2] = "Melee";
        DamageTag[DamageTag["Projectile"] = 3] = "Projectile";
        DamageTag[DamageTag["AOE"] = 4] = "AOE";
        DamageTag[DamageTag["Fire"] = 5] = "Fire";
        DamageTag[DamageTag["Light"] = 6] = "Light";
        DamageTag[DamageTag["Cold"] = 7] = "Cold";
    })(exports.DamageTag || (exports.DamageTag = {}));
    var DamageTag = exports.DamageTag;
    class Damage {
        constructor(tags, phys = 0, fire = 0, light = 0, cold = 0) {
            this.tags = tags;
            this.phys = phys;
            this.fire = fire;
            this.light = light;
            this.cold = cold;
        }
        getElement(element) {
            let magnitude;
            switch (element) {
                case 0:
                    magnitude = this.fire;
                    break;
                case 1:
                    magnitude = this.light;
                    break;
                case 2:
                    magnitude = this.cold;
                    break;
                default:
                    throw Error('fell through Elements switch');
            }
            return magnitude;
        }
        setElement(element, magnitude) {
            switch (element) {
                case 0:
                    this.fire = magnitude;
                    break;
                case 1:
                    this.light = magnitude;
                    break;
                case 2:
                    this.cold = magnitude;
                    break;
                default:
                    throw Error('fell through Elements switch');
            }
        }
    }
    exports.Damage = Damage;
});
define("DamageMods", ["require", "exports"], function (require, exports) {
    "use strict";
    (function (DamageModOrder) {
        DamageModOrder[DamageModOrder["Local"] = 0] = "Local";
        DamageModOrder[DamageModOrder["AddedDamage"] = 1] = "AddedDamage";
        DamageModOrder[DamageModOrder["BaseDamageScale"] = 2] = "BaseDamageScale";
        DamageModOrder[DamageModOrder["ConvertTo"] = 3] = "ConvertTo";
        DamageModOrder[DamageModOrder["AddedConvert"] = 4] = "AddedConvert";
        DamageModOrder[DamageModOrder["GlobalAdd"] = 5] = "GlobalAdd";
        DamageModOrder[DamageModOrder["GlobalMult"] = 6] = "GlobalMult";
        DamageModOrder[DamageModOrder["PostInitial"] = 7] = "PostInitial";
        DamageModOrder[DamageModOrder["Range"] = 8] = "Range";
        DamageModOrder[DamageModOrder["Mitigation"] = 9] = "Mitigation";
    })(exports.DamageModOrder || (exports.DamageModOrder = {}));
    var DamageModOrder = exports.DamageModOrder;
    (function (DamageModDirection) {
        DamageModDirection[DamageModDirection["Taking"] = 0] = "Taking";
        DamageModDirection[DamageModDirection["Dealing"] = 1] = "Dealing";
        DamageModDirection[DamageModDirection["Always"] = 2] = "Always";
    })(exports.DamageModDirection || (exports.DamageModDirection = {}));
    var DamageModDirection = exports.DamageModDirection;
    class DamageModGroup {
        constructor(mods) {
            this.mods = mods;
        }
        static sum(mods) {
            let summed = new Array();
            let buckets = new Map();
            mods.forEach(mod => {
                if (!mod.canSum) {
                    summed.push(mod);
                }
                else {
                    let bucket = buckets.get(mod.name);
                    if (!bucket)
                        bucket = new Array();
                    bucket.push(mod);
                    buckets.set(mod.name, bucket);
                }
            });
            [...buckets.values()].forEach(bucket => {
                let merged = DamageModGroup.mergeBucket(bucket);
                summed.push(...merged);
            });
            return summed;
        }
        static mergeBucket(bucket) {
            if (!bucket[0].summable) {
                return [bucket.reduce((prev, current) => current.sum(prev))];
            }
            let used = new Set();
            return bucket.map((mod, topIndex) => {
                if (used.has(topIndex))
                    return null;
                used.add(topIndex);
                bucket.forEach((other, index) => {
                    if (used.has(index))
                        return;
                    if (mod.summable(other)) {
                        mod = mod.sum(other);
                        used.add(index);
                    }
                });
                return mod;
            }).filter(mod => mod != null);
        }
        static order(mods) {
            return mods.sort((a, b) => a.position - b.position);
        }
        add(mod, direction) {
            if (mod.direction === direction ||
                mod.direction === 2) {
                this.mods.push(mod);
            }
        }
        apply(d) {
            let summed = DamageModGroup.sum(this.mods);
            let ordered = DamageModGroup.order(summed);
            ordered.forEach(mod => {
                let tagOverlap = [...mod.reqTags.values()]
                    .reduce((prev, current) => {
                    let hasShared = d.tags.has(current);
                    return hasShared || prev;
                }, false) || mod.reqTags.size === 0;
                if (!tagOverlap)
                    return;
                d = mod.apply(d);
            });
            return d;
        }
        clone() {
            return new DamageModGroup(this.mods.map(m => m.clone()));
        }
    }
    exports.DamageModGroup = DamageModGroup;
});
define("random", ["require", "exports"], function (require, exports) {
    "use strict";
    function intfromInterval(min, max) {
        return Math.floor((Math.random() * (max - min + 1)) + min);
    }
    exports.intfromInterval = intfromInterval;
    function entityCode() {
        let code = new Array();
        for (let i = 0; i <= 1; i++) {
            code.push(intfromInterval(0, 255).toString(16));
        }
        return code.join('');
    }
    exports.entityCode = entityCode;
    function rollSuccess(probability) {
        return probability > Math.random();
    }
    exports.rollSuccess = rollSuccess;
});
define("Character", ["require", "exports", 'state-machine', "DamageMods", "random"], function (require, exports, StateMachine, DamageMods_1, random_1) {
    "use strict";
    (function (GearSlot) {
        GearSlot[GearSlot["Chest"] = 0] = "Chest";
        GearSlot[GearSlot["Boots"] = 1] = "Boots";
        GearSlot[GearSlot["Gloves"] = 2] = "Gloves";
        GearSlot[GearSlot["Helmet"] = 3] = "Helmet";
        GearSlot[GearSlot["Weapon"] = 4] = "Weapon";
    })(exports.GearSlot || (exports.GearSlot = {}));
    var GearSlot = exports.GearSlot;
    class Gear {
        constructor(slot, mods) {
            this.slot = slot;
            this.mods = mods;
        }
    }
    exports.Gear = Gear;
    class LoadOut {
        constructor(gear) {
            this.gear = gear;
            let usedSlots = new Set();
            let overlaps = gear.some(g => {
                if (usedSlots.has(g.slot))
                    return true;
                usedSlots.add(g.slot);
                return false;
            });
            if (overlaps)
                throw Error('multiple gear items in same slot');
        }
        getMods() {
            let mods = this.gear.reduce((prev, g) => {
                prev.push(...g.mods);
                return prev;
            }, []);
            return new DamageMods_1.DamageModGroup(mods);
        }
    }
    exports.LoadOut = LoadOut;
    class Character {
        constructor(loadout, skill, baseStats) {
            this.loadout = loadout;
            this.skill = skill;
            this.baseStats = baseStats;
            this.identity = random_1.entityCode();
        }
        get health() {
            return 50;
        }
    }
    exports.Character = Character;
    class SkillContext {
        constructor(skill, event) {
            this.skill = skill;
            this.event = event;
        }
        cancel() {
            this.event.cancel();
        }
    }
    class GlobalContext {
        constructor(base) {
            ({ health: this.health } = base);
        }
    }
    class CharacterState {
        constructor(character) {
            this.character = character;
            this.context = new GlobalContext(character);
        }
        onenterengaged() {
            console.log('onenterengaged', this.current);
        }
        onbeforeengage() {
            console.log('onbeforeengage', this.current);
        }
        onengage(e, from, to, target) {
            this.context.target = target;
        }
        onleaveengaged() {
            console.log('onleaveengaged', this.current);
        }
        ondecide() {
            console.log('ondecide', this.current);
        }
        get target() {
            return this.context.target;
        }
    }
    exports.CharacterState = CharacterState;
    StateMachine.create({
        target: CharacterState.prototype,
        initial: 'idle',
        events: [
            { name: 'engage', from: 'idle', to: 'engaged' },
            { name: 'decide', from: 'engaged', to: 'deciding' },
            { name: 'disengage', from: 'engaged', to: 'idle' },
        ],
    });
    let basex = new Character(new LoadOut([]), 'badness', 'worseness');
    let basey = new Character(new LoadOut([]), 'badness', 'worseness');
    let x = new CharacterState(basex);
    let y = new CharacterState(basey);
    console.log(x);
    x.engage(y);
    y.engage(x);
    console.log(x);
    console.log('Character.ts was executed completely!');
});
define("DamageModRegistry", ["require", "exports", "random"], function (require, exports, Random_1) {
    "use strict";
    class Armor {
        constructor(armor) {
            this.armor = armor;
            this.name = 'ArmorDamageMod';
            this.canSum = true;
            this.direction = 0;
            this.reqTags = new Set();
            this.position = 9;
        }
        apply(d) {
            let phys = (10 * d.phys * d.phys) / (this.armor + (10 * d.phys));
            d.phys = phys;
            return d;
        }
        sum(other) {
            return new Armor(this.armor + other.armor);
        }
        clone() {
            return Object.assign({}, this);
        }
    }
    exports.Armor = Armor;
    class Resistance {
        constructor(resistance, element) {
            this.resistance = resistance;
            this.element = element;
            this.name = 'ResistsDamageMod';
            this.canSum = true;
            this.direction = 0;
            this.reqTags = new Set();
            this.position = 9;
        }
        apply(d) {
            let magnitude = d.getElement(this.element);
            let applied = (1 - this.resistance) * magnitude;
            d.setElement(this.element, applied);
            return d;
        }
        sum(other) {
            if (!this.summable(other)) {
                throw Error('this mod is not summable with other');
            }
            let capped = Math.min(this.resistance + other.resistance, 0.75);
            return new Resistance(capped, this.element);
        }
        summable(other) {
            return this.element === other.element;
        }
        clone() {
            return Object.assign({}, this);
        }
    }
    exports.Resistance = Resistance;
    class Zero {
        constructor() {
            this.name = 'ZeroDamageMod';
            this.canSum = false;
            this.direction = 2;
            this.reqTags = new Set();
            this.position = 7;
        }
        apply(d) {
            d.phys = 0;
            d.setElement(0, 0);
            d.setElement(1, 0);
            d.setElement(2, 0);
            return d;
        }
        clone() {
            return Object.assign({}, this);
        }
    }
    exports.Zero = Zero;
    class LocalPhysical {
        constructor(min, max) {
            this.min = min;
            this.max = max;
            this.name = 'LocalPhysicalDamageMod';
            this.canSum = true;
            this.direction = 1;
            this.reqTags = new Set();
            this.position = 0;
        }
        apply(d) {
            let flatPhys = Random_1.intfromInterval(this.min, this.max);
            d.phys += flatPhys;
            return d;
        }
        sum(other) {
            return new LocalPhysical(this.min + other.min, this.max + other.max);
        }
        clone() {
            return Object.assign({}, this);
        }
    }
    exports.LocalPhysical = LocalPhysical;
});
define("exported", ["require", "exports"], function (require, exports) {
    "use strict";
    function apples() {
        console.log('apples');
    }
    exports.apples = apples;
});
define("helloWorld", ["require", "exports", "exported"], function (require, exports, exported_1) {
    "use strict";
    class Startup {
        constructor() {
            this.health = 50;
        }
        static main() {
            exported_1.apples();
            return 1;
        }
        get ahealth() {
            return this.health;
        }
        add(a) {
            console.log(a);
            let b;
            console.log(b);
            return 0;
        }
    }
    exports.Startup = Startup;
    let x = { when: 2 };
    console.log(x);
    Object.assign({}, new Startup());
});
define("entry", ["require", "exports", "helloWorld", "ARPGState", "Character", "Damage", "DamageMods", "DamageModRegistry", 'seedrandom'], function (require, exports, helloWorld_1, ARPGState_1, Character_1, Damage_1, DamageMods_2, DamageMods, SeedRandom) {
    "use strict";
    let start = performance.now();
    class Orange {
        constructor(flavor) {
            this.flavor = flavor;
        }
    }
    exports.Orange = Orange;
    const globalState = new ARPGState_1.State();
    let nextEvent = new ARPGState_1.Event(0, (state) => null, (state) => null);
    globalState.addEvent(nextEvent);
    console.log('for fucks sake this works!');
    window.namespace = globalState;
    let d = new Damage_1.Damage(new Set([2]), 40, 10, 0, 10);
    let group = new DamageMods_2.DamageModGroup([]);
    group.add(new DamageMods.Armor(15), 0);
    group.add(new DamageMods.Armor(10), 0);
    group.add(new DamageMods.Armor(50), 0);
    group.add(new DamageMods.Armor(25), 0);
    group.add(new DamageMods.Resistance(0.4, 0), 0);
    group.add(new DamageMods.Resistance(0.1, 0), 0);
    group.add(new DamageMods.Resistance(0.75, 2), 0);
    let newD = group.apply(d);
    console.log(newD);
    if (newD.phys !== 32) {
        throw Error('phys is not 32 wtf');
    }
    if (newD.fire !== 5) {
        throw Error('fire is not 5 wtf');
    }
    SeedRandom('testing!', { global: true });
    console.log(Math.random());
    console.log(new helloWorld_1.Startup());
    console.log(new Character_1.Character(new Character_1.LoadOut([]), 'basic attack', 'bad stats'));
    let end = performance.now();
    console.log(`took ${(end - start).toFixed(2)}ms`);
});
define("Skill", ["require", "exports", "ARPGState", "DamageMods", "DamageModRegistry"], function (require, exports, ARPGState_2, DamageMods_3, DamageModRegistry_1) {
    "use strict";
    class SkillResult {
        constructor(mods, postmods, postDelay) {
            this.mods = mods;
            this.postmods = postmods;
            this.postDelay = postDelay;
            if (mods === null) {
                throw Error('mods is null, prefer to add(new Zero()) instead');
            }
        }
        get hasFollowup() {
            return this.postmods != null;
        }
    }
    exports.SkillResult = SkillResult;
    class BasicAttackEffect {
        constructor() {
            this.name = 'Basic Attack Effect';
            this.tags = [];
        }
        execute(target, user, mods) {
            return null;
        }
    }
    class TossedBladeEffect {
        constructor() {
            this.name = 'Tossed Blade Effect';
            this.tags = [];
        }
        execute(target, user, mods) {
            let initial = new DamageMods_3.DamageModGroup([new DamageModRegistry_1.Zero()]);
            let postDelay = ARPGState_2.TicksPerSecond * 0.3;
            let postmods = mods;
            return new SkillResult(initial, postmods, postDelay);
        }
    }
});

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkFSUEdTdGF0ZS50cyIsIkRhbWFnZS50cyIsIkRhbWFnZU1vZHMudHMiLCJyYW5kb20udHMiLCJDaGFyYWN0ZXIudHMiLCJEYW1hZ2VNb2RSZWdpc3RyeS50cyIsImV4cG9ydGVkLnRzIiwiaGVsbG9Xb3JsZC50cyIsImVudHJ5LnRzIiwiU2tpbGwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7SUFFYSxzQkFBYyxHQUFXLEdBQUcsQ0FBQztJQUs3Qix3QkFBZ0IsR0FBRyxJQUFJLENBQUM7SUFFckM7UUFPSTtZQUNJLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxhQUFhLENBQVE7Z0JBQ2xDLFVBQVUsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUMsSUFBSTthQUN4QyxDQUFDLENBQUM7UUFDUCxDQUFDO1FBS00sUUFBUSxDQUFDLENBQVE7WUFFcEIsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDcEIsTUFBTSxLQUFLLENBQUMsdUNBQXVDLENBQUMsQ0FBQztZQUN6RCxDQUFDO1lBQ0QsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDeEIsQ0FBQztRQU1NLElBQUk7WUFFUCxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQztZQUdkLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztZQUdsQixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUM7Z0JBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQztZQUU5QyxJQUFJLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQzdCLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQztnQkFDN0IsSUFBSSxDQUFD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QjtZQUVwQixNQUFNLENBQUMsSUFBSSxDQUFDO1FBQ2hCLENBQUM7SUFDTCxDQUFDO0lBS0Q7UUFBQTtZQUNXLFNBQUksR0FBRyxxQkFBcUIsQ0FBQztZQUM3QixTQUFJLEdBQXFCLEVBQUUsQ0FBQztRQWlCdkMsQ0FBQztRQWZVLE9BQU8sQ0FBQyxNQUFzQixFQUFFLElBQW9CLEVBQ3ZELElBQW9CO1lBR3BCLElBQUksT0FBTyxHQUFHLElBQUksMkJBQWMsQ0FBQyxDQUFDLElBQUksd0JBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztZQUcvQyxJQUFJLFNBQVMsR0FBRywwQkFBYyxHQUFHLEdBQUcsQ0FBQztZQUVyQyxJQUFJLFFBQVEsR0FBRyxJQUFJLENBQUM7WUFHcEIsTUFBTSxDQUFDLElBQUksV0FBVyxDQUFDLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDekQsQ0FBQztJQUVMLENBQUM7SUFBQSIsImZpbGUiOiJlbnRyeS5qcyIsInNvdXJjZXNDb250ZW50IjpbbnVsbCxudWxsLG51bGwsbnVsbCxudWxsLG51bGwsbnVsbCxudWxsLG51bGwsbnVsbF0sInNvdXJjZVJvb3QiOiIvc291cmNlLyJ9
