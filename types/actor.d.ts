export type DarkHeresyNPCPersonality =
    | "balanced"
    | "berserker"
    | "marksman"
    | "skirmisher"
    | "hunter"
    | "bulwark"
    | "commander"
    | "zealot"
    | "psyker"
    | "survivor";

declare global {
    interface DarkHeresyNPCSystemData {
        personality: DarkHeresyNPCPersonality;
    }

    interface DarkHeresyActorSystemData {
        personality?: DarkHeresyNPCPersonality;
    }
}

export {};
