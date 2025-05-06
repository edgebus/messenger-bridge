import { type FLoggerLabels } from "@freemework/common";

declare module "@freemework/common" {
	interface FLoggerLabels {
		readonly ololo: number;
		// readonly [labelName: "ololo" | "Dassa"]: string;
	}
}


const a: FLoggerLabels = {
	ololo: 42,
	bbbB: "Dsdas",
}
