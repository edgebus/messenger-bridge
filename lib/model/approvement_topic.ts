import { ApprovementTopicName } from "./primitives.js";

export interface ApprovementTopic {
	readonly name: ApprovementTopicName;

	readonly description: string;

	readonly requireVotes: number;

	/**
	 * Number of seconds
	 */
	readonly expireTimeout: number;

	readonly authType: string | null;

	readonly schema: string | null;
}

export type ApprovementTopicMap = ReadonlyMap<ApprovementTopicName, ApprovementTopic>;
