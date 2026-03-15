import * as signalR from "@microsoft/signalr";
import type { Beatmap, MetadataWriteInput, Background } from "../types/osu";

const connection = new signalR.HubConnectionBuilder()
    .withUrl("http://localhost:7001/beatmap")
    .withAutomaticReconnect()
    .build();

export async function startConnection(): Promise<boolean> {
    for (let attempt = 0; attempt < 10; attempt++) {
        try {
            await connection.start();
            return true;
        } catch {
            if (attempt < 9) {
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    }
    return false;
}

export async function requestParse(filePath: string): Promise<Beatmap> {
    return new Promise((resolve, reject) => {
        const onResult = (json: string) => {
            connection.off("UpdateBeatmap", onResult);
            connection.off("ParseError", onError);
            resolve(JSON.parse(json) as Beatmap);
        };
        const onError = (message: string) => {
            connection.off("UpdateBeatmap", onResult);
            connection.off("ParseError", onError);
            reject(new Error(message));
        };
        connection.on("UpdateBeatmap", onResult);
        connection.on("ParseError", onError);
        connection.invoke("RequestParse", filePath).catch(reject);
    });
}

export async function requestParseBatch(folderPath: string, fileNames: string[]): Promise<Beatmap[]> {
    return new Promise((resolve, reject) => {
        const onResult = (json: string) => {
            connection.off("UpdateBeatmapset", onResult);
            connection.off("ParseError", onError);
            resolve(JSON.parse(json) as Beatmap[]);
        };
        const onError = (message: string) => {
            connection.off("UpdateBeatmapset", onResult);
            connection.off("ParseError", onError);
            reject(new Error(message));
        };
        connection.on("UpdateBeatmapset", onResult);
        connection.on("ParseError", onError);
        connection.invoke("RequestParseBatch", folderPath, fileNames).catch(reject);
    });
}

export async function requestApplyMetadata(
    filePath: string,
    metadata: MetadataWriteInput,
    background: Background | null,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const onResult = (_filePath: string) => {
            connection.off("ApplyMetadataComplete", onResult);
            connection.off("ParseError", onError);
            resolve();
        };
        const onError = (message: string) => {
            connection.off("ApplyMetadataComplete", onResult);
            connection.off("ParseError", onError);
            reject(new Error(message));
        };
        connection.on("ApplyMetadataComplete", onResult);
        connection.on("ParseError", onError);
        connection.invoke("RequestApplyMetadata", filePath, metadata, background).catch(reject);
    });
}

export async function requestFixUnsnaps(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const onResult = (fixedCount: number) => {
            connection.off("FixUnsnapsComplete", onResult);
            connection.off("ParseError", onError);
            resolve(fixedCount);
        };
        const onError = (message: string) => {
            connection.off("FixUnsnapsComplete", onResult);
            connection.off("ParseError", onError);
            reject(new Error(message));
        };
        connection.on("FixUnsnapsComplete", onResult);
        connection.on("ParseError", onError);
        connection.invoke("RequestFixUnsnaps", filePath).catch(reject);
    });
}

export function onUpdateBeatmap(callback: (beatmap: Beatmap) => void) {
    connection.on("UpdateBeatmap", (json: string) => {
        callback(JSON.parse(json) as Beatmap);
    });
}

export function onUpdateBeatmapset(callback: (beatmaps: Beatmap[]) => void) {
    connection.on("UpdateBeatmapset", (json: string) => {
        callback(JSON.parse(json) as Beatmap[]);
    });
}

export function onParseError(callback: (message: string) => void) {
    connection.on("ParseError", callback);
}

export default connection;
