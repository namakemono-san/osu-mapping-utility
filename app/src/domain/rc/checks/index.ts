import type { CheckDefinition } from "../types";
import { generalChecks } from "./generalChecks";
import { metadataChecks } from "./metadataChecks";
import { spreadChecks } from "./spreadChecks";
import { difficultySettingsChecks } from "./difficultySettingsChecks";

export const allChecks: CheckDefinition[] = [
    ...generalChecks,
    ...metadataChecks,
    ...spreadChecks,
    ...difficultySettingsChecks,
];
