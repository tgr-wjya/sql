import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { GameState } from "./types";

const PROGRESS_DB_PATH = resolve(process.cwd(), "data", "progress.db");

const DEFAULT_STATE: GameState = {
	xp: 0,
	rank: "GHOST",
	operationIndex: 0,
	objectiveIndex: 0,
	solvedKeys: [],
	hintsUsed: {},
};

function safeParseJson<T>(value: string, fallback: T): T {
	try {
		const parsed = JSON.parse(value) as T;
		return parsed;
	} catch {
		return fallback;
	}
}

export function rankFromXp(xp: number): string {
	if (xp >= 1800) return "CIPHER";
	if (xp >= 1200) return "OPERATIVE";
	if (xp >= 700) return "INVESTIGATOR";
	if (xp >= 300) return "ANALYST";
	return "GHOST";
}

export class ProgressStore {
	private readonly db: Database;

	constructor() {
		mkdirSync(dirname(PROGRESS_DB_PATH), { recursive: true });
		this.db = new Database(PROGRESS_DB_PATH);
		this.db.exec(`
      CREATE TABLE IF NOT EXISTS state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        xp INTEGER NOT NULL,
        rank TEXT NOT NULL,
        operation_index INTEGER NOT NULL,
        objective_index INTEGER NOT NULL,
        solved_json TEXT NOT NULL,
        hints_json TEXT NOT NULL
      );
    `);
		this.ensureState();
	}

	private ensureState(): void {
		const existing = this.db.query("SELECT id FROM state WHERE id = 1;").get();
		if (!existing) {
			this.save(DEFAULT_STATE);
		}
	}

	load(): GameState {
		const row = this.db
			.query(
				`
          SELECT
            xp,
            rank,
            operation_index,
            objective_index,
            solved_json,
            hints_json
          FROM state
          WHERE id = 1;
        `,
			)
			.get() as
			| {
					xp: number;
					rank: string;
					operation_index: number;
					objective_index: number;
					solved_json: string;
					hints_json: string;
			  }
			| undefined;

		if (!row) {
			this.save(DEFAULT_STATE);
			return { ...DEFAULT_STATE };
		}

		const solvedKeys = safeParseJson<string[]>(row.solved_json, []);
		const hintsUsed = safeParseJson<Record<string, number>>(row.hints_json, {});

		return {
			xp: row.xp,
			rank: rankFromXp(row.xp),
			operationIndex: row.operation_index,
			objectiveIndex: row.objective_index,
			solvedKeys,
			hintsUsed,
		};
	}

	save(state: GameState): void {
		const next: GameState = {
			...state,
			rank: rankFromXp(state.xp),
		};

		this.db
			.query(
				`
          INSERT INTO state (
            id,
            xp,
            rank,
            operation_index,
            objective_index,
            solved_json,
            hints_json
          )
          VALUES (
            1,
            $xp,
            $rank,
            $operationIndex,
            $objectiveIndex,
            $solvedJson,
            $hintsJson
          )
          ON CONFLICT(id) DO UPDATE SET
            xp = excluded.xp,
            rank = excluded.rank,
            operation_index = excluded.operation_index,
            objective_index = excluded.objective_index,
            solved_json = excluded.solved_json,
            hints_json = excluded.hints_json;
        `,
			)
			.run({
				$xp: next.xp,
				$rank: next.rank,
				$operationIndex: next.operationIndex,
				$objectiveIndex: next.objectiveIndex,
				$solvedJson: JSON.stringify(next.solvedKeys),
				$hintsJson: JSON.stringify(next.hintsUsed),
			});
	}

	reset(): GameState {
		this.save(DEFAULT_STATE);
		return { ...DEFAULT_STATE };
	}
}
