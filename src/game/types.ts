import type { Database } from "bun:sqlite";

export type SqlRow = Record<string, unknown>;

export type ObjectivePhase =
	| "ARCHITECT"
	| "POPULATE"
	| "INVESTIGATE"
	| "MUTATE"
	| "HARDEN";

export interface ValidationOutcome {
	pass: boolean;
	detail?: string;
}

export interface Objective {
	id: string;
	phase?: ObjectivePhase;
	title: string;
	narrative: string;
	acceptance?: string[];
	starterSql?: string;
	setupSql: string;
	mode: "result" | "assert";
	solutionSql?: string;
	assertSql?: string;
	validate?: (db: Database, userSql: string) => ValidationOutcome;
	hints: string[];
	xp: number;
	orderSensitive?: boolean;
	requiredTokens?: string[];
}

export interface Operation {
	id: number;
	code: string;
	title: string;
	briefing: string;
	objectives: Objective[];
}

export interface GameState {
	xp: number;
	rank: string;
	operationIndex: number;
	objectiveIndex: number;
	solvedKeys: string[];
	hintsUsed: Record<string, number>;
}

export interface RunResponse {
	ok: boolean;
	passed: boolean;
	message: string;
	rows: SqlRow[];
	columns: string[];
	xpAwarded: number;
	snapshot: Snapshot;
}

export interface CampaignNode {
	id: number;
	code: string;
	title: string;
	status: "locked" | "current" | "completed" | "available";
}

export interface Snapshot {
	state: Pick<GameState, "xp" | "rank" | "operationIndex" | "objectiveIndex">;
	current: {
		operationId: number;
		operationCode: string;
		operationTitle: string;
		briefing: string;
		objectiveId: string;
		objectivePhase: ObjectivePhase;
		objectiveNumber: number;
		objectiveTotal: number;
		objectiveTitle: string;
		narrative: string;
		acceptance: string[];
		starterSql: string | null;
		hintsUsed: number;
		hintsRemaining: number;
		solved: boolean;
	} | null;
	campaign: CampaignNode[];
	completed: boolean;
}

export interface PlaygroundColumn {
	name: string;
	type: string;
	notNull: boolean;
	primaryKeyOrder: number;
}

export interface PlaygroundTableGraphNode {
	name: string;
	columns: PlaygroundColumn[];
}

export interface PlaygroundForeignKeyEdge {
	id: string;
	fromTable: string;
	fromColumn: string;
	toTable: string;
	toColumn: string;
}

export interface PlaygroundGraph {
	tables: PlaygroundTableGraphNode[];
	foreignKeys: PlaygroundForeignKeyEdge[];
	generatedAt: string;
}
