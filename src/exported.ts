export interface IEvent {
    when: number;
}

export function apples() {
    console.log('apples');
}

interface IEffectFunc {
    (source: string, target: string, damage: number): Event;
}
