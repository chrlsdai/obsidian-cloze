const ANKI_PORT: number = 8765

const ANKI_CONNECT_URL = "http://127.0.0.1:" + ANKI_PORT;

export async function ankiRequest<T>(action: string, params: object): Promise<T> {
    const response = await fetch(ANKI_CONNECT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            action,
            version: 6,
            params
        }),
    });

    const { result, error } = await response.json();
    if (error) throw new Error(`AnkiConnect error: ${error}`);
    return result as T;
}

export async function getDeckNames(): Promise<string[]> {
    return ankiRequest<string[]>("deckNames", {});
}

export async function getModelNames(): Promise<string[]> {
    return ankiRequest<string[]>("modelNames", {});
}