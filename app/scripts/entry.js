define("ARPGState", ["require", "exports", 'js-priority-queue'], function (require, exports, PriorityQueue) {
    "use strict";
    exports.TicksPerSecond = 100;
    exports.MaxEventsPerTick = 1000;
    class State {
        constructor() {
            this.now = 0;
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
            if (!this.action)
                throw Error('invalid passed action');
            if (isNaN(this.when))
                throw Error('invalid passed when: NaN');
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
        DamageTag[DamageTag["Spell"] = 1] = "Spell";
        DamageTag[DamageTag["DOT"] = 2] = "DOT";
        DamageTag[DamageTag["Melee"] = 3] = "Melee";
        DamageTag[DamageTag["Ranged"] = 4] = "Ranged";
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
        apply(target) {
            target.context.stats.health -= this.sum();
            if (target.context.stats.health < 0) {
                target.die();
            }
        }
        sum() {
            return this.phys + this.fire + this.light + this.cold;
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
        constructor() {
            this.mods = [];
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
            console.log(ordered);
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
            let clone = new DamageModGroup();
            clone.mods.push(...this.mods.map(m => m.clone()));
            return clone;
        }
    }
    exports.DamageModGroup = DamageModGroup;
});
define("StatMods", ["require", "exports", "ARPGState"], function (require, exports, ARPGState_1) {
    "use strict";
    exports.baseStatsArg = {
        Health: 50,
        AttackTime: ARPGState_1.TicksPerSecond / 1,
        CastTime: 0,
    };
    class Stats {
        constructor(base) {
            ({
                Health: this.health,
                AttackTime: this.attackTime,
                CastTime: this.castTime,
            } = base);
        }
        clone() {
            return Object.assign(new Stats(exports.baseStatsArg), this);
        }
    }
    exports.Stats = Stats;
    (function (StatModOrder) {
        StatModOrder[StatModOrder["Base"] = 0] = "Base";
        StatModOrder[StatModOrder["Add"] = 1] = "Add";
        StatModOrder[StatModOrder["Mult"] = 2] = "Mult";
    })(exports.StatModOrder || (exports.StatModOrder = {}));
    var StatModOrder = exports.StatModOrder;
    class FlatAddedHealth {
        constructor(flat) {
            this.flat = flat;
            this.name = 'FlatAddedHealthMod';
            this.canSum = true;
            this.position = 1;
        }
        apply(s) {
            s.health += this.flat;
            return s;
        }
        sum(other) {
            return new FlatAddedHealth(this.flat + other.flat);
        }
    }
    exports.FlatAddedHealth = FlatAddedHealth;
    class BaseAttackTime {
        constructor(time) {
            this.time = time;
            this.name = 'BaseAttackSpeedMod';
            this.canSum = true;
            this.position = 1;
        }
        apply(s) {
            s.attackTime += this.time;
            return s;
        }
        sum(other) {
            throw Error('BaseAttackTime should have a single source');
        }
    }
    exports.BaseAttackTime = BaseAttackTime;
    class IncreasedAttackSpeed {
        constructor(percent) {
            this.percent = percent;
            this.name = 'IncreasedAttackSpeedMod';
            this.canSum = true;
            this.position = 1;
        }
        apply(s) {
            s.attackTime *= 1 / (1 + this.percent);
            return s;
        }
        sum(other) {
            return new IncreasedAttackSpeed(this.percent + other.percent);
        }
    }
    exports.IncreasedAttackSpeed = IncreasedAttackSpeed;
    class StatModGroup {
        constructor() {
            this.mods = [];
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
                let merged = StatModGroup.mergeBucket(bucket);
                summed.push(...merged);
            });
            return summed;
        }
        static mergeBucket(bucket) {
            return [bucket.reduce((prev, current) => current.sum(prev))];
        }
        static order(mods) {
            return mods.sort((a, b) => a.position - b.position);
        }
        add(mod) {
            this.mods.push(mod);
        }
        apply(s) {
            let summed = StatModGroup.sum(this.mods);
            let ordered = StatModGroup.order(summed);
            console.log(ordered);
            ordered.forEach(mod => s = mod.apply(s));
            return s;
        }
    }
    exports.StatModGroup = StatModGroup;
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
            return Object.assign(new Armor(0), this);
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
            return Object.assign(new Resistance(0, 0), this);
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
            return Object.assign(new Zero(), this);
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
            return new LocalPhysical(other.min + this.min, other.max + this.max);
        }
        clone() {
            return Object.assign(new LocalPhysical(0, 0), this);
        }
    }
    exports.LocalPhysical = LocalPhysical;
});
define("Skill", ["require", "exports", "ARPGState", "Damage", "DamageMods", "DamageModRegistry", "StatMods"], function (require, exports, ARPGState_2, Damage_1, DamageMods_1, DamageModRegistry_1, StatMods) {
    "use strict";
    class SkillResult {
        constructor(mods, postmods, postDelay) {
            this.mods = mods;
            this.postmods = postmods;
            this.postDelay = postDelay;
            this.applied = false;
            if (mods === null) {
                throw Error('mods is null, prefer to add(new Zero()) instead');
            }
        }
        execute(target, state) {
            if (this.applied)
                throw Error('cannot apply SkillResult > 1 time');
            this.applied = true;
            let initialDamage = this.mods.apply(new Damage_1.Damage(new Set()));
            initialDamage.apply(target);
            if (!this.hasFollowup)
                return;
            let e = new ARPGState_2.Event(state.now + this.postDelay, () => {
                if (target.isDead)
                    return;
                let postDamage = this.postmods.apply(new Damage_1.Damage(new Set()));
                postDamage.apply(target);
                return null;
            }, null);
            state.addEvent(e);
        }
        get hasFollowup() {
            return this.postmods != null;
        }
    }
    exports.SkillResult = SkillResult;
    (function (SkillTiming) {
        SkillTiming[SkillTiming["Attack"] = 0] = "Attack";
        SkillTiming[SkillTiming["Spell"] = 1] = "Spell";
    })(exports.SkillTiming || (exports.SkillTiming = {}));
    var SkillTiming = exports.SkillTiming;
    class BasicAttackEffect {
        constructor() {
            this.name = 'Basic Attack Effect';
            this.tags = [0, 3];
        }
        execute(target, user, mods) {
            return new SkillResult(mods, null, null);
        }
    }
    class BasicAttack {
        constructor() {
            this.name = 'Basic Attack';
            this.timingBy = 0;
            this.timeMod = new StatMods.IncreasedAttackSpeed(0);
            this.effects = [new BasicAttackEffect()];
        }
        execute(target, user, mods) {
            let results = this.effects.map(effect => {
                return effect.execute(target, user, mods.clone());
            });
            return results;
        }
    }
    exports.BasicAttack = BasicAttack;
    class TossedBladeEffect {
        constructor() {
            this.name = 'Tossed Blade Effect';
            this.tags = [0, 4];
        }
        execute(target, user, mods) {
            let initial = new DamageMods_1.DamageModGroup();
            initial.add(new DamageModRegistry_1.Zero(), 2);
            let postDelay = ARPGState_2.TicksPerSecond * 0.3;
            let postmods = mods;
            return new SkillResult(initial, postmods, postDelay);
        }
    }
    class TossedBlade {
        constructor() {
            this.name = 'Tossed Blade';
            this.timingBy = 0;
            this.timeMod = new StatMods.IncreasedAttackSpeed(0.1);
            this.effects = [new TossedBladeEffect()];
        }
        execute(target, user, mods) {
            let results = this.effects.map(effect => {
                return effect.execute(target, user, mods.clone());
            });
            return results;
        }
    }
    exports.TossedBlade = TossedBlade;
});
define("Character", ["require", "exports", 'state-machine', "DamageMods", "StatMods", "ARPGState", "random"], function (require, exports, StateMachine, DamageMods_2, StatMods_1, ARPGState_3, random_1) {
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
        constructor(slot, damageMods, statMods) {
            this.slot = slot;
            this.damageMods = damageMods;
            this.statMods = statMods;
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
            return this.gear.reduce((prev, g) => {
                prev.push(...g.damageMods);
                return prev;
            }, []);
        }
        getStatMods() {
            return this.gear.reduce((prev, g) => {
                prev.push(...g.statMods);
                return prev;
            }, []);
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
        getMods() {
            return this.loadout.getMods();
        }
        get stats() {
            let base = this.loadout.getStatMods();
            base.push(this.skill.timeMod);
            let group = new StatMods_1.StatModGroup();
            base.forEach(mod => group.add(mod));
            return group.apply(new StatMods_1.Stats(StatMods_1.baseStatsArg));
        }
    }
    exports.Character = Character;
    class SkillContext {
        cancel() {
            this.event.cancel();
        }
    }
    class GlobalContext {
        constructor(base) {
            ({ stats: this.stats, skill: this.skill } = base);
        }
    }
    class CharacterState {
        constructor(character, state) {
            this.character = character;
            this.state = state;
            this.context = new GlobalContext(character);
        }
        applySkill(target, state) {
            let mods = new DamageMods_2.DamageModGroup();
            this.character.getMods().forEach(mod => {
                mods.add(mod, 1);
            });
            target.character.getMods().forEach(mod => {
                mods.add(mod, 0);
            });
            this.character.skill.execute(target, this, mods)
                .forEach(result => result.execute(target, state));
        }
        onenterengaged() {
            console.log('onenterengaged', this.current, this.scratch);
        }
        onengage(e, from, to, target) {
            this.context.target = target;
            this.decide();
        }
        ondecide() {
            if (this.target.isDead) {
                this.disengage();
            }
            console.log('ondecide', this.current);
            this.startskill();
            this.endskill();
        }
        onenterskillwait() {
            console.log('onenterskillwait', this.current);
            this.scratch = new SkillContext();
        }
        onstartskill() {
            console.log('onstartskill', this.current, this.scratch);
            let waitTime;
            switch (this.context.skill.timingBy) {
                case 0:
                    waitTime = this.context.stats.attackTime;
                    break;
                case 0:
                    waitTime = this.context.stats.castTime;
                    break;
                default:
                    throw Error('fell through timingBy switch');
            }
            console.log(this.state);
            let e = new ARPGState_3.Event(this.state.now + waitTime, (state) => {
                this.endskill();
                return null;
            }, null);
            this.scratch.event = e;
            this.scratch.skill = this.context.skill;
        }
        onbeforeendskill() {
            console.log('onbeforeendskill', this.current, this.scratch);
        }
        onleaveskillwait() {
            console.log('oneleaveskillwait', this.current);
            this.scratch = null;
        }
        ondie() {
            console.log('ondie', this.current);
        }
        get target() {
            return this.context.target;
        }
        get isDead() {
            return this.is('dead');
        }
    }
    exports.CharacterState = CharacterState;
    StateMachine.create({
        target: CharacterState.prototype,
        initial: 'idle',
        events: [
            { name: 'engage', from: 'idle', to: 'engaged' },
            { name: 'decide', from: 'engaged', to: 'deciding' },
            { name: 'startskill', from: 'deciding', to: 'skillwait' },
            { name: 'endskill', from: 'skillwait', to: 'engaged' },
            { name: 'disengage', from: 'engaged', to: 'idle' },
            { name: 'die', from: '*', to: 'dead' },
        ],
    });
});
define("entry", ["require", "exports", "ARPGState", "Character", "Damage", "DamageMods", "DamageModRegistry", 'seedrandom', "StatMods", "Skill"], function (require, exports, ARPGState_4, Character_1, Damage_2, DamageMods_3, DamageMods, SeedRandom, StatMods, Skills) {
    "use strict";
    let start = performance.now();
    class Orange {
        constructor(flavor) {
            this.flavor = flavor;
        }
    }
    exports.Orange = Orange;
    const globalState = new ARPGState_4.State();
    let nextEvent = new ARPGState_4.Event(0, (state) => null, (state) => null);
    globalState.addEvent(nextEvent);
    console.log('for fucks sake this works!');
    window.namespace = globalState;
    let d = new Damage_2.Damage(new Set([3]), 40, 10, 0, 10);
    let group = new DamageMods_3.DamageModGroup();
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
    let basicLoadout = new Character_1.LoadOut([
        new Character_1.Gear(2, [
            new DamageMods.LocalPhysical(2, 3),
            new DamageMods.LocalPhysical(2, 7),
            new DamageMods.Armor(10),
            new DamageMods.Armor(10),
        ], [
            new StatMods.FlatAddedHealth(10),
        ]),
    ]);
    let basex = new Character_1.Character(basicLoadout, new Skills.BasicAttack(), 'worseness');
    let basey = new Character_1.Character(basicLoadout, new Skills.TossedBlade(), 'worseness');
    let x = new Character_1.CharacterState(basex, globalState);
    let y = new Character_1.CharacterState(basey, globalState);
    console.log(x);
    x.engage(y);
    y.engage(x);
    x.applySkill(y, globalState);
    console.log(y.context);
    window.x = x;
    window.y = y;
    console.log(x);
    let end = performance.now();
    console.log(`took ${(end - start).toFixed(2)}ms`);
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkFSUEdTdGF0ZS50cyIsIkRhbWFnZS50cyIsIkRhbWFnZU1vZHMudHMiLCJTdGF0TW9kcy50cyIsInJhbmRvbS50cyIsIkRhbWFnZU1vZFJlZ2lzdHJ5LnRzIiwiU2tpbGwudHMiLCJDaGFyYWN0ZXIudHMiLCJlbnRyeS50cyIsImV4cG9ydGVkLnRzIiwiaGVsbG9Xb3JsZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztJQUVhLHNCQUFjLEdBQVcsR0FBRyxDQUFDO0lBSzdCLHdCQUFnQixHQUFHLElBQUksQ0FBQztJQUVyQztRQU9JO1lBSk8sUUFBRyxHQUFXLENBQUMsQ0FBQztZQUtuQixJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksYUFBYSxDQUFRO2dCQUNsQyxVQUFVLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLElBQUk7YUFDeEMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQztRQUtNLFFBQVEsQ0FBQyxDQUFRO1lBRXBCLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ3BCLE1BQU0sS0FBSyxDQUFDLHVDQUF1QyxDQUFDLENBQUM7WUFDekQsQ0FBQztZQUNELElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3hCLENBQUM7UUFNTSxJQUFJO1lBRVAsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUM7WUFHZCxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7WUFHbEIsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDO2dCQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUM7WUFFOUMsSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUM3QixPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxD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
