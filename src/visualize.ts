// import { TicksPerSecond } from './ARPGState';
import {
    //     RecordFlavor,
    IRecord, ImplictRecordToString,
    //     IMovementRecord, IDamageRecord, IDeathRecord
} from './Records';
import { StateSerial, PackSerial, CharacterStateSerial } from './Serial';
// import * as d3 from 'd3';
import * as Vue from 'vue';
import Component from 'vue-class-component';

// import root from './components/root';

@Component({
    props: {
        character: Object,
    },
    template: `
    <div>
        <b>{{character.EntityCode}} at {{clean(character.Position)}}</b>
        <div>{{clean(character.health)}}/{{clean(character.maxHealth)}}</div>
        <div>{{clean(character.mana)}}/{{clean(character.maxMana)}}</div>
    </div>`,
})
class Character extends Vue {
    private readonly character: CharacterStateSerial;

    public mounted() {
        if (!this.character) return;
        console.log(`holy shit I'm mounted with entity=${this.character.EntityCode}!`);
    }

    // Cleanup a number for display
    public clean(value: number): number {
        return Math.floor(value);
    }
}

@Component({
    props: {
        pack: Object,
    },
    template: `
    <div>
        <character
            v-for="char in characters" 
            v-bind:character="char"></character>
    </div>`,
    components: {
        Character,
    },
})
class Pack extends Vue {
    private readonly pack: PackSerial;

    public mounted() {
        if (!this.pack) return;
        console.log(`holy shit I'm mounted with isDead=${this.pack.isDead}!`);
    }

    public get characters(): Array<CharacterStateSerial> {
        return this.pack.states;
    }
}

@Component({
    props: {
        event: Object,
    },
    template: `
    <div>
        {{event.when}} - {{text}}
    </div>`,
})
class Event extends Vue {
    private readonly event: IRecord;

    public mounted() {
        if (!this.event) return;
    }

    public get text(): string {
        return ImplictRecordToString(this.event);
    }
}

@Component({
    props: {
        when: Number,
        events: Array,
        historyDuration: Number,
    },
    template: `
    <div>
        <event
            v-for="e in recent" 
            v-bind:event="e"></event>
    </div>`,
    components: {
        Event,
    },
})
class EventLog extends Vue {
    private readonly when: number;
    private readonly events: Array<IRecord>;
    private readonly historyDuration: number;

    private history: Array<IRecord> = [];

    public mounted() {
        if (!this.events) return;
    }

    /** If recent is triggered, then a prop is updated */
    private get recent(): Array<IRecord> {
        // Check to see if there are new events for us
        // to look through
        if (this.events.length > 0) {
            this.history.push(...this.events);
            // Filter out events past duration and sort
            this.history = this.history
                .filter(e => (this.when - e.when) < this.historyDuration)
                .sort((a, b) => {
                    let delta = a.when - b.when;
                    if (delta !== 0) return delta;
                    return a.flavor;
                });
        }
        return this.history;
    }
}

@Component({
    props: {
        state: Object,
    },
    template: `
    <div>
        <div :style="whenStyle">Tick-Time={{state.when}}</div>
        <template v-for="(pack, index) in packs">
            <hr v-if="index">
            <pack :pack="pack"></character>
        </template>
        <event-log
            :history-duration="100"
            :when=when
            :events=events></event-log>
    </div>`,
    components: {
        Pack, EventLog,
    },
})
class State extends Vue {
    private readonly state: StateSerial;

    public mounted() {
        if (!this.state) return;
    }

    public get when(): Number {
        return this.state.when;
    }

    public get packs(): Array<PackSerial> {
        return this.state.packs;
    }

    public get events(): Array<IRecord> {
        return this.state.events;
    }

    public get whenStyle(): Object {
        let color = 'black';
        if (this.when > 500) {
            color = 'red';
        }
        return {
            color,
            fontSize: '2em',
        };
    }
}

export interface IMountPoint {
    $data: {
        state: StateSerial,
    };
}

export function renderVue(): IMountPoint {
    // mount
    let mount = new Vue({
        el: '#el',
        template: `
            <div>
                <div>apples</div>
                <state :state="state"></pack>
            </div>
        `,
        components: {
            State,
        },
        data: () => {
            return {
                state: {
                    when: 0,
                    packs: [],
                    events: [],
                },
                propMessage: 'holy shit!',
            };
        },
    });
    if (!mount) throw Error('vue not mounted');
    // console.log(mount);

    // let snapshots: Array<string> = (<any>window).snapshots;
    // let renderState: StateSerial = JSON.parse(snapshots[0]);

    // (<any>mount.$data).state = renderState;

    // Yes, this is hacky but this is the best we can do
    // for type safety right now :|
    return <IMountPoint>(<any>mount);
}

export function visualize(seedState: Object, events: Array<IRecord>) {
    console.log('yeah, about that');
}
