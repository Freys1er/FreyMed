// js/gemini.js
const CONCISE_GEMINI_SYSTEM_INSTRUCTIONS = `
---SYSTEM_INSTRUCTIONS_FOR_AI---
Your primary output is narrative text.
To change specific game variables (vitals, monitor visibility), YOU MUST include a block AFTER your narrative:
---GAME_STATE_UPDATES---
VARIABLE_NAME: value
(e.g., MONITOR_PULSEOXIMETER_VISIBLE: true, VITALS_HEARTRATE_TARGET: 90, VITALS_HEARTRATE_DURATION: 10)
---END_GAME_STATE_UPDATES---
If no game variables are changing this turn, DO NOT include the block.
Available variables: MONITOR_PULSEOXIMETER_VISIBLE, VITALS_HEARTRATE_TARGET, VITALS_HEARTRATE_DURATION, VITALS_SPO2_TARGET, VITALS_SPO2_DURATION, VITALS_NBP_SYSTOLIC_TARGET, VITALS_NBP_DIASTOLIC_TARGET, VITALS_NBP_DURATION, VITALS_TEMP_TARGET, VITALS_TEMP_DURATION.
---END_SYSTEM_INSTRUCTIONS---
`;

const gemini = {
    MODEL_NAME: "gemini-1.5-flash-latest", // Or "models/gemini-1.5-flash-latest" - ensure this matches REST API docs
    API_BASE_URL: "https://generativelanguage.googleapis.com/v1beta/models",
    _apiKey: null,

    initialize: function (apiKey) {
        if (apiKey && typeof apiKey === 'string') {
            this._apiKey = apiKey;
            console.log("GEMINI: API Key set (first 5):", apiKey.substring(0, 5));
        } else {
            this._apiKey = null;
            console.warn("GEMINI: Initialize called with invalid API Key.");
        }
    },

    isReady: function () {
        return !!this._apiKey;
    },

    /**
     * Sends a message using direct fetch.
     * Adapts the 'contents' structure based on whether chatHistory is provided.
     * @param {string} promptText - The prompt from the user.
     * @param {Array<Object>} [chatHistory=[]] - The current chat history for this scenario.
     *                                     Format: [{ role: "user"|"model", parts: [{text: "..."}] }]
     * @returns {Promise<Object|null>} - Resolves with { text: "response text" } or null on error.
     */
    ask: async function (promptText, chatHistory = []) {
        if (!this.isReady()) { /* ... error handling ... */
            return { narrative: "Error: Gemini API Key not configured.", stateUpdates: {}, rawResponse: "" };
        }
        if (!promptText) { /* ... error handling ... */
            return { narrative: "Error: No prompt provided.", stateUpdates: {}, rawResponse: "" };
        }

        const endpoint = `${this.API_BASE_URL}/${this.MODEL_NAME}:generateContent?key=${this._apiKey}`;
        let apiContents = (chatHistory && chatHistory.length > 0) ?
            [...chatHistory, { role: "user", parts: [{ text: promptText }] }] :
            [{ parts: [{ text: promptText }] }];

        const requestBody = {
            contents: apiContents,
            safetySettings: [ /* ... as before ... */],
            generationConfig: { maxOutputTokens: 2048 /*, temperature: 0.5 */ }
        };

        try {
            // ... (fetch call, get responseData, log raw response as before) ...
            console.log(`GEMINI: Sending request to ${endpoint}.`);
            // console.log("GEMINI: Full request body:", JSON.stringify(requestBody, null, 2)); // For deep debug

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const responseData = await response.json();
            console.log("GEMINI: --- RAW API Response Data ---");
            console.log(JSON.stringify(responseData, null, 2));
            console.log("GEMINI: --- END RAW API Response Data ---");


            if (!response.ok) { /* ... throw error as before ... */ }

            const rawTextFromAI = responseData.candidates?.[0]?.content?.parts?.[0]?.text || null;
            if (rawTextFromAI === null) { /* ... throw error for no text ... */ }

            let narrative = rawTextFromAI;
            const stateUpdates = {};

            // Look for the delimited block
            const updatesBlockRegex = /---GAME_STATE_UPDATES---([\s\S]+?)---END_GAME_STATE_UPDATES---/i;
            const blockMatch = rawTextFromAI.match(updatesBlockRegex);

            if (blockMatch && blockMatch[1]) {
                const updatesContent = blockMatch[1].trim();
                // Remove the block from the narrative
                narrative = rawTextFromAI.replace(blockMatch[0], "").trim();
                if (!narrative) narrative = "AI updated game state."; // Fallback narrative

                console.log("GEMINI: Found GAME_STATE_UPDATES block:\n", updatesContent);

                updatesContent.split('\n').forEach(line => {
                    line = line.trim();
                    if (line) {
                        const parts = line.split(':');
                        if (parts.length >= 2) {
                            const key = parts[0].trim().toUpperCase(); // Standardize key
                            const valueString = parts.slice(1).join(':').trim(); // Handle values with colons
                            let value;
                            // Attempt to parse value intelligently
                            if (valueString.toLowerCase() === 'true') {
                                value = true;
                            } else if (valueString.toLowerCase() === 'false') {
                                value = false;
                            } else if (!isNaN(parseFloat(valueString)) && isFinite(valueString)) {
                                value = parseFloat(valueString);
                            } else {
                                value = valueString; // Keep as string
                            }
                            stateUpdates[key] = value;
                        }
                    }
                });
                console.log("GEMINI: Parsed stateUpdates:", stateUpdates);
            }

            return { narrative: narrative, stateUpdates: stateUpdates, rawResponse: rawTextFromAI };

        } catch (error) {
            // ... (error handling as before, return { narrative: "Error...", stateUpdates: {}, rawResponse: ... }) ...
            console.error(`GEMINI: Error in ask function:`, error);
            let errorMessage = "An error occurred with the AI. Please try again.";
            if (error && error.message) {
                errorMessage = error.message.toLowerCase().startsWith("error:") ? error.message : `Error: ${error.message}`;
                // ... (specific error checks from before) ...
            }
            return { narrative: errorMessage, stateUpdates: {}, rawResponse: (error ? String(error) : "") };
        }
    }
};


