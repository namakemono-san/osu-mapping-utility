import { invoke } from "@tauri-apps/api/core";
import type { OsuBeatmap, OsuBeatmapset, MetadataWriteInput, BackgroundWriteInput } from "./types";

export interface RenameOp {
    from: string;
    to: string;
}

export const osuApi = {
    listOsuFiles: (beatmapFolder: string) =>
        invoke<string[]>("list_osu_files", { beatmapFolder }),

    parseOsuFile: (filePath: string) =>
        invoke<OsuBeatmap>("parse_osu_file", { filePath }),

    parseOsuFilesBatch: (folderPath: string, fileNames: string[]) =>
        invoke<OsuBeatmapset>("parse_osu_files_batch", { folderPath, fileNames }),

    readOsuFile: (filePath: string) =>
        invoke<string>("read_osu_file", { filePath }),

    writeOsuFile: (filePath: string, content: string) =>
        invoke<void>("write_osu_file", { filePath, content }),

    renameOsuFiles: (beatmapFolder: string, renames: RenameOp[]) =>
        invoke<void>("rename_osu_files", { beatmapFolder, renames }),

    writeOsuMetadata: (
        filePath: string,
        metadata: MetadataWriteInput,
        background?: BackgroundWriteInput | null,
    ) => invoke<void>("write_osu_metadata", { filePath, metadata, background }),
};
