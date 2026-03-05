import * as signalR from "@microsoft/signalr";

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

export function onUpdateBeatmap(callback: (json: string) => void) {
    connection.on("UpdateBeatmap", callback);
}

export function onParseError(callback: (message: string) => void) {
    connection.on("ParseError", callback);
}

export async function requestParse(filePath: string) {
    await connection.invoke("RequestParse", filePath);
}

export default connection;