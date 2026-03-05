import * as signalR from "@microsoft/signalr";
import type { Beatmap, MetadataWriteInput, Background } from "../types/osu";

const connection = new signalR.HubConnectionBuilder()
    .withUrl("http://localhost:5000/hub")
    .withAutomaticReconnect()
    .build();

export async function startConnection() {
    const retry = async (attempt: number = 0) => {
        try {
            await connection.start();
            console.log("SignalR connected");
        } catch (e) {
            if (attempt < 10) {
                setTimeout(() => retry(attempt + 1), 2000);
            } else {
                console.error("SignalR connection failed:", e);
            }
        }
    };

    await retry();
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

export default connection;
