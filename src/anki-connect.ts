const ANKI_PORT: number = 8765

interface AnkiConnectRequest {
    action: string,
    version: 6,
    params: any
}

export async function invoke(action: string, params = {}) {
    const ankiRequest: AnkiConnectRequest = {
        action,
        version: 6,
        params
    };

    const request = await fetch('http://127.0.0.1:' + ANKI_PORT, {
        method: 'POST',
        body: JSON.stringify(ankiRequest)
    });

    const response = await request.json();

    if (Object.getOwnPropertyNames(response).length != 2) {
        throw new Error('response has an unexpected number of fields');
    }
    if (!response.hasOwnProperty('error')) {
        throw new Error('response is missing required error field');
    }
    if (!response.hasOwnProperty('result')) {
        throw new Error('response is missing required result field');
    }
    if (response.error) {
        throw new Error(response.error);
    }
    return response.result;
}
