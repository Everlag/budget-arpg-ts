export interface CharacterStateSerial{
    /** Unique identifier */
    EntityCode: string;
    /** Absolute location */
    Position: number;
    /** Current values of health and mana */
    health: number;
    mana: number;
    /** Maximum values for health and mana */
    maxHealth: number;
    maxMana: number;
    /** State */
    isDead: boolean;
}