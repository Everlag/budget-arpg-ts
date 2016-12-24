/** Calculate a random int from an interval */
export function intfromInterval(min: number, max: number): number {
    return Math.floor((Math.random() * (max - min + 1)) + min);
}

/** Return a new hexadecimal entity code */
export function entityCode(): string {
    let code = new Array<string>();
    for (let i = 0; i <= 1; i++) {
        code.push(intfromInterval(0, 255).toString(16));
    }
    return code.join('');
}

/** 
 * Roll for success of an action
 *
 * probability in range [0, 1]
 */
export function rollSuccess(probability: number): Boolean {
    return probability > Math.random();
}
