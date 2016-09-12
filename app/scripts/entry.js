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
        add(mod) {
            this.mods.push(mod);
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
define("DamageModRegistry", ["require", "exports"], function (require, exports) {
    "use strict";
    class Armor {
        constructor(armor) {
            this.armor = armor;
            this.name = 'ArmorDamageMod';
            this.canSum = true;
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
    }
    exports.Armor = Armor;
    class Resistance {
        constructor(resistance, element) {
            this.resistance = resistance;
            this.element = element;
            this.name = 'ResistsDamageMod';
            this.canSum = true;
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
    }
    exports.Resistance = Resistance;
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
    group.add(new DamageMods.Armor(15));
    group.add(new DamageMods.Armor(10));
    group.add(new DamageMods.Armor(50));
    group.add(new DamageMods.Armor(25));
    group.add(new DamageMods.Resistance(0.4, 0));
    group.add(new DamageMods.Resistance(0.1, 0));
    group.add(new DamageMods.Resistance(0.75, 2));
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkFSUEdTdGF0ZS50cyIsIkRhbWFnZS50cyIsIkRhbWFnZU1vZHMudHMiLCJyYW5kb20udHMiLCJDaGFyYWN0ZXIudHMiLCJEYW1hZ2VNb2RSZWdpc3RyeS50cyIsImV4cG9ydGVkLnRzIiwiaGVsbG9Xb3JsZC50cyIsImVudHJ5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0lBRWEsc0JBQWMsR0FBVyxHQUFHLENBQUM7SUFLN0Isd0JBQWdCLEdBQUcsSUFBSSxDQUFDO0lBRXJDO1FBT0k7WUFDSSxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksYUFBYSxDQUFRO2dCQUNsQyxVQUFVLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLElBQUk7YUFDeEMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQztRQUtNLFFBQVEsQ0FBQyxDQUFRO1lBRXBCLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ3BCLE1BQU0sS0FBSyxDQUFDLHVDQUF1QyxDQUFDLENBQUM7WUFDekQsQ0FBQztZQUNELElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3hCLENBQUM7UUFNTSxJQUFJO1lBRVAsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUM7WUFHZCxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7WUFHbEIsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDO2dCQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUM7WUFFOUMsSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUM3QixPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUM7Z0JBQzdCLElBQUksQ0FBQyxJQUFJLElBQUks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QUFDO0lBQ3pDLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFFM0IsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLG9CQUFPLEVBQUUsQ0FBQyxDQUFDO0lBRTNCLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxxQkFBUyxDQUFDLElBQUksbUJBQU8sQ0FBQyxFQUFFLENBQUMsRUFBRSxjQUFjLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQztJQUV6RSxJQUFJLEdBQUcsR0FBRyxXQUFXLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDNUIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsR0FBRyxHQUFHLEtBQUssQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMiLCJmaWxlIjoiZW50cnkuanMiLCJzb3VyY2VzQ29udGVudCI6W251bGwsbnVsbCxudWxsLG51bGwsbnVsbCxudWxsLG51bGwsbnVsbCxudWxsXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=
