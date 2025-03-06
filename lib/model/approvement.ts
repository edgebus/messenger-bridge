import { ApprovementTopic } from "./approvement_topic.js";
import { Approver } from "./approver.js";
import { ApprovementId } from "./primitives.js";

export interface Approvement {
	readonly approvementId: ApprovementId;
	readonly approvementTopic: ApprovementTopic;
	readonly expireAt: Date;
	readonly approvedBy: ReadonlyArray<Approver>;
	readonly refuseBy: Approver | null;
}
