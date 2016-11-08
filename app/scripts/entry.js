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
            if (e === undefined)
                throw Error('undefined event');
            if (e.when < this.now)
                throw Error('event when before now');
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
                followups.filter(followup => Boolean(followup))
                    .forEach((followup) => this.addEvent(followup));
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
        get wasExecuted() {
            return this.used;
        }
    }
    exports.Event = Event;
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
define("Damage", ["require", "exports", "random"], function (require, exports, random_1) {
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
            this.criticalChance = 0.05;
            this.criticalMultiplier = 1.5;
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
            let sum = this.sum();
            if (random_1.rollSuccess(this.criticalChance)) {
                sum *= this.criticalMultiplier;
            }
            target.context.stats.health -= sum;
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
                return [bucket.reduce((prev, current) => {
                        if (current.sum) {
                            return current.sum(prev);
                        }
                        else {
                            throw 'attempting so sum unsummage';
                        }
                    })];
            }
            let used = new Set();
            return bucket.map((mod, topIndex) => {
                if (used.has(topIndex))
                    return null;
                used.add(topIndex);
                bucket.forEach((other, index) => {
                    if (used.has(index))
                        return null;
                    if (mod.summable && mod.sum && mod.summable(other)) {
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
define("Movement", ["require", "exports"], function (require, exports) {
    "use strict";
    exports.PositionBounds = {
        Extrema: [-100, 100],
        Starts: [-50, 50],
        ScreenSize: 100,
    };
    class Position {
        constructor(loc) {
            this.loc = loc;
        }
    }
    exports.Position = Position;
});
define("StatMods", ["require", "exports", "ARPGState", "Movement"], function (require, exports, ARPGState_1, Movement_1) {
    "use strict";
    exports.baseStatsArg = {
        Health: 50,
        Movespeed: (Movement_1.PositionBounds.ScreenSize / 2) / ARPGState_1.TicksPerSecond,
        AttackTime: ARPGState_1.TicksPerSecond / 1,
        CastTime: 0,
    };
    class Stats {
        constructor(base) {
            ({
                Health: this.health,
                Movespeed: this.movespeed,
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
    class IncreasedMovespeed {
        constructor(percent) {
            this.percent = percent;
            this.name = 'IncreasedMovespeed';
            this.canSum = true;
            this.position = 1;
        }
        apply(s) {
            s.movespeed *= (1 + this.percent);
            return s;
        }
        sum(other) {
            return new IncreasedMovespeed(this.percent + other.percent);
        }
    }
    exports.IncreasedMovespeed = IncreasedMovespeed;
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
    class IncreasedCritChance {
        constructor(percent) {
            this.percent = percent;
            this.name = 'IncreasedCritChanceDamageMod';
            this.canSum = true;
            this.direction = 1;
            this.reqTags = new Set();
            this.position = 5;
        }
        apply(d) {
            d.criticalChance *= 1 + this.percent;
            d.criticalChance = Math.min(d.criticalChance, 0.80);
            return d;
        }
        sum(other) {
            return new IncreasedCritChance(this.percent + other.percent);
        }
        clone() {
            return Object.assign(new IncreasedCritChance(0), this);
        }
    }
    exports.IncreasedCritChance = IncreasedCritChance;
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
                    return null;
                if (this.postmods) {
                    let postDamage = this.postmods.apply(new Damage_1.Damage(new Set()));
                    postDamage.apply(target);
                }
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
            return new SkillResult(mods, new DamageMods_1.DamageModGroup(), 0);
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
define("Character", ["require", "exports", 'state-machine', "DamageMods", "StatMods", "ARPGState", "random"], function (require, exports, StateMachine, DamageMods_2, StatMods_1, ARPGState_3, random_2) {
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
            this.identity = random_2.entityCode();
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
            let baseStats;
            ({ stats: baseStats, skill: this.skill } = base);
            this.baseStats = baseStats.clone();
            Object.freeze(this.baseStats);
            this.stats = baseStats.clone();
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
                return;
            }
            console.log('ondecide', this.current);
            this.startskill();
        }
        onenterskillwait() {
            console.log('onenterskillwait', this.current);
            this.scratch = new SkillContext();
        }
        onstartskill() {
            console.log('onstartskill', this.current, this.scratch);
            if (!this.scratch)
                throw 'onstartskill without scratch';
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
            this.state.addEvent(e);
        }
        onbeforeendskill() {
            console.log('onbeforeendskill', this.current, this.scratch);
            this.applySkill(this.target, this.state);
        }
        onendskill() {
            this.decide();
        }
        onleaveskillwait() {
            console.log('oneleaveskillwait', this.current);
            if (!this.scratch)
                throw 'onleaveskillwait without scratch';
            let { event } = this.scratch;
            if (!event.wasExecuted)
                event.cancel();
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
            { name: 'disengage', from: ['deciding', 'engaged'], to: 'idle' },
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
    window.globalState = globalState;
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
            new DamageMods.IncreasedCritChance(0.50),
        ], [
            new StatMods.FlatAddedHealth(10),
        ]),
        new Character_1.Gear(1, [], [
            new StatMods.IncreasedMovespeed(0.25),
        ]),
    ]);
    let basex = new Character_1.Character(basicLoadout, new Skills.BasicAttack(), 'worseness');
    let basey = new Character_1.Character(basicLoadout, new Skills.TossedBlade(), 'worseness');
    let x = new Character_1.CharacterState(basex, globalState);
    let y = new Character_1.CharacterState(basey, globalState);
    console.log(x);
    x.engage(y);
    y.engage(x);
    window.x = x;
    window.y = y;
    console.log(x);
    for (let i = 0; i < ARPGState_4.TicksPerSecond * 60 && !(x.isDead || y.isDead); i++) {
        let completed = globalState.step();
        if (completed > 0) {
            console.log(`retired ${completed} events`);
        }
    }
    console.log(y.context);
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
define("Pack", ["require", "exports", "Character"], function (require, exports, Character_2) {
    "use strict";
    class PackInit {
        constructor(character, behavior) {
            this.character = character;
            this.behavior = behavior;
        }
    }
    class Pack {
        constructor(inits, state) {
            this.states = [];
            inits.forEach(c => {
                this.states.push(new Character_2.CharacterState(c.character, state));
            });
        }
    }
});

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImFwcC9zY3JpcHRzL0FSUEdTdGF0ZS50cyIsImFwcC9zY3JpcHRzL3JhbmRvbS50cyIsImFwcC9zY3JpcHRzL0RhbWFnZS50cyIsImFwcC9zY3JpcHRzL0RhbWFnZU1vZHMudHMiLCJhcHAvc2NyaXB0cy9Nb3ZlbWVudC50cyIsImFwcC9zY3JpcHRzL1N0YXRNb2RzLnRzIiwiYXBwL3NjcmlwdHMvRGFtYWdlTW9kUmVnaXN0cnkudHMiLCJhcHAvc2NyaXB0cy9Ta2lsbC50cyIsImFwcC9zY3JpcHRzL0NoYXJhY3Rlci50cyIsImFwcC9zY3JpcHRzL2VudHJ5LnRzIiwiYXBwL3NjcmlwdHMvZXhwb3J0ZWQudHMiLCJhcHAvc2NyaXB0cy9QYWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0lBRWEsc0JBQWMsR0FBVyxHQUFHLENBQUM7SUFLN0Isd0JBQWdCLEdBQUcsSUFBSSxDQUFDO0lBRXJDO1FBT0k7WUFKTyxRQUFHLEdBQVcsQ0FBQyxDQUFDO1lBS25CLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxhQUFhLENBQVE7Z0JBQ2xDLFVBQVUsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUMsSUFBSTthQUN4QyxDQUFDLENBQUM7UUFDUCxDQUFDO1FBS00sUUFBUSxDQUFDLENBQVE7WUFFcEIsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLFNBQVMsQ0FBQztnQkFBQyxNQUFNLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1lBQ3BELEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQztnQkFBQyxNQUFNLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1lBRTVELEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ3BCLE1BQU0sS0FBSyxDQUFDLHVDQUF1QyxDQUFDLENB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QUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzFCLENBQUM7SUFGZSxjQUFNLFNBRXJCLENBQUE7Ozs7SUNDRDtRQUNJLFlBQW1CLFNBQW9CLEVBQVMsUUFBZ0I7WUFBN0MsY0FBUyxHQUFULFNBQVMsQ0FBVztZQUFTLGFBQVEsR0FBUixRQUFRLENBQVE7UUFBSSxDQUFDO0lBQ3pFLENBQUM7SUFFRDtRQUdJLFlBQVksS0FBc0IsRUFBRSxLQUFZO1lBRnpDLFdBQU0sR0FBMEIsRUFBRSxDQUFDO1lBR3RDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDWCxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLDBCQUFjLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQzdELENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQztJQUNMLENBQUM7SUFBQSIsImZpbGUiOiJlbnRyeS5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIFByaW9yaXR5UXVldWUgZnJvbSAnanMtcHJpb3JpdHktcXVldWUnO1xyXG5cclxuZXhwb3J0IGNvbnN0IFRpY2tzUGVyU2Vjb25kOiBudW1iZXIgPSAxMDA7XHJcblxyXG4vKlxyXG4gICAgTWF4aW11bSBudW1iZXIgb2YgZXZlbnRzIHdlIGFsbG93IHRoZSBTdGF0ZSB0byByZXRpcmUgZXZlcnkgc2Vjb25kLlxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IE1heEV2ZW50c1BlclRpY2sgPSAxMDAwO1xyXG5cclxuZXhwb3J0IGNsYXNzIFN0YXRlIHtcclxuXHJcbiAgICAvKiogQ3VycmVudCB0aWNrIHRoZSBzaW11bGFpdG9uIGlzIGF0ICovXHJcbiAgICBwdWJsaWMgbm93OiBudW1iZXIgPSAwO1xyXG5cclxuICAgIHByaXZhdGUgcXVldWU6IFByaW9yaXR5UXVldWU8RXZlbnQ+O1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKCkge1xyXG4gICAgICAgIHRoaXMucXVldWUgPSBuZXcgUHJpb3JpdHlRdWV1ZTxFdmVudD4oe1xyXG4gICAgICAgICAgICBjb21wYXJhdG9yOiAoYSwgYikgPT4gYS53aGVuIC0gYi53aGVuLFxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQWRkIGFuIGV2ZW50IHRvIGJlIGV4ZWN1dGVkIGluIHRoZSBmdXR1cmUgdG8gdGhlIHF1ZXVlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBhZGRFdmVudChlOiBFdmVudCkge1xyXG4gICAgICAgIC8vIFNhbml0eSBjaGVjayBpbmNvbWluZyBldmVudHNcclxuICAgICAgICBpZiAoZSA9PT0gdW5kZWZpbmVkKSB0aHJvdyBFcnJvcigndW5kZWZpbmVkIGV2ZW50Jyk7XHJcbiAgICAgICAgaWYgKGUud2hlbiA8IHRoaXMubm93KSB0aHJvdyBFcnJvcignZXZlbnQgd2hlbiBiZWZvcmUgbm93Jyk7XHJcbiAgICAgICAgLy8gUmVmdXNlIHRvIGFkZCBzdGFsZSBpdGVtcyB0byB0aGUgcXVldWVcclxuICAgICAgICBpZiAoZS53aGVuIDwgdGhpcy5ub3cpIHtcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoJ3Byb3ZpZGVkIGV2ZW50IGhhcyB3aGVuIGxlc3MgdGhhbiBub3cnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5xdWV1ZS5xdWV1ZShlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENvbnRpbnVlIG9uZSB0aWNrIGluIHRoZSBzaW11bGF0aW9uIGFuZCByZXR1cm5cclxuICAgICAqIG51bWJlciBvZiBldmVudHMgcmV0aXJlZC5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0ZXAoKTogbnVtYmVyIHtcclxuICAgICAgICAvLyBJbmNyZW1lbnQgY3VycmVudCB0aW1lLlxyXG4gICAgICAgIHRoaXMubm93ICs9IDE7XHJcblxyXG4gICAgICAgIC8vIE5vdGUgbnVtYmVyIG9mIGV2ZW50cyByZXRpcmVkXHJcbiAgICAgICAgbGV0IGNvbXBsZXRlZCA9IDA7XHJcblxyXG4gICAgICAgIC8vIE5vdGhpbmcgdG8gZG8sIGxlYXZlXHJcbiAgICAgICAgaWYgKHRoaXMucXVldWUubGVuZ3RoID09PSAwKSByZXR1cm4gY29tcGxldGVkO1xyXG5cclxuICAgICAgICBsZXQgbmV4dCA9IHRoaXMucXVldWUucGVlaygpO1xyXG4gICAgICAgIHdoaWxlICghKHRoaXMucXVldWUubGVuZ3RoID09PSAwKSAmJlxyXG4gICAgICAgICAgICBuZXh0LndoZW4gPD0gdGhpcy5ub3cgJiZcclxuICAgICAgICAgICAgY29tcGxldGVkIDwgTWF4RXZlbnRzUGVyVGljaykge1xyXG5cclxuICAgICAgICAgICAgLy8gUmVtb3ZlIGxvd2VzdCBldmVudCBmcm9tIHF1ZXVlXHJcbiAgICAgICAgICAgIGxldCBlID0gdGhpcy5xdWV1ZS5kZXF1ZXVlKCk7XHJcblxyXG4gICAgICAgICAgICAvLyBBcHBseSBldmVudCBhbmQgaGFuZGxlIGFueSB0cnV0aHkgc2NoZWR1bGVkIGZvbGxvd3Vwc1xyXG4gICAgICAgICAgICBsZXQgZm9sbG93dXBzID0gZS5hcHBseSh0aGlzKTtcclxuICAgICAgICAgICAgZm9sbG93dXBzLmZpbHRlcihmb2xsb3d1cCA9PiBCb29sZWFuKGZvbGxvd3VwKSlcclxuICAgICAgICAgICAgICAgIC5mb3JFYWNoKChmb2xsb3d1cCkgPT4gdGhpcy5hZGRFdmVudChmb2xsb3d1cCkpO1xyXG5cclxuICAgICAgICAgICAgY29tcGxldGVkKys7XHJcbiAgICAgICAgICAgIGlmIChjb21wbGV0ZWQgPiBNYXhFdmVudHNQZXJUaWNrKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBFcnJvcihgbW9yZSB0aGFuICR7TWF4RXZlbnRzUGVyVGlja30gcmV0aXJlZCBpbiB0aWNrYCk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmICh0aGlzLnF1ZXVlLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgICAgIG5leHQgPSB0aGlzLnF1ZXVlLnBlZWsoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIGNvbXBsZXRlZDtcclxuICAgIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEEgZnVuY3Rpb24gdGFraW5nIHN0YXRlIGFuZCBwZXJmb3JtaW5nXHJcbiAqIGFuIGFjdGlvbiBiYXNlZCBvbiBzdG9yZWQgY29udGV4dC5cclxuICpcclxuICogSXQgbWF5IHJldHVybiBudWxsIHRvIGluZGljYXRlIG5vIGZvbGxvd3VwIHNob3VsZCBiZSBzY2hlZHVsZWQuXHJcbiAqL1xyXG5leHBvcnQgdHlwZSBHZW5lcmFsRWZmZWN0ID0gKHN0YXRlOiBTdGF0ZSkgPT4gRXZlbnQgfCBudWxsO1xyXG5cclxuZXhwb3J0IGNsYXNzIEV2ZW50IHtcclxuICAgIHByaXZhdGUgdXNlZDogQm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgcHJpdmF0ZSBjYW5jZWxsZWQ6IEJvb2xlYW4gPSBmYWxzZTtcclxuICAgIHByaXZhdGUgZGVsYXllZDogQm9vbGVhbiA9IGZhbHNlO1xyXG5cclxuICAgIHByaXZhdGUgbmV3V2hlbjogbnVtYmVyO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHB1YmxpYyB3aGVuOiBudW1iZXIsXHJcbiAgICAgICAgcHVibGljIGFjdGlvbjogR2VuZXJhbEVmZmVjdCxcclxuICAgICAgICBwdWJsaWMgcG9zdDogR2VuZXJhbEVmZmVjdCB8IG51bGwpIHtcclxuXHJcbiAgICAgICAgaWYgKCF0aGlzLmFjdGlvbikgdGhyb3cgRXJyb3IoJ2ludmFsaWQgcGFzc2VkIGFjdGlvbicpO1xyXG4gICAgICAgIGlmIChpc05hTih0aGlzLndoZW4pKSB0aHJvdyBFcnJvcignaW52YWxpZCBwYXNzZWQgd2hlbjogTmFOJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQZXJmb3JtIHRoZSBhY3Rpb24gYW5kIG9wdGlvbmFsIHBvc3QgYXNzb2NpYXRlZCB3aXRoIHRoaXMgRXZlbnRcclxuICAgICAqL1xyXG4gICAgcHVibGljIGFwcGx5KHN0YXRlOiBTdGF0ZSk6IEFycmF5PEV2ZW50PiB7XHJcbiAgICAgICAgLy8gUHJldmVudCBtdWx0aXBsZSB1c2VzIG9mIHNhbWUgZXZlbnRcclxuICAgICAgICBpZiAodGhpcy51c2VkKSB7XHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCdjYW5ub3QgYXBwbHkgYWxyZWFkeSB1c2VkIGV2ZW50Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMudXNlZCA9IHRydWU7XHJcblxyXG4gICAgICAgIC8vIE5PUCBpZiB3ZSd2ZSBiZWVuIGNhbmNlbGxlZFxyXG4gICAgICAgIGlmICh0aGlzLmNhbmNlbGxlZCkge1xyXG4gICAgICAgICAgICByZXR1cm4gW107XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBSZXR1cm4gYSBmcmVzaCBjb3B5IG9mIHRoaXMgZXZlbnQgaWYgd2UndmUgYmVlbiBkZWxheWVkXHJcbiAgICAgICAgaWYgKHRoaXMuZGVsYXllZCkge1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMubmV3V2hlbikge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgRXJyb3IoJ0V2ZW50IGRlbGF5ZWQgYnV0IG5vIG5ld1doZW4gcHJlc2VudCcpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiBbbmV3IEV2ZW50KHRoaXMubmV3V2hlbiwgdGhpcy5hY3Rpb24sIHRoaXMucG9zdCldO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gRXhlY3V0ZSBhY3Rpb25zIFxyXG4gICAgICAgIGxldCBmb2xsb3d1cHM6IEFycmF5PEV2ZW50IHwgbnVsbD4gPSBbXTtcclxuXHJcbiAgICAgICAgLy8gUGVyZm9ybSBpbml0aWFsIGFjdGlvbiBhbmQgZm9sbG93dXAsIGlmIGl0IGV4aXN0c1xyXG4gICAgICAgIGZvbGxvd3Vwcy5wdXNoKHRoaXMuYWN0aW9uKHN0YXRlKSk7XHJcbiAgICAgICAgaWYgKHRoaXMucG9zdCkgZm9sbG93dXBzLnB1c2godGhpcy5wb3N0KHN0YXRlKSk7XHJcbiAgICAgICAgLy8gUmV0dXJuIG9ubHkgbm9uLW51bGwgZm9sbG93dXBzXHJcbiAgICAgICAgcmV0dXJuIDxBcnJheTxFdmVudD4+Zm9sbG93dXBzLmZpbHRlcigoZSkgPT4gZSAhPT0gbnVsbCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDYW5jZWwgdGhlIGV4ZXVjdGlvbiBvZiB0aGlzIGV2ZW50LlxyXG4gICAgICpcclxuICAgICAqIFRoaXMgbWF5IGJlIGNhbGxlZCBtdWx0aXBsZSB0aW1lcy5cclxuICAgICAqXHJcbiAgICAgKiBOb3RlIHRoYXQgdGhpcyBpcyBoYW5kbGVkIGJ5IG1ha2luZyBhcHBseSBhIG5vcC5cclxuICAgICAqL1xyXG4gICAgcHVibGljIGNhbmNlbCgpIHtcclxuICAgICAgICB0aGlzLmNhbmNlbGxlZCA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBEZWZlciBleGVjdXRpb24gb2YgdGhpcyBldmVudCB0byBhIGxhdGVyIHRpbWVcclxuICAgICAqXHJcbiAgICAgKiBUaGlzIG1heSBiZSBjYWxsZWQgbXVsdGlwbGUgdGltZXMuXHJcbiAgICAgKlxyXG4gICAgICogTm90ZSB0aGF0IHRoaXMgaXMgaGFuZGxlZCBpbiBhcHBseSBieSByZXR1cm5pbmcgYSBmcmVzaCxcclxuICAgICAqIGVxdWl2YWxlbnQgRXZlbnQgaW5zdGFuY2Ugd2l0aCB0aGUgbmV3V2hlblxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZGVsYXkobmV3V2hlbjogbnVtYmVyKSB7XHJcbiAgICAgICAgLy8gRW5zdXJlIHRoZSBuZXcgZXhlY3V0aW9uIHRpbWUgaXMgYWZ0ZXIgdGhlIGluaXRpYWwgdGltZVxyXG4gICAgICAgIGlmICh0aGlzLndoZW4gPCBuZXdXaGVuKSB7XHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCdjYW5ub3QgZGVsYXkgdG8gbGVzcyB0aGFuIGluaXRpYWwgd2hlbicpO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBFbnN1cmUgd2UgY2FuIG9ubHkgYmUgZGVsYXllZCB0byBhIGxhdGVyIHRpbWVcclxuICAgICAgICAvLyB3aGVuIGhhbmRsaW5nIG11bHRpcGxlIGRlbGF5c1xyXG4gICAgICAgIGlmICh0aGlzLmRlbGF5ZWQgJiYgdGhpcy5uZXdXaGVuIDwgbmV3V2hlbikge1xyXG4gICAgICAgICAgICB0aHJvdyBFcnJvcignY2Fubm90IGRlbGF5IHRvIGxlc3MgdGhhbiBwcmV2aW91cyBkZWxheScpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gU2V0IHRoZSBkZWxheWVkIGZsYWcgYW5kIG5vdGUgd2hlbiB3ZSBzaG91bGQgZXhlY3V0ZVxyXG4gICAgICAgIHRoaXMuZGVsYXllZCA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5uZXdXaGVuID0gbmV3V2hlbjtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgZ2V0IHdhc0V4ZWN1dGVkKCkge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnVzZWQ7XHJcbiAgICB9XHJcbn1cclxuIiwiLyoqIENhbGN1bGF0ZSBhIHJhbmRvbSBpbnQgZnJvbSBhbiBpbnRlcnZhbCAqL1xyXG5leHBvcnQgZnVuY3Rpb24gaW50ZnJvbUludGVydmFsKG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IG51bWJlciB7XHJcbiAgICByZXR1cm4gTWF0aC5mbG9vcigoTWF0aC5yYW5kb20oKSAqIChtYXggLSBtaW4gKyAxKSkgKyBtaW4pO1xyXG59XHJcblxyXG4vKiogUmV0dXJuIGEgbmV3IGhleGFkZWNpbWFsIGVudGl0eSBjb2RlICovXHJcbmV4cG9ydCBmdW5jdGlvbiBlbnRpdHlDb2RlKCk6IHN0cmluZyB7XHJcbiAgICBsZXQgY29kZSA9IG5ldyBBcnJheTxzdHJpbmc+KCk7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8PSAxOyBpKyspIHtcclxuICAgICAgICBjb2RlLnB1c2goaW50ZnJvbUludGVydmFsKDAsIDI1NSkudG9TdHJpbmcoMTYpKTtcclxuICAgIH1cclxuICAgIHJldHVybiBjb2RlLmpvaW4oJycpO1xyXG59XHJcblxyXG4vKiogXHJcbiAqIFJvbGwgZm9yIHN1Y2Nlc3Mgb2YgYW4gYWN0aW9uXHJcbiAqXHJcbiAqIHByb2JhYmlsaXR5IGluIHJhbmdlIFswLCAxXVxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHJvbGxTdWNjZXNzKHByb2JhYmlsaXR5OiBudW1iZXIpOiBCb29sZWFuIHtcclxuICAgIHJldHVybiBwcm9iYWJpbGl0eSA+IE1hdGgucmFuZG9tKCk7XHJcbn1cclxuIiwiaW1wb3J0IHsgQ2hhcmFjdGVyU3RhdGUgfSBmcm9tICcuL0NoYXJhY3Rlcic7XHJcbmltcG9ydCB7IHJvbGxTdWNjZXNzIH0gZnJvbSAnLi9yYW5kb20nO1xyXG5cclxuZXhwb3J0IGNvbnN0IGVudW0gRWxlbWVudHMge1xyXG4gICAgRmlyZSA9IDAsXHJcbiAgICBMaWdodCxcclxuICAgIENvbGQsXHJcbn1cclxuXHJcbmV4cG9ydCBjb25zdCBlbnVtIERhbWFnZVRhZyB7XHJcbiAgICAvLyBUb3AgbGV2ZWwgdGFncyB0aGF0IG11c3QgYmUgYXR0YWNoZWQgdG8gRGFtYWdlXHJcbiAgICBBdHRhY2ssIFNwZWxsLCBET1QsXHJcbiAgICBNZWxlZSwgUmFuZ2VkLFxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgRGFtYWdlIHtcclxuICAgIC8qKiBDaGFuY2UgZm9yIERhbWFnZSBhcHBsaWNhdGlvbiB0byBiZSBhIGNyaXRpY2FsIHN0cmlrZSAqL1xyXG4gICAgcHVibGljIGNyaXRpY2FsQ2hhbmNlID0gMC4wNTtcclxuICAgIC8qKiBNdWx0aXBsaWVyIGFwcGxpZWQgdG8gY3JpdGljYWwgc3RyaWtlcyAqL1xyXG4gICAgcHVibGljIGNyaXRpY2FsTXVsdGlwbGllciA9IDEuNTtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgdGFnczogU2V0PERhbWFnZVRhZz4sXHJcbiAgICAgICAgcHVibGljIHBoeXM6IG51bWJlciA9IDAsXHJcbiAgICAgICAgcHVibGljIGZpcmU6IG51bWJlciA9IDAsXHJcbiAgICAgICAgcHVibGljIGxpZ2h0OiBudW1iZXIgPSAwLFxyXG4gICAgICAgIHB1YmxpYyBjb2xkOiBudW1iZXIgPSAwKSB7IH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJldHVybnMgdGhlIG1hZ25pdHVkZSBvZiB0aGUgZWxlbWVudCBvbiB0aGlzIERhbWFnZS5cclxuICAgICAqXHJcbiAgICAgKiBUaGlzIGFsbG93cyBlbGVtZW50cyB0byBiZSBzdG9yZWQgYXMgdG9wIGxldmVsIHByb3BlcnRpZXNcclxuICAgICAqIHdoaWxlIGFsc28gYWxsb3dpbmcgZm9yIG1vcmUgZ2VuZXJhbCBEYW1hZ2VNb2RzXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRFbGVtZW50KGVsZW1lbnQ6IEVsZW1lbnRzKTogbnVtYmVyIHtcclxuICAgICAgICBsZXQgbWFnbml0dWRlOiBudW1iZXI7XHJcbiAgICAgICAgc3dpdGNoIChlbGVtZW50KSB7XHJcbiAgICAgICAgICAgIGNhc2UgRWxlbWVudHMuRmlyZTpcclxuICAgICAgICAgICAgICAgIG1hZ25pdHVkZSA9IHRoaXMuZmlyZTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEVsZW1lbnRzLkxpZ2h0OlxyXG4gICAgICAgICAgICAgICAgbWFnbml0dWRlID0gdGhpcy5saWdodDtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEVsZW1lbnRzLkNvbGQ6XHJcbiAgICAgICAgICAgICAgICBtYWduaXR1ZGUgPSB0aGlzLmNvbGQ7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIHRocm93IEVycm9yKCdmZWxsIHRocm91Z2ggRWxlbWVudHMgc3dpdGNoJyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gbWFnbml0dWRlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0IHRoZSBtYWduaXR1ZGUgb2YgdGhlIGVsZW1lbnQgb24gdGhpcyBEYW1hZ2UuXHJcbiAgICAgKlxyXG4gICAgICogVGhpcyBhbGxvd3MgZWxlbWVudHMgdG8gYmUgc3RvcmVkIGFzIHRvcCBsZXZlbCBwcm9wZXJ0aWVzXHJcbiAgICAgKiB3aGlsZSBhbHNvIGFsbG93aW5nIGZvciBtb3JlIGdlbmVyYWwgRGFtYWdlTW9kc1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0RWxlbWVudChlbGVtZW50OiBFbGVtZW50cywgbWFnbml0dWRlOiBudW1iZXIpIHtcclxuICAgICAgICBzd2l0Y2ggKGVsZW1lbnQpIHtcclxuICAgICAgICAgICAgY2FzZSBFbGVtZW50cy5GaXJlOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5maXJlID0gbWFnbml0dWRlO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgRWxlbWVudHMuTGlnaHQ6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxpZ2h0ID0gbWFnbml0dWRlO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgRWxlbWVudHMuQ29sZDpcclxuICAgICAgICAgICAgICAgIHRoaXMuY29sZCA9IG1hZ25pdHVkZTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgdGhyb3cgRXJyb3IoJ2ZlbGwgdGhyb3VnaCBFbGVtZW50cyBzd2l0Y2gnKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFxyXG4gICAgICogQXBwbHkgdGhpcyBEYW1hZ2UgdG8gYSB0YXJnZXRcclxuICAgICAqXHJcbiAgICAgKiBUT0RPOiBoYW5kbGUgY29uZGl0aW9ucyBhbmQgc3VjaC5cclxuICAgICAqL1xyXG4gICAgcHVibGljIGFwcGx5KHRhcmdldDogQ2hhcmFjdGVyU3RhdGUpIHtcclxuICAgICAgICAvLyBDYWxjdWxhdGUgc3VtXHJcbiAgICAgICAgbGV0IHN1bSA9IHRoaXMuc3VtKCk7XHJcblxyXG4gICAgICAgIC8vIENoZWNrIGlmIGNyaXQgYW5kIFxyXG4gICAgICAgIC8vIFRPRE86IHNldCBjb25kaXRpb24gY2hhbmNlIHRvIDEwMCUgZm9yIHJlbGV2YW50IGRhbWFnZSB0eXBlcy4uLlxyXG4gICAgICAgIGlmIChyb2xsU3VjY2Vzcyh0aGlzLmNyaXRpY2FsQ2hhbmNlKSkge1xyXG4gICAgICAgICAgICBzdW0gKj0gdGhpcy5jcml0aWNhbE11bHRpcGxpZXI7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBBcHBseSBzdW1tZWQgZGFtYWdlIHRvIGhlYWx0aC5cclxuICAgICAgICB0YXJnZXQuY29udGV4dC5zdGF0cy5oZWFsdGggLT0gc3VtO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGUgdGFyZ2V0IGlzIGRlYWQsIG1hcmsgdGhlbSBhcyBzdWNoXHJcbiAgICAgICAgaWYgKHRhcmdldC5jb250ZXh0LnN0YXRzLmhlYWx0aCA8IDApIHtcclxuICAgICAgICAgICAgdGFyZ2V0LmRpZSgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gVE9ETzogaGFuZGxlIGFwcGx5aW5nIGNvbmRpdGlvbnMuLi5cclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc3VtKCk6IG51bWJlciB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMucGh5cyArIHRoaXMuZmlyZSArIHRoaXMubGlnaHQgKyB0aGlzLmNvbGQ7XHJcbiAgICB9XHJcbn1cclxuIiwiaW1wb3J0IHsgRGFtYWdlLCBEYW1hZ2VUYWcgfSBmcm9tICcuL0RhbWFnZSc7XHJcblxyXG4vKipcclxuICogVGhlIGFic29sdXRlIG9yZGVyaW5nIG9mIERhbWFnZU1vZHMuXHJcbiAqXHJcbiAqIEEgZGFtYWdlIG1vZCB3aXRoIGEgbG93ZXIgaW5kZXggaXMgYXBwbGllZCBiZWZvcmUgYSBkYW1hZ2VcclxuICogbW9kIHdpdGggYSBoaWdoZXIgaW5kZXguXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgZW51bSBEYW1hZ2VNb2RPcmRlciB7XHJcbiAgICAvKipcclxuICAgICAqIE1vZHMgZWZmZWN0aW5nIGJhc2UgZGFtYWdlXHJcbiAgICAgKlxyXG4gICAgICogaWUsIHRob3NlIGZvdW5kIG9uIHdlYXBvbnMgb3Igc3BlbGwgc2tpbGxzXHJcbiAgICAgKi9cclxuICAgIExvY2FsID0gMCxcclxuICAgIC8qKlxyXG4gICAgICogRmxhdCBhZGRlZCBkYW1hZ2VcclxuICAgICAqXHJcbiAgICAgKiBpZSwgZXF1aXBtZW50IG9yIHNraWxsIGVmZmVjdHNcclxuICAgICAqL1xyXG4gICAgQWRkZWREYW1hZ2UsXHJcbiAgICAvKipcclxuICAgICAqIFNjYWxpbmcgJ0Jhc2UgRGFtYWdlJ1xyXG4gICAgICpcclxuICAgICAqIGllLCBEZWFscyAlIG9mIEJhc2UgQXR0YWNrIERhbWFnZVxyXG4gICAgICpcclxuICAgICAqIE1hcmsgb2YgR0dHOlxyXG4gICAgICogICAgICdZb3VyIEJhc2UgQXR0YWNrIGRhbWFnZSBpcyB0aGVcclxuICAgICAqICAgICAgZGFtYWdlIGxpc3RlZCBvbiB5b3VyIHdlYXBvbiwgcGx1cyBhbnkgYWRkZWQgZGFtYWdlLFxyXG4gICAgICogICAgICBhbmQgdGhhdCdzIHdoYXQncyBtb2RpZmllZCBieSB0aG9zZSBzdGF0cyBvbiBhdHRhY2sgc2tpbGxzLidcclxuICAgICAqL1xyXG4gICAgQmFzZURhbWFnZVNjYWxlLFxyXG4gICAgLyoqXHJcbiAgICAgKiBDb252ZXJzaW9uIG1vZGlmaWVzIGRlc3RydWN0aXZlbHkgY2hhbmdpbmcgb25lIGRhbWFnZSB0eXBlIHRvIGFub3RoZXJcclxuICAgICAqXHJcbiAgICAgKiBpZSwgJSBvZiBDb2xkIERhbWFnZSBDb252ZXJ0ZWQgdG8gRmlyZSBEYW1hZ2VcclxuICAgICAqL1xyXG4gICAgQ29udmVydFRvLFxyXG4gICAgLyoqXHJcbiAgICAgKiBDb252ZXJzaW9uIGZyb20gb25lIGRhbWFnZSB0eXBlIHRvIGFub3RoZXIgd2l0aG91dCBjaGFuZ2luZ1xyXG4gICAgICogdGhlIG9yaWdpbmFsIHR5cGVcclxuICAgICAqXHJcbiAgICAgKiBpZSwgJ2dhaW4gJSBvZiBwaHlzIGFzIGV4dHJhIGNvbGQnXHJcbiAgICAgKi9cclxuICAgIEFkZGVkQ29udmVydCxcclxuICAgIC8qKlxyXG4gICAgICogQWRkaXRpdmUgbW9kaWZpZXJzIGZyb20gYW55IHNvdXJjZVxyXG4gICAgICpcclxuICAgICAqIGllLCAnaW5jcmVhc2VkJyBhbmQgJ3JlZHVjZWQnXHJcbiAgICAgKi9cclxuICAgIEdsb2JhbEFkZCxcclxuICAgIC8qKlxyXG4gICAgICogTXVsdGlwbGljYXRpdmUgbW9kaWZpZXJzIGZyb20gYW55IHNvdXJjZVxyXG4gICAgICpcclxuICAgICAqIGllLCAnbW9yZScgYW5kICdsZXNzJ1xyXG4gICAgICovXHJcbiAgICBHbG9iYWxNdWx0LFxyXG4gICAgLyoqXHJcbiAgICAgKiBNaXNjZWxsYW5lb3VzIG1vZGlmaWVycyBhcHBsaWVkIGJlZm9yZSBtaXRpZ2F0aW9uXHJcbiAgICAgKlxyXG4gICAgICogaWUsIG4gb2YgMyBwcm9qZWN0aWxlcyBjb2xsaWRpbmdcclxuICAgICAqL1xyXG4gICAgUG9zdEluaXRpYWwsXHJcbiAgICAvKipcclxuICAgICAqIERpc3RhbmNlIGJldHdlZW4gdHdvIGVudGl0aWVzIGVmZmVjdGluZyBzY2FsaW5nXHJcbiAgICAgKlxyXG4gICAgICogVGhlcmUgc2hvdWxkIGJlIG9ubHkgYSBzaW5nbGUgUmFuZ2UgbW9kaWZpZXIuXHJcbiAgICAgKi9cclxuICAgIFJhbmdlLFxyXG4gICAgLyoqXHJcbiAgICAgKiBNaXRpZ2F0aW9uc1xyXG4gICAgICpcclxuICAgICAqIGllLCBhcm1vciBmb3IgcGh5c2ljYWwgZGFtYWdlIG9yIHJlc2lzdHMgZm9yIGVsZW1lbnRhbFxyXG4gICAgICovXHJcbiAgICBNaXRpZ2F0aW9uLFxyXG59XHJcblxyXG4vKiogXHJcbiAqIFBvc3NpYmxlIGRpcmVjdGlvbiBhIERhbWFnZU1vZCByZXF1aXJlcyBpbiBvcmRlciB0byBiZSBhcHBsaWVkLlxyXG4gKlxyXG4gKiBBcyBtaXRpZ2F0aW9ucyBhcmUgaW5jbHVkZWQgYXMgRGFtYWdlTW9kcywgdGhpcyBwcmV2ZW50cyBhIENoYXJhY3RlclxyXG4gKiBmcm9tIG1pdGlnYXRpbmcgdGhlIGRhbWFnZSB0aGV5IGRlYWwuXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgZW51bSBEYW1hZ2VNb2REaXJlY3Rpb24ge1xyXG4gICAgLyoqIEFwcGx5IHRoaXMgbW9kIG9ubHkgd2hlbiB0YWtpbmcgcmVjZWl2aW5nIGRhbWFnZSAqL1xyXG4gICAgVGFraW5nID0gMCxcclxuICAgIC8qKiBBcHBseSB0aGlzIG1vZCBvbmx5IHdoZW4gZGVhbGluZyBkYW1hZ2UgKi9cclxuICAgIERlYWxpbmcsXHJcbiAgICAvKiogQWx3YXlzIGFwcGx5IHRoaXMgbW9kICovXHJcbiAgICBBbHdheXNcclxufVxyXG5cclxuLyoqIEFueSBEYW1hZ2UgTW9kaWZpZXIgdGhhdCBlZmZlY3RzIHRoZSBjYWxjdWxhdGlvbiBvZiBkYW1hZ2UgKi9cclxuZXhwb3J0IGludGVyZmFjZSBJRGFtYWdlTW9kIHtcclxuICAgIC8qKiBOYW1lIG9mIGEgRGFtYWdlTW9kICovXHJcbiAgICBuYW1lOiBTdHJpbmc7XHJcbiAgICAvKiogV2hldGhlciBvciBub3QgdGhlIERhbWFnZU1vZCBjYW4gYmUgcmVhc29uYWJseSBzdW1tZWQgKi9cclxuICAgIGNhblN1bTogQm9vbGVhbjtcclxuICAgIC8qKlxyXG4gICAgICogVGhlIHNldCBvZiBEYW1hZ2VUYWcgZW51bXMgdGhhdCBhbGwgbXVzdFxyXG4gICAgICogYmUgcHJlc2VudCBmb3IgdGhlIG1vZCB0byBiZSBhcHBsaWVkLlxyXG4gICAgICpcclxuICAgICAqIFRoaXMgbXVzdCBiZSBjb25zdGFudCBhY3Jvc3MgYWxsIERhbWFnZU1vZHMgd2l0aCB0aGUgc2FtZSBuYW1lLlxyXG4gICAgICovXHJcbiAgICByZXFUYWdzOiBTZXQ8RGFtYWdlVGFnPjtcclxuICAgIC8qKiBUaGUgcG9pbnQgdGhpcyBEYW1hZ2VNb2QgaXMgYXBwbGllZCByZWxhdGl2ZSB0byBvdGhlciBEYW1hZ2VNb2RzICovXHJcbiAgICBwb3NpdGlvbjogRGFtYWdlTW9kT3JkZXI7XHJcbiAgICAvKipcclxuICAgICAqIFRoZSBkaXJlY3Rpb24gdGhpcyBEYW1hZ2VNb2QgcmVxdWlyZXMgdG8gYmUgYXBwbGllZFxyXG4gICAgICpcclxuICAgICAqIERhbWFnZU1vZEdyb3VwIGlzIHJlcXVpcmVkIHRvIHNpbGVudGx5IGRyb3AgbW9kcyBvZiB0aGUgaW5jb3JyZWN0XHJcbiAgICAgKiBkaXJlY3Rpb24gd2hlbiBhZGRpbmcgdGhlbS5cclxuICAgICAqL1xyXG4gICAgZGlyZWN0aW9uOiBEYW1hZ2VNb2REaXJlY3Rpb247XHJcbiAgICAvKiogQXBwbHkgdGhlIERhbWFnZU1vZCB0byBwcm92aWRlZCBEYW1hZ2UgKi9cclxuICAgIGFwcGx5KGQ6IERhbWFnZSk6IERhbWFnZTtcclxuICAgIC8qKiBcclxuICAgICAqIENyZWF0ZSBhIG5ldyBEYW1hZ2VNb2Qgd2l0aCBlcXVpdmFsZW50IGZ1bmN0aW9uYWxpdHlcclxuICAgICAqXHJcbiAgICAgKiBUaGlzIGFsbG93cyBhIERhbWFnZU1vZEdyb3VwIHRvIGJlIGNsb25lZC5cclxuICAgICAqL1xyXG4gICAgY2xvbmUoKTogSURhbWFnZU1vZDtcclxuICAgIC8qKiBTdW0gdHdvIElEYW1nZU1vZCBpbnN0YW5jZXMgb2YgdGhlIHNhbWUgbmFtZSB3aXRoIGNhblN1bSB0cnVlICovXHJcbiAgICBzdW0/KG90aGVyOiBJRGFtYWdlTW9kKTogSURhbWFnZU1vZDtcclxuICAgIC8qKlxyXG4gICAgICogRGV0ZXJtaW5lIGlmIHR3byBEYW1hZ2VNb2RzIHdpdGggZXF1YWwgbmFtZXMgY2FuIGJlIHN1bW1lZC5cclxuICAgICAqXHJcbiAgICAgKiBUaGlzIGlzIG9wdGlvbmFsIGFuZCBpcyBjaGVja2VkIGFzIG5lY2Vzc2FyeS5cclxuICAgICAqL1xyXG4gICAgc3VtbWFibGU/KG90aGVyOiBJRGFtYWdlTW9kKTogQm9vbGVhbjtcclxufVxyXG5cclxuLyoqXHJcbiAqIEEgc2V0IG9mIERhbWFnZU1vZHMgd2hpY2ggYXJlIGFwcGxpZWQgYXMgYW4gYXRvbWljIG9wZXJhdGlvbi5cclxuICpcclxuICogVGhpcyBlbmZvcmNlcyB0aGUgYXBwbGljYXRpb24gb3JkZXIgYW5kIHN1bW1hdGlvbiBvZiBpdHMgdW5kZXJseWluZyBtb2RzLlxyXG4gKi9cclxuZXhwb3J0IGNsYXNzIERhbWFnZU1vZEdyb3VwIHtcclxuXHJcbiAgICAvKiogUmV0dXJuIGFsbCBzdW1tYWJsZSBtb2RzIGFzIHRoZWlyIHN1bXMgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHN1bShtb2RzOiBBcnJheTxJRGFtYWdlTW9kPik6IEFycmF5PElEYW1hZ2VNb2Q+IHtcclxuICAgICAgICBsZXQgc3VtbWVkID0gbmV3IEFycmF5PElEYW1hZ2VNb2Q+KCk7XHJcblxyXG4gICAgICAgIC8vIEJ1Y2tldHMgb2Ygc3VtbWFibGUgbW9kcyB3aXRoIHRoZSBzYW1lIG5hbWVzXHJcbiAgICAgICAgbGV0IGJ1Y2tldHMgPSBuZXcgTWFwPFN0cmluZywgQXJyYXk8SURhbWFnZU1vZD4+KCk7XHJcblxyXG4gICAgICAgIC8vIFNwbGl0IHRoZSBtb2RzIHNvIHRoZXkgYXJlIGVhc2llciB0byBwcm9jZXNzLlxyXG4gICAgICAgIG1vZHMuZm9yRWFjaChtb2QgPT4ge1xyXG4gICAgICAgICAgICAvLyBJbW1lZGlhdGVseSBmaWx0ZXIgb3V0IG5vbi1zdW1tYWJsZSBtb2RzXHJcbiAgICAgICAgICAgIGlmICghbW9kLmNhblN1bSkge1xyXG4gICAgICAgICAgICAgICAgc3VtbWVkLnB1c2gobW9kKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIC8vIFB1c2ggc3VtbWFibGUgbW9kcyBpbnRvIGJ1Y2tldHNcclxuICAgICAgICAgICAgICAgIGxldCBidWNrZXQgPSBidWNrZXRzLmdldChtb2QubmFtZSk7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWJ1Y2tldCkgYnVja2V0ID0gbmV3IEFycmF5KCk7XHJcbiAgICAgICAgICAgICAgICBidWNrZXQucHVzaChtb2QpO1xyXG4gICAgICAgICAgICAgICAgYnVja2V0cy5zZXQobW9kLm5hbWUsIGJ1Y2tldCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gR28gdGhyb3VnaCBlYWNoIGJ1Y2tldCBhbmQgbWVyZ2UgdGhlIG1vZHMgdGhhdCBjYW4gYmUgbWVyZ2VkXHJcbiAgICAgICAgLy8gYW5kIGFkZCB0aG9zZSB0byBzdW1tZWQuXHJcbiAgICAgICAgWy4uLmJ1Y2tldHMudmFsdWVzKCldLmZvckVhY2goYnVja2V0ID0+IHtcclxuICAgICAgICAgICAgbGV0IG1lcmdlZCA9IERhbWFnZU1vZEdyb3VwLm1lcmdlQnVja2V0KGJ1Y2tldCk7XHJcbiAgICAgICAgICAgIHN1bW1lZC5wdXNoKC4uLm1lcmdlZCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHJldHVybiBzdW1tZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlZHVjZSB0aGUgYnVja2V0IHRvIG1vZHMgd2hpY2ggY2FuIGJlIG1lcmdlZC4gKi9cclxuICAgIHByaXZhdGUgc3RhdGljIG1lcmdlQnVja2V0KGJ1Y2tldDogQXJyYXk8SURhbWFnZU1vZD4pOiBBcnJheTxJRGFtYWdlTW9kPiB7XHJcbiAgICAgICAgLy8gVHdvIHBvc3NpYmxlIHBhdGhzLCBlaXRoZXIgdGhlIGZpcnN0IG1vZCBpbiBhIGJ1Y2tldFxyXG4gICAgICAgIC8vIGhhcyBzdW1tYWJsZSBwcmVzZW50IG9yIG5vdC5cclxuICAgICAgICBpZiAoIWJ1Y2tldFswXS5zdW1tYWJsZSkge1xyXG4gICAgICAgICAgICAvLyBOYWl2ZSByZWR1Y2UgdG8gc3VtIGFzIHdlIGRvbid0IG5lZWQgdG8gY2hlY2sgc3VtbWFibGVcclxuICAgICAgICAgICAgcmV0dXJuIFtidWNrZXQucmVkdWNlKChwcmV2LCBjdXJyZW50KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAoY3VycmVudC5zdW0pIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY3VycmVudC5zdW0ocHJldilcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgJ2F0dGVtcHRpbmcgc28gc3VtIHVuc3VtbWFnZSc7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pXTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEtlZXAgdHJhY2sgb2Ygd2hpY2ggbW9kcyBoYXZlIGJlZW4gc3VtbWVkXHJcbiAgICAgICAgbGV0IHVzZWQgPSBuZXcgU2V0PG51bWJlcj4oKTtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIHN1bW1hYmxlIG5vdCBhbGxvd2luZyBtb2RzIG9mIHRoZSBzYW1lIG5hbWUgdG8gYmUgbWVyZ2VkXHJcbiAgICAgICAgcmV0dXJuIDxBcnJheTxJRGFtYWdlTW9kPj5idWNrZXQubWFwKChtb2QsIHRvcEluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIC8vIFNraXAgdXNlZCBtb2RzXHJcbiAgICAgICAgICAgIGlmICh1c2VkLmhhcyh0b3BJbmRleCkpIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICAvLyBOb3RlIHRoYXQgdGhpcyBtb2QgaXMgdXNlZC4gQXQgdGhpcyBwb2ludCwgaXQgd2lsbFxyXG4gICAgICAgICAgICAvLyBhbHdheXMgYmUgcmV0dXJuZWQgdG8gc3VtbWVkIGluIG9uZSBmb3JtIG9yIGFub3RoZXIuXHJcbiAgICAgICAgICAgIHVzZWQuYWRkKHRvcEluZGV4KTtcclxuXHJcbiAgICAgICAgICAgIGJ1Y2tldC5mb3JFYWNoKChvdGhlciwgaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgICAgIC8vIFNraXAgdXNlZCBtb2RzXHJcbiAgICAgICAgICAgICAgICBpZiAodXNlZC5oYXMoaW5kZXgpKSByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiB0aGVzZSBhcmUgY29tcGF0aWJsZSBtb2RzXHJcbiAgICAgICAgICAgICAgICBpZiAobW9kLnN1bW1hYmxlICYmIG1vZC5zdW0gJiYgbW9kLnN1bW1hYmxlKG90aGVyKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIG1vZCA9IG1vZC5zdW0ob3RoZXIpO1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIE5vdGUgdGhhdCB0aGlzIGhhcyBiZWVuIHVzZWRcclxuICAgICAgICAgICAgICAgICAgICB1c2VkLmFkZChpbmRleCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuIG1vZDtcclxuICAgICAgICB9KS5maWx0ZXIobW9kID0+IG1vZCAhPSBudWxsKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmV0dXJuIGFsbCBtb2RzIGluIHRoZWlyIGNvcnJlY3QgZXhlY3V0aW9uIG9yZGVyICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBvcmRlcihtb2RzOiBBcnJheTxJRGFtYWdlTW9kPik6IEFycmF5PElEYW1hZ2VNb2Q+IHtcclxuICAgICAgICAvLyBTb3J0IGluIGFzY2VuZGluZyBvcmRlciwgdGhpcyBpbXBsaWNpdGx5IHJlc3BlY3RzXHJcbiAgICAgICAgLy8gdGhlIG9yZGVyaW5nIGFzIERhbWFnZU1vZE9yZGVyIGlzIGFuIGFzY2VuZGluZyBlbnVtLlxyXG4gICAgICAgIHJldHVybiBtb2RzLnNvcnQoKGEsIGIpID0+IGEucG9zaXRpb24gLSBiLnBvc2l0aW9uKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgbW9kczogQXJyYXk8SURhbWFnZU1vZD47XHJcblxyXG4gICAgY29uc3RydWN0b3IoKSB7XHJcbiAgICAgICAgdGhpcy5tb2RzID0gW107XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFxyXG4gICAgICogQWRkIGEgRGFtYWdlTW9kIHRvIHRoZSBncm91cCB1bmRlciB0aGUgY29udGV4dCBvZiBhIHNwZWNpZmljIGRpcmVjdGlvblxyXG4gICAgICpcclxuICAgICAqIFRoaXMgc2lsZW50bHkgZHJvcHMgbW9kcyBvZiB0aGUgaW5jb3JyZWN0IGRpcmVjdGlvbi5cclxuICAgICAqL1xyXG4gICAgcHVibGljIGFkZChtb2Q6IElEYW1hZ2VNb2QsIGRpcmVjdGlvbjogRGFtYWdlTW9kRGlyZWN0aW9uKSB7XHJcbiAgICAgICAgLy8gUHVzaCB0aGUgbW9kIG9ubHkgaWYgdGhlIGRpcmVjdGlvbiBpcyBzYXRpc2ZpZWRcclxuICAgICAgICBpZiAobW9kLmRpcmVjdGlvbiA9PT0gZGlyZWN0aW9uIHx8XHJcbiAgICAgICAgICAgIG1vZC5kaXJlY3Rpb24gPT09IERhbWFnZU1vZERpcmVjdGlvbi5BbHdheXMpIHtcclxuICAgICAgICAgICAgdGhpcy5tb2RzLnB1c2gobW9kKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBcHBseSBtb2RzIGluIHRoaXMgZ3JvdXAgdG8gcHJvdmlkZWQgRGFtYWdlXHJcbiAgICAgKlxyXG4gICAgICogTk9URTogdGhlcmUgaXMgbm8gZ3VhcmFudGVlIHRoZSBpbml0aWFsIERhbWFnZSBpbnN0YW5jZVxyXG4gICAgICogd2lsbCByZW1haW4gdW5tb2RpZmllZC5cclxuICAgICAqL1xyXG4gICAgcHVibGljIGFwcGx5KGQ6IERhbWFnZSk6IERhbWFnZSB7XHJcbiAgICAgICAgLy8gUHJvY2VzcyBtb2RzIGluIHRoZSBncm91cCBzbyB0aGV5IGFyZSBleGVjdXRlZCBwcm9wZXJseSBcclxuICAgICAgICBsZXQgc3VtbWVkID0gRGFtYWdlTW9kR3JvdXAuc3VtKHRoaXMubW9kcyk7XHJcbiAgICAgICAgbGV0IG9yZGVyZWQgPSBEYW1hZ2VNb2RHcm91cC5vcmRlcihzdW1tZWQpO1xyXG5cclxuICAgICAgICBjb25zb2xlLmxvZyhvcmRlcmVkKTtcclxuXHJcbiAgICAgICAgLy8gQXBwbHkgZWFjaCBtb2QuXHJcbiAgICAgICAgb3JkZXJlZC5mb3JFYWNoKG1vZCA9PiB7XHJcbiAgICAgICAgICAgIC8vIEVuc3VyZSB0aGVyZSBpcyBhdCBsZWFzdCBzb21lIHRhZyBvdmVybGFwXHJcbiAgICAgICAgICAgIC8vIGlmIHRoZSBtb2QgaGFzIHJlcXVpcmVkIHRhZ3NcclxuICAgICAgICAgICAgbGV0IHRhZ092ZXJsYXAgPSBbLi4ubW9kLnJlcVRhZ3MudmFsdWVzKCldXHJcbiAgICAgICAgICAgICAgICAucmVkdWNlKChwcmV2LCBjdXJyZW50KSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgbGV0IGhhc1NoYXJlZCA9IGQudGFncy5oYXMoY3VycmVudCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGhhc1NoYXJlZCB8fCBwcmV2O1xyXG4gICAgICAgICAgICAgICAgfSwgZmFsc2UpIHx8IG1vZC5yZXFUYWdzLnNpemUgPT09IDA7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiBubyB0YWcgb3ZlcmxhcCwgdGhlbiBjb250aW51ZVxyXG4gICAgICAgICAgICBpZiAoIXRhZ092ZXJsYXApIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGQgPSBtb2QuYXBwbHkoZCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHJldHVybiBkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBcclxuICAgICAqIFJldHVybiBhIGNvcHkgb2YgdGhpcyBEYW1hZ2VNb2RHcm91cCB3aGljaCBpc1xyXG4gICAgICogbXV0YWJsZSB3aXRob3V0IG1vZGlmeWluZyB0aGlzIGdyb3VwLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgY2xvbmUoKTogRGFtYWdlTW9kR3JvdXAge1xyXG4gICAgICAgIGxldCBjbG9uZSA9IG5ldyBEYW1hZ2VNb2RHcm91cCgpO1xyXG4gICAgICAgIC8vIERpcmVjdGx5IG1vZGlmeSB0aGUgY2xvbmUncyB1bmRlcmx5aW5nIG1vZHMgYXMgd2UndmUgbG9zdFxyXG4gICAgICAgIC8vIHRoZSBjb250ZXh0IHRvIHVzZSBhZGRcclxuICAgICAgICBjbG9uZS5tb2RzLnB1c2goLi4udGhpcy5tb2RzLm1hcChtID0+IG0uY2xvbmUoKSkpO1xyXG4gICAgICAgIHJldHVybiBjbG9uZTtcclxuICAgIH1cclxufVxyXG4iLCIvKiogTWV0YSBkYXRhIGdvdmVybmluZyBlbmdhZ2VtZW50IHBvc2l0aW9ucyAqL1xyXG5leHBvcnQgY29uc3QgUG9zaXRpb25Cb3VuZHMgPSB7XHJcbiAgICAvLyBMaW1pdHMgdG8gdmFsaWQgY29tYmF0IHBvc2l0aW9uc1xyXG4gICAgRXh0cmVtYTogWy0xMDAsIDEwMF0sXHJcbiAgICAvLyBXaGVyZSB0d28gb3Bwb3NpbmcgUGFja3Mgd291bGQgcGxhY2UgdGhlaXIgQ2hhcmFjdGVycyBpbml0aWFsbHlcclxuICAgIFN0YXJ0czogWy01MCwgNTBdLFxyXG4gICAgLy8gSG93IGxhcmdlIGEgJ3NjcmVlbicgaXMgY29uc2lkZXJlZCB0byBiZS5cclxuICAgIFNjcmVlblNpemU6IDEwMCxcclxufTtcclxuXHJcbi8qKiBIYW5kbGVzIGludGVsbGlnZW50IHBvc2l0aW9uaW5nICAqL1xyXG5leHBvcnQgY2xhc3MgUG9zaXRpb24ge1xyXG4gICAgY29uc3RydWN0b3IocHVibGljIGxvYzogbnVtYmVyKSB7IH1cclxufVxyXG4iLCJpbXBvcnQgeyBUaWNrc1BlclNlY29uZCB9IGZyb20gJy4vQVJQR1N0YXRlJztcclxuaW1wb3J0IHsgUG9zaXRpb25Cb3VuZHMgfSBmcm9tICcuL01vdmVtZW50JztcclxuXHJcbi8qKiBBcmd1bWVudCB0eXBlIGZvciBTdGF0cyBjb25zdHJ1Y3RvciAqL1xyXG5leHBvcnQgdHlwZSBTdGF0c0FyZyA9IHtcclxuICAgIEhlYWx0aDogbnVtYmVyO1xyXG4gICAgLyoqXHJcbiAgICAgKiBOdW1iZXIgb2YgdW5pdHMgbW92ZWQgaW4gYSBzaW5nbGUgdGlja1xyXG4gICAgICovXHJcbiAgICBNb3Zlc3BlZWQ6IG51bWJlcjtcclxuICAgIC8qKiBcclxuICAgICAqIFRpY2sgdGltZSByZXF1aXJlZCB0byBhdHRhY2tcclxuICAgICAqXHJcbiAgICAgKiBEZWZhdWx0IGlzIG9uZSBzZWNvbmQgd2l0aFxyXG4gICAgICogYW4gYXR0YWNrIFNraWxsIGFwcGx5aW5nIGEgZmxhdCBhZGRlZCBtb2QuXHJcbiAgICAgKi9cclxuICAgIEF0dGFja1RpbWU6IG51bWJlcjtcclxuICAgIC8qKlxyXG4gICAgICogVGljayB0aW1lIHJlcXVpcmVkIHRvIGNhc3QgYSBzcGVsbFxyXG4gICAgICpcclxuICAgICAqIERlZmF1bHQgaXMgemVybyB3aXRoXHJcbiAgICAgKiBhIFNwZWxsIFNraWxsIGFwcGx5aW5nIGEgZmxhdCBhZGRlZCBtb2QuXHJcbiAgICAgKi9cclxuICAgIENhc3RUaW1lOiBudW1iZXI7XHJcbn07XHJcblxyXG4vKiogU2FuZSBkZWZhdWx0IGJhc2VsaW5lIHN0YXRzICovXHJcbmV4cG9ydCBjb25zdCBiYXNlU3RhdHNBcmc6IFN0YXRzQXJnID0ge1xyXG4gICAgSGVhbHRoOiA1MCxcclxuICAgIE1vdmVzcGVlZDogKFBvc2l0aW9uQm91bmRzLlNjcmVlblNpemUgLyAyKSAvIFRpY2tzUGVyU2Vjb25kLFxyXG4gICAgQXR0YWNrVGltZTogVGlja3NQZXJTZWNvbmQgLyAxLFxyXG4gICAgQ2FzdFRpbWU6IDAsXHJcbn07XHJcblxyXG5leHBvcnQgY2xhc3MgU3RhdHMge1xyXG4gICAgcHVibGljIGhlYWx0aDogbnVtYmVyO1xyXG4gICAgcHVibGljIG1vdmVzcGVlZDogbnVtYmVyO1xyXG4gICAgcHVibGljIGF0dGFja1RpbWU6IG51bWJlcjtcclxuICAgIHB1YmxpYyBjYXN0VGltZTogbnVtYmVyO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGJhc2U6IFN0YXRzQXJnKSB7XHJcbiAgICAgICAgKHtcclxuICAgICAgICAgICAgSGVhbHRoOiB0aGlzLmhlYWx0aCxcclxuICAgICAgICAgICAgTW92ZXNwZWVkOiB0aGlzLm1vdmVzcGVlZCxcclxuICAgICAgICAgICAgQXR0YWNrVGltZTogdGhpcy5hdHRhY2tUaW1lLFxyXG4gICAgICAgICAgICBDYXN0VGltZTogdGhpcy5jYXN0VGltZSxcclxuICAgICAgICB9ID0gYmFzZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGNsb25lKCk6IFN0YXRzIHtcclxuICAgICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbihuZXcgU3RhdHMoYmFzZVN0YXRzQXJnKSwgdGhpcyk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjb25zdCBlbnVtIFN0YXRNb2RPcmRlciB7XHJcbiAgICBCYXNlID0gMCxcclxuICAgIEFkZCxcclxuICAgIE11bHRcclxufVxyXG5cclxuLyoqIEFueSBTdGF0cyBNb2RpZmllciB0aGF0IGVmZmVjdHMgdGhlIGNhbGN1bGF0aW9uIG9mIHN0YXRzICovXHJcbmV4cG9ydCBpbnRlcmZhY2UgSVN0YXRNb2Qge1xyXG4gICAgLyoqIE5hbWUgb2YgYSBTdGF0TW9kICovXHJcbiAgICBuYW1lOiBTdHJpbmc7XHJcbiAgICAvKiogV2hldGhlciBvciBub3QgdGhlIFN0YXRNb2QgY2FuIGJlIHJlYXNvbmFibHkgc3VtbWVkICovXHJcbiAgICBjYW5TdW06IEJvb2xlYW47XHJcbiAgICAvKiogVGhlIHBvaW50IHRoaXMgU3RhdE1vZCBpcyBhcHBsaWVkIHJlbGF0aXZlIHRvIG90aGVyIFN0YXRNb2RzICovXHJcbiAgICBwb3NpdGlvbjogU3RhdE1vZE9yZGVyO1xyXG4gICAgLyoqIEFwcGx5IHRoZSBEYW1hZ2VNb2QgdG8gcHJvdmlkZWQgRGFtYWdlICovXHJcbiAgICBhcHBseShzOiBTdGF0cyk6IFN0YXRzO1xyXG4gICAgLyoqIFN1bSB0d28gSURhbWdlTW9kIGluc3RhbmNlcyBvZiB0aGUgc2FtZSBuYW1lIHdpdGggY2FuU3VtIHRydWUgKi9cclxuICAgIHN1bShvdGhlcjogSVN0YXRNb2QpOiBJU3RhdE1vZDtcclxufVxyXG5cclxuLyoqIEV4cGxpY2l0IGFkZGl0aW9ucyB0byB0aGUgaGVhbHRoIHBvb2wgYmVmb3JlIHNjYWxpbmcgKi9cclxuZXhwb3J0IGNsYXNzIEZsYXRBZGRlZEhlYWx0aCBpbXBsZW1lbnRzIElTdGF0TW9kIHtcclxuICAgIHB1YmxpYyBuYW1lID0gJ0ZsYXRBZGRlZEhlYWx0aE1vZCc7XHJcbiAgICBwdWJsaWMgY2FuU3VtID0gdHJ1ZTtcclxuXHJcbiAgICBwdWJsaWMgcG9zaXRpb24gPSBTdGF0TW9kT3JkZXIuQWRkO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHB1YmxpYyBmbGF0OiBudW1iZXIpIHsgfVxyXG5cclxuICAgIHB1YmxpYyBhcHBseShzOiBTdGF0cyk6IFN0YXRzIHtcclxuICAgICAgICBzLmhlYWx0aCArPSB0aGlzLmZsYXQ7XHJcbiAgICAgICAgcmV0dXJuIHM7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHN1bShvdGhlcjogRmxhdEFkZGVkSGVhbHRoKTogRmxhdEFkZGVkSGVhbHRoIHtcclxuICAgICAgICByZXR1cm4gbmV3IEZsYXRBZGRlZEhlYWx0aCh0aGlzLmZsYXQgKyBvdGhlci5mbGF0KTtcclxuICAgIH1cclxufVxyXG5cclxuLyoqIEZsYXQgYXR0YWNrIHRpbWUgKi9cclxuZXhwb3J0IGNsYXNzIEJhc2VBdHRhY2tUaW1lIGltcGxlbWVudHMgSVN0YXRNb2Qge1xyXG4gICAgcHVibGljIG5hbWUgPSAnQmFzZUF0dGFja1NwZWVkTW9kJztcclxuICAgIHB1YmxpYyBjYW5TdW0gPSB0cnVlO1xyXG5cclxuICAgIHB1YmxpYyBwb3NpdGlvbiA9IFN0YXRNb2RPcmRlci5BZGQ7XHJcblxyXG4gICAgY29uc3RydWN0b3IocHVibGljIHRpbWU6IG51bWJlcikgeyB9XHJcblxyXG4gICAgcHVibGljIGFwcGx5KHM6IFN0YXRzKTogU3RhdHMge1xyXG4gICAgICAgIHMuYXR0YWNrVGltZSArPSB0aGlzLnRpbWU7XHJcbiAgICAgICAgcmV0dXJuIHM7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHN1bShvdGhlcjogQmFzZUF0dGFja1RpbWUpOiBCYXNlQXR0YWNrVGltZSB7XHJcbiAgICAgICAgLy8gRGlzYWxsb3cgbXVsdGlwbGUgQmFzZUF0dGFja1RpbWVzIGJ5IGNhdGNoaW5nIGl0IGhlcmUuXHJcbiAgICAgICAgdGhyb3cgRXJyb3IoJ0Jhc2VBdHRhY2tUaW1lIHNob3VsZCBoYXZlIGEgc2luZ2xlIHNvdXJjZScpO1xyXG4gICAgfVxyXG59XHJcblxyXG4vKiogUGVyY2VudGFnZSBpbmNyZWFzZWQgYXR0YWNrIHNwZWVkICovXHJcbmV4cG9ydCBjbGFzcyBJbmNyZWFzZWRBdHRhY2tTcGVlZCBpbXBsZW1lbnRzIElTdGF0TW9kIHtcclxuICAgIHB1YmxpYyBuYW1lID0gJ0luY3JlYXNlZEF0dGFja1NwZWVkTW9kJztcclxuICAgIHB1YmxpYyBjYW5TdW0gPSB0cnVlO1xyXG5cclxuICAgIHB1YmxpYyBwb3NpdGlvbiA9IFN0YXRNb2RPcmRlci5BZGQ7XHJcblxyXG4gICAgY29uc3RydWN0b3IocHVibGljIHBlcmNlbnQ6IG51bWJlcikgeyB9XHJcblxyXG4gICAgcHVibGljIGFwcGx5KHM6IFN0YXRzKTogU3RhdHMge1xyXG4gICAgICAgIC8vIEF0dGFjayB0aW1lIHNob3VsZCBiZSByZWR1Y2VkIGJ5IHRoaXMsXHJcbiAgICAgICAgLy8gdGh1cyB0aGUgc2hlbmFuaWdhbnMuXHJcbiAgICAgICAgcy5hdHRhY2tUaW1lICo9IDEgLyAoMSArIHRoaXMucGVyY2VudCk7XHJcbiAgICAgICAgcmV0dXJuIHM7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHN1bShvdGhlcjogSW5jcmVhc2VkQXR0YWNrU3BlZWQpOiBJbmNyZWFzZWRBdHRhY2tTcGVlZCB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBJbmNyZWFzZWRBdHRhY2tTcGVlZCh0aGlzLnBlcmNlbnQgKyBvdGhlci5wZXJjZW50KTtcclxuICAgIH1cclxufVxyXG5cclxuLyoqIFBlcmNlbnRhZ2UgaW5jcmVhc2VkIG1vdmVtZW50IHNwZWVkICovXHJcbmV4cG9ydCBjbGFzcyBJbmNyZWFzZWRNb3Zlc3BlZWQgaW1wbGVtZW50cyBJU3RhdE1vZCB7XHJcbiAgICBwdWJsaWMgbmFtZSA9ICdJbmNyZWFzZWRNb3Zlc3BlZWQnO1xyXG4gICAgcHVibGljIGNhblN1bSA9IHRydWU7XHJcblxyXG4gICAgcHVibGljIHBvc2l0aW9uID0gU3RhdE1vZE9yZGVyLkFkZDtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgcGVyY2VudDogbnVtYmVyKSB7IH1cclxuXHJcbiAgICBwdWJsaWMgYXBwbHkoczogU3RhdHMpOiBTdGF0cyB7XHJcbiAgICAgICAgLy8gTW92ZXNwZWVkIHNob3VsZCBiZSBpbmNyZWFzZWQgYnkgdGhpc1xyXG4gICAgICAgIHMubW92ZXNwZWVkICo9ICgxICsgdGhpcy5wZXJjZW50KTtcclxuICAgICAgICByZXR1cm4gcztcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc3VtKG90aGVyOiBJbmNyZWFzZWRNb3Zlc3BlZWQpOiBJbmNyZWFzZWRNb3Zlc3BlZWQge1xyXG4gICAgICAgIHJldHVybiBuZXcgSW5jcmVhc2VkTW92ZXNwZWVkKHRoaXMucGVyY2VudCArIG90aGVyLnBlcmNlbnQpO1xyXG4gICAgfVxyXG59XHJcblxyXG4vKipcclxuICogQSBzZXQgb2YgU3RhdE1vZHMgd2hpY2ggYXJlIGFwcGxpZWQgYXMgYW4gYXRvbWljIG9wZXJhdGlvbi5cclxuICpcclxuICogVGhpcyBlbmZvcmNlcyB0aGUgYXBwbGljYXRpb24gb3JkZXIgYW5kIHN1bW1hdGlvbiBvZiBpdHMgdW5kZXJseWluZyBtb2RzLlxyXG4gKlxyXG4gKiBOT1RFOiBUaGlzIGlzIG1vc3RseSBkZXJpdmVkIGZyb20gRGFtYWdlTW9kR3JvdXAncyBpbXBsZW1lbnRhdGlvbi5cclxuICovXHJcbmV4cG9ydCBjbGFzcyBTdGF0TW9kR3JvdXAge1xyXG5cclxuICAgIC8qKiBSZXR1cm4gYWxsIHN1bW1hYmxlIG1vZHMgYXMgdGhlaXIgc3VtcyAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgc3VtKG1vZHM6IEFycmF5PElTdGF0TW9kPik6IEFycmF5PElTdGF0TW9kPiB7XHJcbiAgICAgICAgbGV0IHN1bW1lZCA9IG5ldyBBcnJheTxJU3RhdE1vZD4oKTtcclxuXHJcbiAgICAgICAgLy8gQnVja2V0cyBvZiBzdW1tYWJsZSBtb2RzIHdpdGggdGhlIHNhbWUgbmFtZXNcclxuICAgICAgICBsZXQgYnVja2V0cyA9IG5ldyBNYXA8U3RyaW5nLCBBcnJheTxJU3RhdE1vZD4+KCk7XHJcblxyXG4gICAgICAgIC8vIFNwbGl0IHRoZSBtb2RzIHNvIHRoZXkgYXJlIGVhc2llciB0byBwcm9jZXNzLlxyXG4gICAgICAgIG1vZHMuZm9yRWFjaChtb2QgPT4ge1xyXG4gICAgICAgICAgICAvLyBJbW1lZGlhdGVseSBmaWx0ZXIgb3V0IG5vbi1zdW1tYWJsZSBtb2RzXHJcbiAgICAgICAgICAgIGlmICghbW9kLmNhblN1bSkge1xyXG4gICAgICAgICAgICAgICAgc3VtbWVkLnB1c2gobW9kKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIC8vIFB1c2ggc3VtbWFibGUgbW9kcyBpbnRvIGJ1Y2tldHNcclxuICAgICAgICAgICAgICAgIGxldCBidWNrZXQgPSBidWNrZXRzLmdldChtb2QubmFtZSk7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWJ1Y2tldCkgYnVja2V0ID0gbmV3IEFycmF5KCk7XHJcbiAgICAgICAgICAgICAgICBidWNrZXQucHVzaChtb2QpO1xyXG4gICAgICAgICAgICAgICAgYnVja2V0cy5zZXQobW9kLm5hbWUsIGJ1Y2tldCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gR28gdGhyb3VnaCBlYWNoIGJ1Y2tldCBhbmQgbWVyZ2UgdGhlIG1vZHMgdGhhdCBjYW4gYmUgbWVyZ2VkXHJcbiAgICAgICAgLy8gYW5kIGFkZCB0aG9zZSB0byBzdW1tZWQuXHJcbiAgICAgICAgWy4uLmJ1Y2tldHMudmFsdWVzKCldLmZvckVhY2goYnVja2V0ID0+IHtcclxuICAgICAgICAgICAgbGV0IG1lcmdlZCA9IFN0YXRNb2RHcm91cC5tZXJnZUJ1Y2tldChidWNrZXQpO1xyXG4gICAgICAgICAgICBzdW1tZWQucHVzaCguLi5tZXJnZWQpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICByZXR1cm4gc3VtbWVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZWR1Y2UgdGhlIGJ1Y2tldCB0byBtb2RzIHdoaWNoIGNhbiBiZSBtZXJnZWQuICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBtZXJnZUJ1Y2tldChidWNrZXQ6IEFycmF5PElTdGF0TW9kPik6IEFycmF5PElTdGF0TW9kPiB7XHJcbiAgICAgICAgLy8gTmFpdmUgcmVkdWNlIHRvIHN1bSBhcyB3ZSBkb24ndCBuZWVkIHRvIGNoZWNrIGZvciBzdW1tYWJsZVxyXG4gICAgICAgIHJldHVybiBbYnVja2V0LnJlZHVjZSgocHJldiwgY3VycmVudCkgPT4gY3VycmVudC5zdW0ocHJldikpXTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmV0dXJuIGFsbCBtb2RzIGluIHRoZWlyIGNvcnJlY3QgZXhlY3V0aW9uIG9yZGVyICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBvcmRlcihtb2RzOiBBcnJheTxJU3RhdE1vZD4pOiBBcnJheTxJU3RhdE1vZD4ge1xyXG4gICAgICAgIC8vIFNvcnQgaW4gYXNjZW5kaW5nIG9yZGVyLCB0aGlzIGltcGxpY2l0bHkgcmVzcGVjdHNcclxuICAgICAgICAvLyB0aGUgb3JkZXJpbmcgYXMgRGFtYWdlTW9kT3JkZXIgaXMgYW4gYXNjZW5kaW5nIGVudW0uXHJcbiAgICAgICAgcmV0dXJuIG1vZHMuc29ydCgoYSwgYikgPT4gYS5wb3NpdGlvbiAtIGIucG9zaXRpb24pO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBtb2RzOiBBcnJheTxJU3RhdE1vZD47XHJcblxyXG4gICAgY29uc3RydWN0b3IoKSB7XHJcbiAgICAgICAgdGhpcy5tb2RzID0gW107XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEFkZCBhIFN0YXRNb2QgdG8gdGhlIGdyb3VwLiAqL1xyXG4gICAgcHVibGljIGFkZChtb2Q6IElTdGF0TW9kKSB7XHJcbiAgICAgICAgdGhpcy5tb2RzLnB1c2gobW9kKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEFwcGx5IG1vZHMgaW4gdGhpcyBncm91cCB0byBwcm92aWRlZCBEYW1hZ2VcclxuICAgICAqXHJcbiAgICAgKiBOT1RFOiB0aGVyZSBpcyBubyBndWFyYW50ZWUgdGhlIGluaXRpYWwgRGFtYWdlIGluc3RhbmNlXHJcbiAgICAgKiB3aWxsIHJlbWFpbiB1bm1vZGlmaWVkLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgYXBwbHkoczogU3RhdHMpOiBTdGF0cyB7XHJcbiAgICAgICAgLy8gUHJvY2VzcyBtb2RzIGluIHRoZSBncm91cCBzbyB0aGV5IGFyZSBleGVjdXRlZCBwcm9wZXJseSBcclxuICAgICAgICBsZXQgc3VtbWVkID0gU3RhdE1vZEdyb3VwLnN1bSh0aGlzLm1vZHMpO1xyXG4gICAgICAgIGxldCBvcmRlcmVkID0gU3RhdE1vZEdyb3VwLm9yZGVyKHN1bW1lZCk7XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKG9yZGVyZWQpO1xyXG5cclxuICAgICAgICAvLyBBcHBseSBlYWNoIG1vZC5cclxuICAgICAgICBvcmRlcmVkLmZvckVhY2gobW9kID0+IHMgPSBtb2QuYXBwbHkocykpO1xyXG5cclxuICAgICAgICByZXR1cm4gcztcclxuICAgIH1cclxuXHJcbn1cclxuIiwiaW1wb3J0IHsgSURhbWFnZU1vZCwgRGFtYWdlTW9kT3JkZXIsIERhbWFnZU1vZERpcmVjdGlvbiB9IGZyb20gJy4vRGFtYWdlTW9kcyc7XHJcbmltcG9ydCB7IERhbWFnZSwgRWxlbWVudHMgfSBmcm9tICcuL0RhbWFnZSc7XHJcbmltcG9ydCB7IGludGZyb21JbnRlcnZhbCB9IGZyb20gJy4vUmFuZG9tJztcclxuXHJcbi8qKiBUaGUgYXBwbGljYXRpb24gb2YgYXJtb3IgdG8gbWl0aWdhdGUgcGh5c2ljYWwgZGFtYWdlICovXHJcbmV4cG9ydCBjbGFzcyBBcm1vciBpbXBsZW1lbnRzIElEYW1hZ2VNb2Qge1xyXG4gICAgcHVibGljIG5hbWUgPSAnQXJtb3JEYW1hZ2VNb2QnO1xyXG4gICAgcHVibGljIGNhblN1bSA9IHRydWU7XHJcblxyXG4gICAgcHVibGljIGRpcmVjdGlvbiA9IERhbWFnZU1vZERpcmVjdGlvbi5UYWtpbmc7XHJcblxyXG4gICAgcHVibGljIHJlcVRhZ3MgPSBuZXcgU2V0KCk7XHJcbiAgICBwdWJsaWMgcG9zaXRpb24gPSBEYW1hZ2VNb2RPcmRlci5NaXRpZ2F0aW9uO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHB1YmxpYyBhcm1vcjogbnVtYmVyKSB7IH1cclxuXHJcbiAgICBwdWJsaWMgYXBwbHkoZDogRGFtYWdlKTogRGFtYWdlIHtcclxuICAgICAgICBsZXQgcGh5cyA9ICgxMCAqIGQucGh5cyAqIGQucGh5cykgLyAodGhpcy5hcm1vciArICgxMCAqIGQucGh5cykpO1xyXG4gICAgICAgIGQucGh5cyA9IHBoeXM7XHJcbiAgICAgICAgcmV0dXJuIGQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHN1bShvdGhlcjogQXJtb3IpOiBBcm1vciB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBBcm1vcih0aGlzLmFybW9yICsgb3RoZXIuYXJtb3IpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBjbG9uZSgpOiBJRGFtYWdlTW9kIHtcclxuICAgICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbihuZXcgQXJtb3IoMCksIHRoaXMpO1xyXG4gICAgfVxyXG59XHJcblxyXG4vKiogVGhlIGFwcGxpY2F0aW9uIG9mIGEgcmVzaXN0YW5jZSB0byBtaXRpZ2F0ZSBhbiBlbGVtZW50J3MgZGFtYWdlICovXHJcbmV4cG9ydCBjbGFzcyBSZXNpc3RhbmNlIGltcGxlbWVudHMgSURhbWFnZU1vZCB7XHJcbiAgICBwdWJsaWMgbmFtZSA9ICdSZXNpc3RzRGFtYWdlTW9kJztcclxuICAgIHB1YmxpYyBjYW5TdW0gPSB0cnVlO1xyXG5cclxuICAgIHB1YmxpYyBkaXJlY3Rpb24gPSBEYW1hZ2VNb2REaXJlY3Rpb24uVGFraW5nO1xyXG5cclxuICAgIHB1YmxpYyByZXFUYWdzID0gbmV3IFNldCgpO1xyXG4gICAgcHVibGljIHBvc2l0aW9uID0gRGFtYWdlTW9kT3JkZXIuTWl0aWdhdGlvbjtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgcmVzaXN0YW5jZTogbnVtYmVyLCBwdWJsaWMgZWxlbWVudDogRWxlbWVudHMpIHsgfVxyXG5cclxuICAgIHB1YmxpYyBhcHBseShkOiBEYW1hZ2UpOiBEYW1hZ2Uge1xyXG4gICAgICAgIC8vIEZldGNoIHJlc2lzdGFuY2UgZm9yIHRoaXMgZWxlbWVudFxyXG4gICAgICAgIGxldCBtYWduaXR1ZGUgPSBkLmdldEVsZW1lbnQodGhpcy5lbGVtZW50KTtcclxuICAgICAgICAvLyBNaXRpZ2F0ZSBkYW1hZ2VcclxuICAgICAgICBsZXQgYXBwbGllZCA9ICgxIC0gdGhpcy5yZXNpc3RhbmNlKSAqIG1hZ25pdHVkZTtcclxuICAgICAgICAvLyBVcGRhdGUgRGFtYWdlIHdpdGggbmV3IGVsZW1lbnQgdmFsdWVcclxuICAgICAgICBkLnNldEVsZW1lbnQodGhpcy5lbGVtZW50LCBhcHBsaWVkKTtcclxuICAgICAgICByZXR1cm4gZDtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc3VtKG90aGVyOiBSZXNpc3RhbmNlKTogUmVzaXN0YW5jZSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLnN1bW1hYmxlKG90aGVyKSkge1xyXG4gICAgICAgICAgICB0aHJvdyBFcnJvcigndGhpcyBtb2QgaXMgbm90IHN1bW1hYmxlIHdpdGggb3RoZXInKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gQ2FwIHJlc2lzdHMgYXQgNzUlIG1pdGlnYXRpb25cclxuICAgICAgICBsZXQgY2FwcGVkID0gTWF0aC5taW4odGhpcy5yZXNpc3RhbmNlICsgb3RoZXIucmVzaXN0YW5jZSwgMC43NSk7XHJcblxyXG4gICAgICAgIHJldHVybiBuZXcgUmVzaXN0YW5jZShjYXBwZWQsIHRoaXMuZWxlbWVudCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHN1bW1hYmxlKG90aGVyOiBSZXNpc3RhbmNlKTogQm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZWxlbWVudCA9PT0gb3RoZXIuZWxlbWVudDtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgY2xvbmUoKTogSURhbWFnZU1vZCB7XHJcbiAgICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24obmV3IFJlc2lzdGFuY2UoMCwgRWxlbWVudHMuRmlyZSksIHRoaXMpO1xyXG4gICAgfVxyXG59XHJcblxyXG4vKiogWmVybyB0aGUgRGFtYWdlIHRvIG5vdGhpbmcgKi9cclxuZXhwb3J0IGNsYXNzIFplcm8gaW1wbGVtZW50cyBJRGFtYWdlTW9kIHtcclxuICAgIHB1YmxpYyBuYW1lID0gJ1plcm9EYW1hZ2VNb2QnO1xyXG4gICAgcHVibGljIGNhblN1bSA9IGZhbHNlO1xyXG5cclxuICAgIHB1YmxpYyBkaXJlY3Rpb24gPSBEYW1hZ2VNb2REaXJlY3Rpb24uQWx3YXlzO1xyXG5cclxuICAgIHB1YmxpYyByZXFUYWdzID0gbmV3IFNldCgpO1xyXG4gICAgcHVibGljIHBvc2l0aW9uID0gRGFtYWdlTW9kT3JkZXIuUG9zdEluaXRpYWw7XHJcblxyXG4gICAgcHVibGljIGFwcGx5KGQ6IERhbWFnZSk6IERhbWFnZSB7XHJcbiAgICAgICAgLy8gSSBrbm93LCBpdCBsb29rcyBiYWQgOnxcclxuICAgICAgICBkLnBoeXMgPSAwO1xyXG4gICAgICAgIGQuc2V0RWxlbWVudChFbGVtZW50cy5GaXJlLCAwKTtcclxuICAgICAgICBkLnNldEVsZW1lbnQoRWxlbWVudHMuTGlnaHQsIDApO1xyXG4gICAgICAgIGQuc2V0RWxlbWVudChFbGVtZW50cy5Db2xkLCAwKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGNsb25lKCk6IElEYW1hZ2VNb2Qge1xyXG4gICAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKG5ldyBaZXJvKCksIHRoaXMpO1xyXG4gICAgfVxyXG59XHJcblxyXG4vKiogXHJcbiAqIExvY2FsLCBmbGF0IHBoeXNpY2FsIGRhbWFnZVxyXG4gKlxyXG4gKiBOT1RFOiB0aGlzIGRvZXMgc3VtXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgTG9jYWxQaHlzaWNhbCBpbXBsZW1lbnRzIElEYW1hZ2VNb2Qge1xyXG4gICAgcHVibGljIG5hbWUgPSAnTG9jYWxQaHlzaWNhbERhbWFnZU1vZCc7XHJcbiAgICBwdWJsaWMgY2FuU3VtID0gdHJ1ZTtcclxuXHJcbiAgICBwdWJsaWMgZGlyZWN0aW9uID0gRGFtYWdlTW9kRGlyZWN0aW9uLkRlYWxpbmc7XHJcblxyXG4gICAgcHVibGljIHJlcVRhZ3MgPSBuZXcgU2V0KCk7XHJcbiAgICBwdWJsaWMgcG9zaXRpb24gPSBEYW1hZ2VNb2RPcmRlci5Mb2NhbDtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgbWluOiBudW1iZXIsIHB1YmxpYyBtYXg6IG51bWJlcikgeyB9XHJcblxyXG4gICAgcHVibGljIGFwcGx5KGQ6IERhbWFnZSk6IERhbWFnZSB7XHJcbiAgICAgICAgLy8gUm9sbCBpbiByYW5nZVxyXG4gICAgICAgIGxldCBmbGF0UGh5cyA9IGludGZyb21JbnRlcnZhbCh0aGlzLm1pbiwgdGhpcy5tYXgpO1xyXG4gICAgICAgIC8vIEFwcGx5IGZsYXQgcGh5c2ljYWxcclxuICAgICAgICBkLnBoeXMgKz0gZmxhdFBoeXM7XHJcbiAgICAgICAgcmV0dXJuIGQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHN1bShvdGhlcjogTG9jYWxQaHlzaWNhbCk6IExvY2FsUGh5c2ljYWwge1xyXG4gICAgICAgIHJldHVybiBuZXcgTG9jYWxQaHlzaWNhbChvdGhlci5taW4gKyB0aGlzLm1pbiwgb3RoZXIubWF4ICsgdGhpcy5tYXgpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBjbG9uZSgpOiBJRGFtYWdlTW9kIHtcclxuICAgICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbihuZXcgTG9jYWxQaHlzaWNhbCgwLCAwKSwgdGhpcyk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBJbmNyZWFzZWRDcml0Q2hhbmNlIGltcGxlbWVudHMgSURhbWFnZU1vZCB7XHJcbiAgICBwdWJsaWMgbmFtZSA9ICdJbmNyZWFzZWRDcml0Q2hhbmNlRGFtYWdlTW9kJztcclxuICAgIHB1YmxpYyBjYW5TdW0gPSB0cnVlO1xyXG5cclxuICAgIHB1YmxpYyBkaXJlY3Rpb24gPSBEYW1hZ2VNb2REaXJlY3Rpb24uRGVhbGluZztcclxuXHJcbiAgICBwdWJsaWMgcmVxVGFncyA9IG5ldyBTZXQoKTtcclxuICAgIHB1YmxpYyBwb3NpdGlvbiA9IERhbWFnZU1vZE9yZGVyLkdsb2JhbEFkZDtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgcGVyY2VudDogbnVtYmVyKSB7IH1cclxuXHJcbiAgICBwdWJsaWMgYXBwbHkoZDogRGFtYWdlKTogRGFtYWdlIHtcclxuICAgICAgICAvLyBSb2xsIGluIHJhbmdlXHJcbiAgICAgICAgZC5jcml0aWNhbENoYW5jZSAqPSAxICsgdGhpcy5wZXJjZW50O1xyXG4gICAgICAgIC8vIENhcCBpZiBjaGFuY2UgaXMgaGlnaGVyIHRoYW4gbWF4aW11bVxyXG4gICAgICAgIGQuY3JpdGljYWxDaGFuY2UgPSBNYXRoLm1pbihkLmNyaXRpY2FsQ2hhbmNlLCAwLjgwKTtcclxuICAgICAgICByZXR1cm4gZDtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc3VtKG90aGVyOiBJbmNyZWFzZWRDcml0Q2hhbmNlKTogSW5jcmVhc2VkQ3JpdENoYW5jZSB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBJbmNyZWFzZWRDcml0Q2hhbmNlKHRoaXMucGVyY2VudCArIG90aGVyLnBlcmNlbnQpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBjbG9uZSgpOiBJRGFtYWdlTW9kIHtcclxuICAgICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbihuZXcgSW5jcmVhc2VkQ3JpdENoYW5jZSgwKSwgdGhpcyk7XHJcbiAgICB9XHJcbn1cclxuIiwiaW1wb3J0IHsgVGlja3NQZXJTZWNvbmQsIFN0YXRlLCBFdmVudCB9IGZyb20gJy4vQVJQR1N0YXRlJztcclxuaW1wb3J0IHsgQ2hhcmFjdGVyU3RhdGUgfSBmcm9tICcuL0NoYXJhY3Rlcic7XHJcbmltcG9ydCB7IERhbWFnZVRhZywgRGFtYWdlIH0gZnJvbSAnLi9EYW1hZ2UnO1xyXG5pbXBvcnQgeyBEYW1hZ2VNb2RHcm91cCwgRGFtYWdlTW9kRGlyZWN0aW9uIH0gZnJvbSAnLi9EYW1hZ2VNb2RzJztcclxuaW1wb3J0IHsgWmVybyB9IGZyb20gJy4vRGFtYWdlTW9kUmVnaXN0cnknO1xyXG5pbXBvcnQgKiBhcyBTdGF0TW9kcyBmcm9tICcuL1N0YXRNb2RzJztcclxuXHJcbi8qKiBcclxuICogQSBTa2lsbFJlc3VsdCBjb250YWlucyB0aGUgbW9kcyBmb3IgdGhlIGluaXRpYWwgc2tpbGwgdXNlXHJcbiAqIGFzIHdlbGwgYXMgdGhlIHBvc3QtbW9kcyBhbmQgZGVsYXkgZm9yIGFueSBhZnRlci1lZmZlY3QuXHJcbiAqXHJcbiAqIHBvc3Rtb2RzIG1heSBiZSBudWxsIHRvIGluZGljYXRlIG5vIGZvbGxvd3VwIGlzIHRvIGJlIHNjaGVkdWxlZC5cclxuICovXHJcbmV4cG9ydCBjbGFzcyBTa2lsbFJlc3VsdCB7XHJcbiAgICBwcml2YXRlIGFwcGxpZWQ6IEJvb2xlYW4gPSBmYWxzZTtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgbW9kczogRGFtYWdlTW9kR3JvdXAsXHJcbiAgICAgICAgcHVibGljIHBvc3Rtb2RzOiBEYW1hZ2VNb2RHcm91cCB8IG51bGwsIHB1YmxpYyBwb3N0RGVsYXk6IG51bWJlcikge1xyXG5cclxuICAgICAgICBpZiAobW9kcyA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICB0aHJvdyBFcnJvcignbW9kcyBpcyBudWxsLCBwcmVmZXIgdG8gYWRkKG5ldyBaZXJvKCkpIGluc3RlYWQnKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFxyXG4gICAgICogQXBwbHkgdGhpcyBTa2lsbEVmZmVjdC5cclxuICAgICAqXHJcbiAgICAgKiBUaGlzIGNhbiBiZSB1c2VkIG9ubHkgb25jZS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIGV4ZWN1dGUodGFyZ2V0OiBDaGFyYWN0ZXJTdGF0ZSwgc3RhdGU6IFN0YXRlKSB7XHJcbiAgICAgICAgLy8gUHJldmVudCBtdWx0aXBsZSBleGVjdXRpb24uXHJcbiAgICAgICAgaWYgKHRoaXMuYXBwbGllZCkgdGhyb3cgRXJyb3IoJ2Nhbm5vdCBhcHBseSBTa2lsbFJlc3VsdCA+IDEgdGltZScpO1xyXG4gICAgICAgIHRoaXMuYXBwbGllZCA9IHRydWU7XHJcblxyXG4gICAgICAgIC8vIENhbGN1bGF0ZSBhbmQgYXBwbHkgaW5pdGlhbCBkYW1hZ2VcclxuICAgICAgICBsZXQgaW5pdGlhbERhbWFnZSA9IHRoaXMubW9kcy5hcHBseShuZXcgRGFtYWdlKG5ldyBTZXQoKSkpO1xyXG4gICAgICAgIGluaXRpYWxEYW1hZ2UuYXBwbHkodGFyZ2V0KTtcclxuXHJcbiAgICAgICAgLy8gU2tpcCBmb2xsb3d1cCBjYWxjdWxhdGlvbiB3aGVuIHdlIGRvbid0IGhhdmUgb25lLlxyXG4gICAgICAgIGlmICghdGhpcy5oYXNGb2xsb3d1cCkgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBTY2hlZHVsZSBhbiBldmVudCB0byBjb21wbGV0ZSB0byByZXNvbHZlIHRoZSBwb3N0bW9kc1xyXG4gICAgICAgIGxldCBlID0gbmV3IEV2ZW50KHN0YXRlLm5vdyArIHRoaXMucG9zdERlbGF5LFxyXG4gICAgICAgICAgICAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAvLyBEb24ndCBib3RoZXIgY2FsY3VsYXRpbmcgYW5kIGFwcGx5aW5nIGRhbWFnZSBmb3IgdGhlIGRlYWQuLi5cclxuICAgICAgICAgICAgICAgIGlmICh0YXJnZXQuaXNEZWFkKSByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBDYWxjdWxhdGUgYW5kIGFwcGx5IHNjaGVkdWxlZCBwb3N0LWRhbWFnZVxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMucG9zdG1vZHMpIHtcclxuICAgICAgICAgICAgICAgICAgICBsZXQgcG9zdERhbWFnZSA9IHRoaXMucG9zdG1vZHMuYXBwbHkobmV3IERhbWFnZShuZXcgU2V0KCkpKTtcclxuICAgICAgICAgICAgICAgICAgICBwb3N0RGFtYWdlLmFwcGx5KHRhcmdldCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgICAgIH0sIG51bGwpO1xyXG4gICAgICAgIHN0YXRlLmFkZEV2ZW50KGUpO1xyXG4gICAgfVxyXG5cclxuICAgIGdldCBoYXNGb2xsb3d1cCgpOiBCb29sZWFuIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5wb3N0bW9kcyAhPSBudWxsO1xyXG4gICAgfVxyXG59XHJcblxyXG4vKiogXHJcbiAqIFRoZSB0eXBlIG9mIHRpbWluZyBhcHBsaWVkIHRvIHRoZSBza2lsbFxyXG4gKlxyXG4gKiBOT1RFOiByZWxldmFudCBEYW1hZ2VUYWdzIHN0aWxsIG5lZWQgdG8gYmUgcHJlc2VudCBvbiBlYWNoIFNraWxsRWZmZWN0XHJcbiAqL1xyXG5leHBvcnQgY29uc3QgZW51bSBTa2lsbFRpbWluZyB7XHJcbiAgICBBdHRhY2sgPSAwLFxyXG4gICAgU3BlbGwsXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBBIGZ1bGwgc2tpbGwgd2l0aCBhbGwgZWZmZWN0c1xyXG4gKi9cclxuZXhwb3J0IGludGVyZmFjZSBJU2tpbGwge1xyXG4gICAgbmFtZTogU3RyaW5nO1xyXG4gICAgLyoqIEhvdyB0aW1pbmcgZm9yIHRoZSBza2lsbCBpcyBwZXJmb3JtZWQgKi9cclxuICAgIHRpbWluZ0J5OiBTa2lsbFRpbWluZztcclxuICAgIC8qKiBTaW5ndWxhciB0aW1lIG1vZGlmaWVyIGFsbG93ZWQgZm9yIGEgc2tpbGwgKi9cclxuICAgIHRpbWVNb2Q6IFN0YXRNb2RzLklTdGF0TW9kO1xyXG4gICAgZWZmZWN0czogQXJyYXk8SVNraWxsRWZmZWN0PjtcclxuICAgIGV4ZWN1dGUodGFyZ2V0OiBDaGFyYWN0ZXJTdGF0ZSwgdXNlcjogQ2hhcmFjdGVyU3RhdGUsXHJcbiAgICAgICAgbW9kczogRGFtYWdlTW9kR3JvdXApOiBBcnJheTxTa2lsbFJlc3VsdD47XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBBIHBhcnRpYWwgcGFydCBvZiBhIHNraWxsJ3MgZXhlY3V0aW9uLlxyXG4gKlxyXG4gKiBUT0RPOiBoYW5kbGUgcmFuZ2UgaGVyZSB3aGVuIHdlIGludHJvZHVjZSBpdFxyXG4gKi9cclxuZXhwb3J0IGludGVyZmFjZSBJU2tpbGxFZmZlY3Qge1xyXG4gICAgbmFtZTogU3RyaW5nO1xyXG4gICAgdGFnczogQXJyYXk8RGFtYWdlVGFnPjtcclxuICAgIGV4ZWN1dGUodGFyZ2V0OiBDaGFyYWN0ZXJTdGF0ZSwgdXNlcjogQ2hhcmFjdGVyU3RhdGUsXHJcbiAgICAgICAgbW9kczogRGFtYWdlTW9kR3JvdXApOiBTa2lsbFJlc3VsdDtcclxufVxyXG5cclxuY2xhc3MgQmFzaWNBdHRhY2tFZmZlY3QgaW1wbGVtZW50cyBJU2tpbGxFZmZlY3Qge1xyXG4gICAgcHVibGljIG5hbWUgPSAnQmFzaWMgQXR0YWNrIEVmZmVjdCc7XHJcbiAgICBwdWJsaWMgdGFncyA9IFtEYW1hZ2VUYWcuQXR0YWNrLCBEYW1hZ2VUYWcuTWVsZWVdO1xyXG5cclxuICAgIHB1YmxpYyBleGVjdXRlKHRhcmdldDogQ2hhcmFjdGVyU3RhdGUsIHVzZXI6IENoYXJhY3RlclN0YXRlLFxyXG4gICAgICAgIG1vZHM6IERhbWFnZU1vZEdyb3VwKTogU2tpbGxSZXN1bHQge1xyXG5cclxuICAgICAgICByZXR1cm4gbmV3IFNraWxsUmVzdWx0KG1vZHMsIG5ldyBEYW1hZ2VNb2RHcm91cCgpLCAwKTtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIEJhc2ljQXR0YWNrIGltcGxlbWVudHMgSVNraWxsIHtcclxuICAgIHB1YmxpYyBuYW1lID0gJ0Jhc2ljIEF0dGFjayc7XHJcblxyXG4gICAgcHVibGljIHRpbWluZ0J5ID0gU2tpbGxUaW1pbmcuQXR0YWNrO1xyXG4gICAgLy8gRG8gbm90IG1vZGlmeSB0aGUgYmFzZSBhdHRhY2sgc3BlZWQgc2V0IGJ5IHRoZSBnZWFyXHJcbiAgICBwdWJsaWMgdGltZU1vZCA9IG5ldyBTdGF0TW9kcy5JbmNyZWFzZWRBdHRhY2tTcGVlZCgwKTtcclxuXHJcbiAgICBwdWJsaWMgZWZmZWN0cyA9IFtuZXcgQmFzaWNBdHRhY2tFZmZlY3QoKV07XHJcblxyXG4gICAgLyoqIEV4ZWN1dGUgZWFjaCBlZmZlY3Qgb2YgdGhpcyBza2lsbCBhbmQgcmV0dXJuIHRoZSByZXN1bHRzICovXHJcbiAgICBwdWJsaWMgZXhlY3V0ZSh0YXJnZXQ6IENoYXJhY3RlclN0YXRlLCB1c2VyOiBDaGFyYWN0ZXJTdGF0ZSxcclxuICAgICAgICBtb2RzOiBEYW1hZ2VNb2RHcm91cCk6IEFycmF5PFNraWxsUmVzdWx0PiB7XHJcblxyXG4gICAgICAgIGxldCByZXN1bHRzID0gdGhpcy5lZmZlY3RzLm1hcChlZmZlY3QgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gZWZmZWN0LmV4ZWN1dGUodGFyZ2V0LCB1c2VyLCBtb2RzLmNsb25lKCkpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0cztcclxuICAgIH1cclxufVxyXG5cclxuLyoqIFxyXG4gKiBObyBpbml0aWFsIGRhbWFnZSh6ZXJvZWQpIGJ1dCBwb3N0bW9kcyBzZXQgdG8gcmVwcmVzZW50IHRyYXZlbCB0aW1lLlxyXG4gKi9cclxuY2xhc3MgVG9zc2VkQmxhZGVFZmZlY3QgaW1wbGVtZW50cyBJU2tpbGxFZmZlY3Qge1xyXG4gICAgcHVibGljIG5hbWUgPSAnVG9zc2VkIEJsYWRlIEVmZmVjdCc7XHJcbiAgICBwdWJsaWMgdGFncyA9IFtEYW1hZ2VUYWcuQXR0YWNrLCBEYW1hZ2VUYWcuUmFuZ2VkXTtcclxuXHJcbiAgICBwdWJsaWMgZXhlY3V0ZSh0YXJnZXQ6IENoYXJhY3RlclN0YXRlLCB1c2VyOiBDaGFyYWN0ZXJTdGF0ZSxcclxuICAgICAgICBtb2RzOiBEYW1hZ2VNb2RHcm91cCk6IFNraWxsUmVzdWx0IHtcclxuXHJcbiAgICAgICAgLy8gWmVybyBpbml0aWFsIGRhbWFnZVxyXG4gICAgICAgIGxldCBpbml0aWFsID0gbmV3IERhbWFnZU1vZEdyb3VwKCk7XHJcbiAgICAgICAgaW5pdGlhbC5hZGQobmV3IFplcm8oKSwgRGFtYWdlTW9kRGlyZWN0aW9uLkFsd2F5cyk7XHJcblxyXG4gICAgICAgIC8vIFNjaGVkdWxlIGZ1dHVyZSBkYW1hZ2UgMC4zcyBmcm9tIG5vd1xyXG4gICAgICAgIGxldCBwb3N0RGVsYXkgPSBUaWNrc1BlclNlY29uZCAqIDAuMztcclxuICAgICAgICAvLyBQYXNzIHRocm91Z2ggbW9kcywgbm90aGluZyBzcGVjaWFsIGFwYXJ0IGZyb20gdGhlIGRlbGF5XHJcbiAgICAgICAgbGV0IHBvc3Rtb2RzID0gbW9kcztcclxuXHJcbiAgICAgICAgLy8gWmVybyB0aGUgaW5pdGlhbCBpbXBhY3RcclxuICAgICAgICByZXR1cm4gbmV3IFNraWxsUmVzdWx0KGluaXRpYWwsIHBvc3Rtb2RzLCBwb3N0RGVsYXkpO1xyXG4gICAgfVxyXG5cclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIFRvc3NlZEJsYWRlIGltcGxlbWVudHMgSVNraWxsIHtcclxuICAgIHB1YmxpYyBuYW1lID0gJ1Rvc3NlZCBCbGFkZSc7XHJcblxyXG4gICAgcHVibGljIHRpbWluZ0J5ID0gU2tpbGxUaW1pbmcuQXR0YWNrO1xyXG4gICAgLy8gMTAlIGluY3JlYXNlZCBpbmhlcmVudCBhdHRhY2sgc3BlZWQgZm9yIGZ1blxyXG4gICAgcHVibGljIHRpbWVNb2QgPSBuZXcgU3RhdE1vZHMuSW5jcmVhc2VkQXR0YWNrU3BlZWQoMC4xKTtcclxuXHJcbiAgICBwdWJsaWMgZWZmZWN0cyA9IFtuZXcgVG9zc2VkQmxhZGVFZmZlY3QoKV07XHJcblxyXG4gICAgLyoqIEV4ZWN1dGUgZWFjaCBlZmZlY3Qgb2YgdGhpcyBza2lsbCBhbmQgcmV0dXJuIHRoZSByZXN1bHRzICovXHJcbiAgICBwdWJsaWMgZXhlY3V0ZSh0YXJnZXQ6IENoYXJhY3RlclN0YXRlLCB1c2VyOiBDaGFyYWN0ZXJTdGF0ZSxcclxuICAgICAgICBtb2RzOiBEYW1hZ2VNb2RHcm91cCk6IEFycmF5PFNraWxsUmVzdWx0PiB7XHJcblxyXG4gICAgICAgIGxldCByZXN1bHRzID0gdGhpcy5lZmZlY3RzLm1hcChlZmZlY3QgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gZWZmZWN0LmV4ZWN1dGUodGFyZ2V0LCB1c2VyLCBtb2RzLmNsb25lKCkpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0cztcclxuICAgIH1cclxufVxyXG5cclxuLy8gUFJPQkxFTTogcmFuZ2UgbmVlZHMgdG8gYmUgcmVzb2x2ZWQgd2hlbiB0aGUgZXZlbnQgcmVzb2x2ZXMsIG5vdFxyXG4vLyB3aGVuIHRoZSBza2lsbCBpcyBleGVjdXRlZC4uLiBFYWNoIHNraWxsIGhhcyBhIHR5cGUgb2YgcmFuZ2UuLi5cclxuLy8gU09MVVRJT046IFJhbmdlRGFtYWdlTW9kIHdpbGwgYmUgY29uc3RydWN0ZWQgd2l0aCB0d28gQ2hhcmFjdGVyU3RhdGVzIGFuZFxyXG4vLyBkaXN0YW5jZSBpcyBjYWxjdWxhdGVkIGF0IGFwcGx5IHRpbWUuIEkgbGlrZSB0aGlzLlxyXG4iLCJpbXBvcnQgKiBhcyBTdGF0ZU1hY2hpbmUgZnJvbSAnc3RhdGUtbWFjaGluZSc7XHJcbmltcG9ydCB7IElEYW1hZ2VNb2QsIERhbWFnZU1vZEdyb3VwLCBEYW1hZ2VNb2REaXJlY3Rpb24gfSBmcm9tICcuL0RhbWFnZU1vZHMnO1xyXG5pbXBvcnQgeyBTdGF0cywgU3RhdE1vZEdyb3VwLCBiYXNlU3RhdHNBcmcsIElTdGF0TW9kIH0gZnJvbSAnLi9TdGF0TW9kcyc7XHJcbmltcG9ydCB7IEV2ZW50LCBTdGF0ZSB9IGZyb20gJy4vQVJQR1N0YXRlJztcclxuaW1wb3J0IHsgSVNraWxsLCBTa2lsbFRpbWluZyB9IGZyb20gJy4vU2tpbGwnO1xyXG5pbXBvcnQgeyBlbnRpdHlDb2RlIH0gZnJvbSAnLi9yYW5kb20nO1xyXG5cclxuZXhwb3J0IGNvbnN0IGVudW0gR2VhclNsb3Qge1xyXG4gICAgQ2hlc3QgPSAwLFxyXG4gICAgQm9vdHMsXHJcbiAgICBHbG92ZXMsXHJcbiAgICBIZWxtZXQsXHJcbiAgICBXZWFwb24sXHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBHZWFyIHtcclxuICAgIGNvbnN0cnVjdG9yKHB1YmxpYyBzbG90OiBHZWFyU2xvdCxcclxuICAgICAgICBwdWJsaWMgZGFtYWdlTW9kczogQXJyYXk8SURhbWFnZU1vZD4sXHJcbiAgICAgICAgcHVibGljIHN0YXRNb2RzOiBBcnJheTxJU3RhdE1vZD4pIHsgfVxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgTG9hZE91dCB7XHJcbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgZ2VhcjogQXJyYXk8R2Vhcj4pIHtcclxuICAgICAgICAvLyBFbnN1cmUgZWFjaCBwaWVjZSBvZiBnZWFyIGlzIHNpdHRpbmcgaW4gYSBkaWZmZXJlbnQgc2xvdFxyXG4gICAgICAgIGxldCB1c2VkU2xvdHMgPSBuZXcgU2V0PEdlYXJTbG90PigpO1xyXG4gICAgICAgIGxldCBvdmVybGFwcyA9IGdlYXIuc29tZShnID0+IHtcclxuICAgICAgICAgICAgaWYgKHVzZWRTbG90cy5oYXMoZy5zbG90KSkgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgIHVzZWRTbG90cy5hZGQoZy5zbG90KTtcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBpZiAob3ZlcmxhcHMpIHRocm93IEVycm9yKCdtdWx0aXBsZSBnZWFyIGl0ZW1zIGluIHNhbWUgc2xvdCcpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlIGFuIGFycmF5IG9mIERhbWFnZU1vZHMgZnJvbSB0aGlzIExvYWRPdXRcclxuICAgICAqXHJcbiAgICAgKiBUaGlzIGlzIHR5cGljYWxseSB1c2VkIHRvIHNlZWQgdGhlIGluaXRpYWwgRGFtYWdlTW9kR3JvdXAgZm9yIGEgaGl0LlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0TW9kcygpOiBBcnJheTxJRGFtYWdlTW9kPiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2Vhci5yZWR1Y2UoKHByZXYsIGcpOiBBcnJheTxJRGFtYWdlTW9kPiA9PiB7XHJcbiAgICAgICAgICAgIHByZXYucHVzaCguLi5nLmRhbWFnZU1vZHMpO1xyXG4gICAgICAgICAgICByZXR1cm4gcHJldjtcclxuICAgICAgICB9LCAoPEFycmF5PElEYW1hZ2VNb2Q+PltdKSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGUgYW4gYXJyYXkgb2YgU3RhdE1vZHMgZnJvbSB0aGlzIExvYWRPdXRcclxuICAgICAqXHJcbiAgICAgKiBUaGlzIGlzIHR5cGljYWxseSB1c2VkIHRvIHNlZWQgdGhlIGluaXRpYWwgU3RhdE1vZEdyb3VwLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0U3RhdE1vZHMoKTogQXJyYXk8SVN0YXRNb2Q+IHtcclxuICAgICAgICByZXR1cm4gdGhpcy5nZWFyLnJlZHVjZSgocHJldiwgZyk6IEFycmF5PElTdGF0TW9kPiA9PiB7XHJcbiAgICAgICAgICAgIHByZXYucHVzaCguLi5nLnN0YXRNb2RzKTtcclxuICAgICAgICAgICAgcmV0dXJuIHByZXY7XHJcbiAgICAgICAgfSwgKDxBcnJheTxJU3RhdE1vZD4+W10pKTtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIENoYXJhY3RlciB7XHJcbiAgICBwdWJsaWMgaWRlbnRpdHk6IHN0cmluZztcclxuICAgIGNvbnN0cnVjdG9yKHB1YmxpYyBsb2Fkb3V0OiBMb2FkT3V0LFxyXG4gICAgICAgIHB1YmxpYyBza2lsbDogSVNraWxsLFxyXG4gICAgICAgIHB1YmxpYyBiYXNlU3RhdHM6IHN0cmluZykge1xyXG5cclxuICAgICAgICB0aGlzLmlkZW50aXR5ID0gZW50aXR5Q29kZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBcclxuICAgICAqIFJldHVybiBhIERhbWFnZU1vZEdyb3VwIHJlcHJlc2VudGluZyB0aGUgZW50aXJlXHJcbiAgICAgKiBzZXQgb2YgRGFtYWdlIG1vZGlmaWVycyB0aGF0IHRoaXMgQ2hhcmFjdGVyIGNhbiBoYXZlLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0TW9kcygpOiBBcnJheTxJRGFtYWdlTW9kPiB7XHJcbiAgICAgICAgLy8gVE9ETzogaW5jbHVkZSBwYXNzaXZlcyBhbmQgc3VjaFxyXG4gICAgICAgIHJldHVybiB0aGlzLmxvYWRvdXQuZ2V0TW9kcygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmV0dXJuIGNvbXB1dGVkIHN0YXRzIGZvciB0aGlzIENoYXJhY3Rlci5cclxuICAgICAqL1xyXG4gICAgZ2V0IHN0YXRzKCk6IFN0YXRzIHtcclxuICAgICAgICAvLyBGZXRjaCBiYXNlbGluZSBmcm9tIGdlYXJcclxuICAgICAgICBsZXQgYmFzZSA9IHRoaXMubG9hZG91dC5nZXRTdGF0TW9kcygpO1xyXG4gICAgICAgIC8vIFRPRE86IGluY2x1ZGUgcGFzc2l2ZXMgYW5kIHN1Y2hcclxuICAgICAgICAvLyBGYWN0b3IgaW4gdGhlIHNraWxsJ3MgbW9kaWZpZXIgdG8gZXhlY3V0aW9uIHRpbWVcclxuICAgICAgICBiYXNlLnB1c2godGhpcy5za2lsbC50aW1lTW9kKTtcclxuXHJcbiAgICAgICAgLy8gQ3JlYXRlIGEgbmV3IGdyb3VwXHJcbiAgICAgICAgbGV0IGdyb3VwID0gbmV3IFN0YXRNb2RHcm91cCgpO1xyXG4gICAgICAgIGJhc2UuZm9yRWFjaChtb2QgPT4gZ3JvdXAuYWRkKG1vZCkpO1xyXG5cclxuICAgICAgICByZXR1cm4gZ3JvdXAuYXBwbHkobmV3IFN0YXRzKGJhc2VTdGF0c0FyZykpO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBTa2lsbENvbnRleHQge1xyXG4gICAgcHVibGljIHNraWxsOiBJU2tpbGw7XHJcbiAgICBwdWJsaWMgZXZlbnQ6IEV2ZW50O1xyXG5cclxuICAgIHB1YmxpYyBjYW5jZWwoKSB7XHJcbiAgICAgICAgdGhpcy5ldmVudC5jYW5jZWwoKTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gUG9zc2libGUgY29udGV4dHMgd2hpY2ggYSBzdGF0ZSBjYW4gaGF2ZS5cclxuZXhwb3J0IHR5cGUgU3RhdGVDb250ZXh0ID0gU2tpbGxDb250ZXh0O1xyXG5cclxuY2xhc3MgR2xvYmFsQ29udGV4dCB7XHJcbiAgICAvKiogQ3VycmVudCBzdGF0cyAqL1xyXG4gICAgcHVibGljIHN0YXRzOiBTdGF0cztcclxuICAgIC8qKiBcclxuICAgICAqIEJhc2VsaW5lIHN0YXRzIHRvIGNoZWNrIGFzIG5lY2Vzc2FyeVxyXG4gICAgICogaWUsIGZvciBtYXhpbXVtIGhlYWx0aFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgYmFzZVN0YXRzOiBTdGF0cztcclxuICAgIHB1YmxpYyBza2lsbDogSVNraWxsO1xyXG4gICAgcHVibGljIHRhcmdldDogQ2hhcmFjdGVyU3RhdGU7XHJcblxyXG4gICAgY29uc3RydWN0b3IoYmFzZTogQ2hhcmFjdGVyKSB7XHJcbiAgICAgICAgLy8gQ2FsY3VsYXRlIGJhc2Ugc3RhdHMgb25jZVxyXG4gICAgICAgIGxldCBiYXNlU3RhdHM6IFN0YXRzO1xyXG4gICAgICAgICh7IHN0YXRzOiBiYXNlU3RhdHMsIHNraWxsOiB0aGlzLnNraWxsIH0gPSBiYXNlKTtcclxuICAgICAgICAvLyBBc3NpZ24gb3VyIGJhc2UgYW5kIGZyZWV6ZSBpdCB0byBwcmV2ZW50IG1vZGlmaWNhdGlvblxyXG4gICAgICAgIHRoaXMuYmFzZVN0YXRzID0gYmFzZVN0YXRzLmNsb25lKCk7XHJcbiAgICAgICAgT2JqZWN0LmZyZWV6ZSh0aGlzLmJhc2VTdGF0cyk7XHJcbiAgICAgICAgLy8gQXNzaWduIG91ciB0ZW1wb3Jhcnkgc3RhdHNcclxuICAgICAgICB0aGlzLnN0YXRzID0gYmFzZVN0YXRzLmNsb25lKCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBDaGFyYWN0ZXJTdGF0ZSBpbXBsZW1lbnRzIFN0YXRlTWFjaGluZSB7XHJcbiAgICAvLyBUaGlzIHByZWFtYmxlIGhhcyB0d28gcGFydHMuXHJcbiAgICAvLyBGaXJzdCwgd2UgZW5zdXJlIHRoYXQgdGhlIFN0YXRlTWFjaGluZSBpbnRlcmZhY2UgaXMgaW1wbGVtZW50ZWRcclxuICAgIHB1YmxpYyBjdXJyZW50OiBDaGFyYWN0ZXJTdGF0ZXM7XHJcbiAgICBwdWJsaWMgaXM6IFN0YXRlTWFjaGluZUlzO1xyXG4gICAgcHVibGljIGNhbjogU3RhdGVNYWNoaW5lQ2FuO1xyXG4gICAgcHVibGljIGNhbm5vdDogU3RhdGVNYWNoaW5lQ2FuO1xyXG4gICAgcHVibGljIGVycm9yOiBTdGF0ZU1hY2hpbmVFcnJvckNhbGxiYWNrO1xyXG4gICAgcHVibGljIGlzRmluaXNoZWQ6IFN0YXRlTWFjaGluZUlzRmluaXNoZWQ7XHJcbiAgICBwdWJsaWMgdHJhbnNpdGlvbjogU3RhdGVNYWNoaW5lVHJhbnNpdGlvbjtcclxuICAgIHB1YmxpYyB0cmFuc2l0aW9uczogU3RhdGVNYWNoaW5lVHJhbnNpdGlvbnM7XHJcbiAgICAvLyBTZWNvbmQsIHdlIGRlY2xhcmUgYW55IHRyYW5zaXRpb25zIHRoYXQgYXJlIGRlZmluZWQgYmVsb3dcclxuICAgIC8vIHNvIHRoYXQgdGhleSBjYW4gYmUgY2FsbGVkIGluIGEgdHlwZSBzYWZlIG1hbm5lci5cclxuICAgIHB1YmxpYyBlbmdhZ2U6ICh0YXJnZXQ6IENoYXJhY3RlclN0YXRlKSA9PiB7fTtcclxuICAgIHB1YmxpYyBkaXNlbmdhZ2U6ICgpID0+IHt9O1xyXG4gICAgcHVibGljIGRlY2lkZTogKCkgPT4ge307XHJcbiAgICBwdWJsaWMgc3RhcnRza2lsbDogKCkgPT4ge307XHJcbiAgICBwdWJsaWMgZW5kc2tpbGw6ICgpID0+IHt9O1xyXG4gICAgcHVibGljIGRpZTogKCkgPT4ge307XHJcblxyXG4gICAgLy8gQ29udGV4dCBzaGFyZWQgYWNyb3NzIHN0YXRlc1xyXG4gICAgcHVibGljIGNvbnRleHQ6IEdsb2JhbENvbnRleHQ7XHJcblxyXG4gICAgLy8gUGVyLXN0YXRlIGNvbnRleHQuXHJcbiAgICAvLyBUaGlzIGlzIHNldCBhbmQgY2xlYXJlZCB3aGVuIGVudGVyaW5nIG9yIGxlYXZpbmcgYSBnaXZlbiBzdGF0ZS5cclxuICAgIC8vIFxyXG4gICAgLy8gVGhpcyBtZWFucyB0aGF0IGV2ZW50IGhhbmRsZXJzIGNhbiBleHBlY3QgdGhlaXIgc3RhdGUgdG8gYWxyZWFkeVxyXG4gICAgLy8gZXhpc3Qgd2hlbiBlbnRlcmluZy4gVGhleSBuZWVkIG9ubHkgcGVyZm9ybSBhIHR5cGUgYXNzZXJ0aW9uLlxyXG4gICAgcHJpdmF0ZSBzY3JhdGNoOiBTdGF0ZUNvbnRleHQgfCBudWxsO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHByaXZhdGUgY2hhcmFjdGVyOiBDaGFyYWN0ZXIsIHB1YmxpYyBzdGF0ZTogU3RhdGUpIHtcclxuICAgICAgICB0aGlzLmNvbnRleHQgPSBuZXcgR2xvYmFsQ29udGV4dChjaGFyYWN0ZXIpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBhcHBseVNraWxsKHRhcmdldDogQ2hhcmFjdGVyU3RhdGUsIHN0YXRlOiBTdGF0ZSkge1xyXG4gICAgICAgIC8vIENyZWF0ZSBhIERhbWFnZU1vZEdyb3VwIHRvIGhvbGQgb3VyIGFjdGlvbnNcclxuICAgICAgICBsZXQgbW9kcyA9IG5ldyBEYW1hZ2VNb2RHcm91cCgpO1xyXG4gICAgICAgIC8vIEFkZCBvdXIgbW9kcyBhcyB0aGUgZGFtYWdlIERlYWxlclxyXG4gICAgICAgIHRoaXMuY2hhcmFjdGVyLmdldE1vZHMoKS5mb3JFYWNoKG1vZCA9PiB7XHJcbiAgICAgICAgICAgIG1vZHMuYWRkKG1vZCwgRGFtYWdlTW9kRGlyZWN0aW9uLkRlYWxpbmcpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIC8vIEFkZCBvdXIgdGFyZ2V0J3MgbW9kcyBhcyB0aGUgZGFtYWdlIFRha2VyXHJcbiAgICAgICAgdGFyZ2V0LmNoYXJhY3Rlci5nZXRNb2RzKCkuZm9yRWFjaChtb2QgPT4ge1xyXG4gICAgICAgICAgICBtb2RzLmFkZChtb2QsIERhbWFnZU1vZERpcmVjdGlvbi5UYWtpbmcpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBQYXNzIHRoZSBEYW1hZ2VNb2RHcm91cCBvZmYgdG8gdGhlIHNraWxsIGZvciBleGVjdXRpb25cclxuICAgICAgICAvLyBhbmQgZXhlY3V0ZSB0aGUgcmVzdWx0cy5cclxuICAgICAgICB0aGlzLmNoYXJhY3Rlci5za2lsbC5leGVjdXRlKHRhcmdldCwgdGhpcywgbW9kcylcclxuICAgICAgICAgICAgLmZvckVhY2gocmVzdWx0ID0+IHJlc3VsdC5leGVjdXRlKHRhcmdldCwgc3RhdGUpKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUHJlcGFyZSBzdGF0ZSBmb3IgYW55dGhpbmcgaGFwcGVuaW5nIGluIHRoZSBlbmdhZ2VkIHN0YXRlICovXHJcbiAgICBwcml2YXRlIG9uZW50ZXJlbmdhZ2VkKCkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdvbmVudGVyZW5nYWdlZCcsIHRoaXMuY3VycmVudCwgdGhpcy5zY3JhdGNoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGVyZm9ybSBhY3Rpb25zIHVzaW5nIHByZS1wcmVwYXJlZCBzdGF0ZS4gKi9cclxuICAgIHByaXZhdGUgb25lbmdhZ2UoZTogc3RyaW5nLCBmcm9tOiBDaGFyYWN0ZXJTdGF0ZXMsIHRvOiBDaGFyYWN0ZXJTdGF0ZXMsXHJcbiAgICAgICAgdGFyZ2V0OiBDaGFyYWN0ZXJTdGF0ZSkge1xyXG5cclxuICAgICAgICAvLyBTZXQgdGFyZ2V0IFxyXG4gICAgICAgIHRoaXMuY29udGV4dC50YXJnZXQgPSB0YXJnZXQ7XHJcblxyXG4gICAgICAgIC8vIERlY2lkZSBob3cgdG8gcHJvY2VlZFxyXG4gICAgICAgIHRoaXMuZGVjaWRlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbmRlY2lkZSgpIHtcclxuICAgICAgICAvLyBDaGVjayBpZiB0YXJnZXQgZGVhZCB5ZXRcclxuICAgICAgICBpZiAodGhpcy50YXJnZXQuaXNEZWFkKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZGlzZW5nYWdlKCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc29sZS5sb2coJ29uZGVjaWRlJywgdGhpcy5jdXJyZW50KTtcclxuXHJcbiAgICAgICAgLy8gU3RhcnQgdXNpbmcgYSBza2lsbCB0byBoaXQgdGhlIHRhcmdldFxyXG4gICAgICAgIHRoaXMuc3RhcnRza2lsbCgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25lbnRlcnNraWxsd2FpdCgpIHtcclxuICAgICAgICBjb25zb2xlLmxvZygnb25lbnRlcnNraWxsd2FpdCcsIHRoaXMuY3VycmVudCk7XHJcbiAgICAgICAgdGhpcy5zY3JhdGNoID0gbmV3IFNraWxsQ29udGV4dCgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25zdGFydHNraWxsKCkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdvbnN0YXJ0c2tpbGwnLCB0aGlzLmN1cnJlbnQsIHRoaXMuc2NyYXRjaCk7XHJcbiAgICAgICAgaWYgKCF0aGlzLnNjcmF0Y2gpIHRocm93ICdvbnN0YXJ0c2tpbGwgd2l0aG91dCBzY3JhdGNoJztcclxuXHJcbiAgICAgICAgLy8gU2NoZWR1bGUgc2tpbGwgZm9yIGNvbXBsZXRpb25cclxuICAgICAgICBsZXQgd2FpdFRpbWU6IG51bWJlcjtcclxuICAgICAgICBzd2l0Y2ggKHRoaXMuY29udGV4dC5za2lsbC50aW1pbmdCeSkge1xyXG4gICAgICAgICAgICBjYXNlIFNraWxsVGltaW5nLkF0dGFjazpcclxuICAgICAgICAgICAgICAgIHdhaXRUaW1lID0gdGhpcy5jb250ZXh0LnN0YXRzLmF0dGFja1RpbWU7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBTa2lsbFRpbWluZy5BdHRhY2s6XHJcbiAgICAgICAgICAgICAgICB3YWl0VGltZSA9IHRoaXMuY29udGV4dC5zdGF0cy5jYXN0VGltZTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgdGhyb3cgRXJyb3IoJ2ZlbGwgdGhyb3VnaCB0aW1pbmdCeSBzd2l0Y2gnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc29sZS5sb2codGhpcy5zdGF0ZSk7XHJcbiAgICAgICAgbGV0IGUgPSBuZXcgRXZlbnQodGhpcy5zdGF0ZS5ub3cgKyB3YWl0VGltZSxcclxuICAgICAgICAgICAgKHN0YXRlOiBTdGF0ZSk6IEV2ZW50IHwgbnVsbCA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmVuZHNraWxsKCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfSwgbnVsbCk7XHJcblxyXG4gICAgICAgIHRoaXMuc2NyYXRjaC5ldmVudCA9IGU7XHJcbiAgICAgICAgdGhpcy5zY3JhdGNoLnNraWxsID0gdGhpcy5jb250ZXh0LnNraWxsO1xyXG5cclxuICAgICAgICB0aGlzLnN0YXRlLmFkZEV2ZW50KGUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQWN0dWFsbHkgcGVyZm9ybSB0aGUgc2tpbGxcclxuICAgICAqXHJcbiAgICAgKiBOT1RFOiB0aGlzIGlzIGEgYmVmb3JlIGhhbmRsZXIgcmF0aGVyIHRoYW4gZXhhY3Qgb25cclxuICAgICAqICAgICAgIGFzIHRoaXMgcHJlc2VydmVzIHRoZSBzY3JhdGNoLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uYmVmb3JlZW5kc2tpbGwoKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ29uYmVmb3JlZW5kc2tpbGwnLCB0aGlzLmN1cnJlbnQsIHRoaXMuc2NyYXRjaCk7XHJcbiAgICAgICAgdGhpcy5hcHBseVNraWxsKHRoaXMudGFyZ2V0LCB0aGlzLnN0YXRlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEhhbmRsZSBmb2xsb3cgdXAgZm9yIHBlcmZvcm1pbmcgYSBza2lsbC5cclxuICAgICAqXHJcbiAgICAgKiBOT1RFOiBza2lsbCB3YXMgZXhlY3V0ZWQgaW4gb25iZWZvcmUgaGFuZGxlciBmb3IgZW5kc2tpbGwuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25lbmRza2lsbCgpIHtcclxuICAgICAgICB0aGlzLmRlY2lkZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25sZWF2ZXNraWxsd2FpdCgpIHtcclxuICAgICAgICBjb25zb2xlLmxvZygnb25lbGVhdmVza2lsbHdhaXQnLCB0aGlzLmN1cnJlbnQpO1xyXG4gICAgICAgIGlmICghdGhpcy5zY3JhdGNoKSB0aHJvdyAnb25sZWF2ZXNraWxsd2FpdCB3aXRob3V0IHNjcmF0Y2gnO1xyXG4gICAgICAgIC8vIENhbmNlbCBhbnkgZXZlbnQgaWYgbm90IGV4ZWN1dGVkXHJcbiAgICAgICAgbGV0IHtldmVudH0gPSB0aGlzLnNjcmF0Y2g7XHJcbiAgICAgICAgaWYgKCFldmVudC53YXNFeGVjdXRlZCkgZXZlbnQuY2FuY2VsKCk7XHJcbiAgICAgICAgLy8gWmVybyBzY3JhdGNoXHJcbiAgICAgICAgdGhpcy5zY3JhdGNoID0gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFRoaXMgQ2hhcmFjdGVyU3RhdGUgZ29lcyBpbnRvIHRoZSB1bnJlY292ZXJhYmxlIHN0YXRlIG9mICdkZWFkJ1xyXG4gICAgICpcclxuICAgICAqIE5PVEU6IGl0IGlzIGV4cGVjdGVkIHRoYXQgJ29uZWxlYXZlU1RBVEUnIGhhbmRsZXJzIHdpbGwgdGFrZSBjYXJlXHJcbiAgICAgKiBvZiBjYW5jZWxpbmcgYW55IGV2ZW50cyB3aGljaCBuZWVkIHRvIGJlIGNhbmNlbGVkIGFuZCBzaW1pbGFyLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uZGllKCkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdvbmRpZScsIHRoaXMuY3VycmVudCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUmV0dXJuIHRoZSBjdXJyZW50IHRhcmdldCB0aGlzIHN0YXRlIGhhc1xyXG4gICAgZ2V0IHRhcmdldCgpOiBDaGFyYWN0ZXJTdGF0ZSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udGV4dC50YXJnZXQ7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUmV0dXJuIHRoZSBjdXJyZW50IHRhcmdldCB0aGlzIHN0YXRlIGhhc1xyXG4gICAgZ2V0IGlzRGVhZCgpOiBCb29sZWFuIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5pcygnZGVhZCcpO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgdHlwZSBDaGFyYWN0ZXJTdGF0ZXMgPVxyXG4gICAgJ2lkbGUnXHJcbiAgICB8ICdlbmdhZ2VkJ1xyXG4gICAgfCAnZGVjaWRpbmcnXHJcbiAgICB8ICdza2lsbHdhaXQnXHJcbiAgICB8ICdkZWFkJ1xyXG5cclxuU3RhdGVNYWNoaW5lLmNyZWF0ZSh7XHJcbiAgICB0YXJnZXQ6IENoYXJhY3RlclN0YXRlLnByb3RvdHlwZSxcclxuICAgIGluaXRpYWw6ICdpZGxlJyxcclxuICAgIGV2ZW50czogW1xyXG4gICAgICAgIHsgbmFtZTogJ2VuZ2FnZScsIGZyb206ICdpZGxlJywgdG86ICdlbmdhZ2VkJyB9LFxyXG5cclxuICAgICAgICB7IG5hbWU6ICdkZWNpZGUnLCBmcm9tOiAnZW5nYWdlZCcsIHRvOiAnZGVjaWRpbmcnIH0sXHJcblxyXG4gICAgICAgIHsgbmFtZTogJ3N0YXJ0c2tpbGwnLCBmcm9tOiAnZGVjaWRpbmcnLCB0bzogJ3NraWxsd2FpdCcgfSxcclxuICAgICAgICB7IG5hbWU6ICdlbmRza2lsbCcsIGZyb206ICdza2lsbHdhaXQnLCB0bzogJ2VuZ2FnZWQnIH0sXHJcblxyXG4gICAgICAgIHsgbmFtZTogJ2Rpc2VuZ2FnZScsIGZyb206IFsnZGVjaWRpbmcnLCAnZW5nYWdlZCddLCB0bzogJ2lkbGUnIH0sXHJcblxyXG4gICAgICAgIHsgbmFtZTogJ2RpZScsIGZyb206ICcqJywgdG86ICdkZWFkJyB9LFxyXG4gICAgXSxcclxufSk7XHJcbiIsImltcG9ydCB7IFN0YXRlLCBUaWNrc1BlclNlY29uZCwgRXZlbnQgfSBmcm9tICcuL0FSUEdTdGF0ZSc7XHJcbmltcG9ydCB7IENoYXJhY3RlciwgQ2hhcmFjdGVyU3RhdGUsIExvYWRPdXQsIEdlYXIsIEdlYXJTbG90IH0gZnJvbSAnLi9DaGFyYWN0ZXInO1xyXG5pbXBvcnQgeyBEYW1hZ2UsIERhbWFnZVRhZywgRWxlbWVudHMgfSBmcm9tICcuL0RhbWFnZSc7XHJcbmltcG9ydCB7IERhbWFnZU1vZEdyb3VwLCBEYW1hZ2VNb2REaXJlY3Rpb24gfSBmcm9tICcuL0RhbWFnZU1vZHMnO1xyXG5pbXBvcnQgKiBhcyBEYW1hZ2VNb2RzIGZyb20gJy4vRGFtYWdlTW9kUmVnaXN0cnknO1xyXG5pbXBvcnQgKiBhcyBTZWVkUmFuZG9tIGZyb20gJ3NlZWRyYW5kb20nO1xyXG5pbXBvcnQgKiBhcyBTdGF0TW9kcyBmcm9tICcuL1N0YXRNb2RzJztcclxuaW1wb3J0ICogYXMgU2tpbGxzIGZyb20gJy4vU2tpbGwnO1xyXG5cclxubGV0IHN0YXJ0ID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcblxyXG5leHBvcnQgY2xhc3MgT3JhbmdlIHtcclxuICAgIHB1YmxpYyBmbGF2b3I6IHN0cmluZztcclxuICAgIGNvbnN0cnVjdG9yKGZsYXZvcjogc3RyaW5nKSB7XHJcbiAgICAgICAgdGhpcy5mbGF2b3IgPSBmbGF2b3I7XHJcbiAgICB9XHJcbn1cclxuXHJcbmNvbnN0IGdsb2JhbFN0YXRlID0gbmV3IFN0YXRlKCk7XHJcblxyXG5sZXQgbmV4dEV2ZW50ID0gbmV3IEV2ZW50KDAsXHJcbiAgICAoc3RhdGU6IFN0YXRlKSA9PiBudWxsLFxyXG4gICAgKHN0YXRlOiBTdGF0ZSkgPT4gbnVsbCk7XHJcbmdsb2JhbFN0YXRlLmFkZEV2ZW50KG5leHRFdmVudCk7XHJcblxyXG5jb25zb2xlLmxvZygnZm9yIGZ1Y2tzIHNha2UgdGhpcyB3b3JrcyEnKTtcclxuXHJcbi8qIHRzbGludDpkaXNhYmxlICovXHJcbig8YW55PndpbmRvdykuZ2xvYmFsU3RhdGUgPSBnbG9iYWxTdGF0ZTtcclxuLyogdHNsaW50OmVuYWJsZSAqL1xyXG5cclxubGV0IGQgPSBuZXcgRGFtYWdlKG5ldyBTZXQoW0RhbWFnZVRhZy5NZWxlZV0pLCA0MCwgMTAsIDAsIDEwKTtcclxuXHJcbmxldCBncm91cCA9IG5ldyBEYW1hZ2VNb2RHcm91cCgpO1xyXG5ncm91cC5hZGQobmV3IERhbWFnZU1vZHMuQXJtb3IoMTUpLCBEYW1hZ2VNb2REaXJlY3Rpb24uVGFraW5nKTtcclxuZ3JvdXAuYWRkKG5ldyBEYW1hZ2VNb2RzLkFybW9yKDEwKSwgRGFtYWdlTW9kRGlyZWN0aW9uLlRha2luZyk7XHJcbmdyb3VwLmFkZChuZXcgRGFtYWdlTW9kcy5Bcm1vcig1MCksIERhbWFnZU1vZERpcmVjdGlvbi5UYWtpbmcpO1xyXG5ncm91cC5hZGQobmV3IERhbWFnZU1vZHMuQXJtb3IoMjUpLCBEYW1hZ2VNb2REaXJlY3Rpb24uVGFraW5nKTtcclxuZ3JvdXAuYWRkKG5ldyBEYW1hZ2VNb2RzLlJlc2lzdGFuY2UoMC40LCBFbGVtZW50cy5GaXJlKSxcclxuICAgIERhbWFnZU1vZERpcmVjdGlvbi5UYWtpbmcpO1xyXG5ncm91cC5hZGQobmV3IERhbWFnZU1vZHMuUmVzaXN0YW5jZSgwLjEsIEVsZW1lbnRzLkZpcmUpLFxyXG4gICAgRGFtYWdlTW9kRGlyZWN0aW9uLlRha2luZyk7XHJcbmdyb3VwLmFkZChuZXcgRGFtYWdlTW9kcy5SZXNpc3RhbmNlKDAuNzUsIEVsZW1lbnRzLkNvbGQpLFxyXG4gICAgRGFtYWdlTW9kRGlyZWN0aW9uLlRha2luZyk7XHJcblxyXG5sZXQgbmV3RCA9IGdyb3VwLmFwcGx5KGQpO1xyXG5jb25zb2xlLmxvZyhuZXdEKTtcclxuaWYgKG5ld0QucGh5cyAhPT0gMzIpIHtcclxuICAgIHRocm93IEVycm9yKCdwaHlzIGlzIG5vdCAzMiB3dGYnKTtcclxufVxyXG5pZiAobmV3RC5maXJlICE9PSA1KSB7XHJcbiAgICB0aHJvdyBFcnJvcignZmlyZSBpcyBub3QgNSB3dGYnKTtcclxufVxyXG5cclxuU2VlZFJhbmRvbSgndGVzdGluZyEnLCB7IGdsb2JhbDogdHJ1ZSB9KTtcclxuXHJcbmxldCBiYXNpY0xvYWRvdXQgPSBuZXcgTG9hZE91dChbXHJcbiAgICBuZXcgR2VhcihHZWFyU2xvdC5HbG92ZXMsIFtcclxuICAgICAgICBuZXcgRGFtYWdlTW9kcy5Mb2NhbFBoeXNpY2FsKDIsIDMpLFxyXG4gICAgICAgIG5ldyBEYW1hZ2VNb2RzLkxvY2FsUGh5c2ljYWwoMiwgNyksXHJcbiAgICAgICAgbmV3IERhbWFnZU1vZHMuQXJtb3IoMTApLFxyXG4gICAgICAgIG5ldyBEYW1hZ2VNb2RzLkFybW9yKDEwKSxcclxuICAgICAgICBuZXcgRGFtYWdlTW9kcy5JbmNyZWFzZWRDcml0Q2hhbmNlKDAuNTApLFxyXG4gICAgXSxcclxuICAgICAgICBbXHJcbiAgICAgICAgICAgIG5ldyBTdGF0TW9kcy5GbGF0QWRkZWRIZWFsdGgoMTApLFxyXG4gICAgICAgIF0pLFxyXG4gICAgbmV3IEdlYXIoR2VhclNsb3QuQm9vdHMsIFtdLFxyXG4gICAgICAgIFtcclxuICAgICAgICAgICAgbmV3IFN0YXRNb2RzLkluY3JlYXNlZE1vdmVzcGVlZCgwLjI1KSxcclxuICAgICAgICBdKSxcclxuXSk7XHJcblxyXG5sZXQgYmFzZXggPSBuZXcgQ2hhcmFjdGVyKGJhc2ljTG9hZG91dCwgbmV3IFNraWxscy5CYXNpY0F0dGFjaygpLCAnd29yc2VuZXNzJyk7XHJcbmxldCBiYXNleSA9IG5ldyBDaGFyYWN0ZXIoYmFzaWNMb2Fkb3V0LCBuZXcgU2tpbGxzLlRvc3NlZEJsYWRlKCksICd3b3JzZW5lc3MnKTtcclxubGV0IHggPSBuZXcgQ2hhcmFjdGVyU3RhdGUoYmFzZXgsIGdsb2JhbFN0YXRlKTtcclxubGV0IHkgPSBuZXcgQ2hhcmFjdGVyU3RhdGUoYmFzZXksIGdsb2JhbFN0YXRlKTtcclxuY29uc29sZS5sb2coeCk7XHJcbnguZW5nYWdlKHkpO1xyXG55LmVuZ2FnZSh4KTtcclxuXHJcbi8qIHRzbGludDpkaXNhYmxlICovXHJcbig8YW55PndpbmRvdykueCA9IHg7XHJcbig8YW55PndpbmRvdykueSA9IHk7XHJcbi8qIHRzbGludDplbmFibGUgKi9cclxuXHJcbi8vIHguZGlzZW5nYWdlKCk7XHJcbmNvbnNvbGUubG9nKHgpO1xyXG5cclxuLy8gU2ltdWxhdGUgMSBtaW51dGUgb2YgY29tYmF0XHJcbmZvciAobGV0IGkgPSAwOyBpIDwgVGlja3NQZXJTZWNvbmQgKiA2MCAmJiAhKHguaXNEZWFkIHx8IHkuaXNEZWFkKTsgaSsrKSB7XHJcbiAgICBsZXQgY29tcGxldGVkID0gZ2xvYmFsU3RhdGUuc3RlcCgpO1xyXG4gICAgaWYgKGNvbXBsZXRlZCA+IDApIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhgcmV0aXJlZCAke2NvbXBsZXRlZH0gZXZlbnRzYCk7XHJcbiAgICB9XHJcbn1cclxuY29uc29sZS5sb2coeS5jb250ZXh0KTtcclxuXHJcbmxldCBlbmQgPSBwZXJmb3JtYW5jZS5ub3coKTtcclxuY29uc29sZS5sb2coYHRvb2sgJHsoZW5kIC0gc3RhcnQpLnRvRml4ZWQoMil9bXNgKTtcclxuIiwiZXhwb3J0IGludGVyZmFjZSBJRXZlbnQge1xyXG4gICAgd2hlbjogbnVtYmVyO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gYXBwbGVzKCkge1xyXG4gICAgY29uc29sZS5sb2coJ2FwcGxlcycpO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgSUVmZmVjdEZ1bmMge1xyXG4gICAgKHNvdXJjZTogc3RyaW5nLCB0YXJnZXQ6IHN0cmluZywgZGFtYWdlOiBudW1iZXIpOiBFdmVudDtcclxufVxyXG4iLCJpbXBvcnQgeyBTdGF0ZSB9IGZyb20gJy4vQVJQR1N0YXRlJztcclxuaW1wb3J0IHsgQ2hhcmFjdGVyLCBDaGFyYWN0ZXJTdGF0ZSB9IGZyb20gJy4vQ2hhcmFjdGVyJztcclxuXHJcbi8qKlxyXG4gKiBBbiBhcmd1bWVudCB0byBQYWNrIHRoYXQgYnVuZGxlcyBpbml0aWFsIENoYXJhY3RlciBpbmZvcm1hdGlvblxyXG4gKiBhbG9uZyB3aXRoIG5lY2Vzc2FyeSBiZWhhdmlvci5cclxuICovXHJcbmNsYXNzIFBhY2tJbml0IHtcclxuICAgIGNvbnN0cnVjdG9yKHB1YmxpYyBjaGFyYWN0ZXI6IENoYXJhY3RlciwgcHVibGljIGJlaGF2aW9yOiBzdHJpbmcpIHsgfVxyXG59XHJcblxyXG5jbGFzcyBQYWNrIHtcclxuICAgIHB1YmxpYyBzdGF0ZXM6IEFycmF5PENoYXJhY3RlclN0YXRlPiA9IFtdO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGluaXRzOiBBcnJheTxQYWNrSW5pdD4sIHN0YXRlOiBTdGF0ZSkge1xyXG4gICAgICAgIGluaXRzLmZvckVhY2goYyA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuc3RhdGVzLnB1c2gobmV3IENoYXJhY3RlclN0YXRlKGMuY2hhcmFjdGVyLCBzdGF0ZSkpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG59XHJcbiJdfQ==
