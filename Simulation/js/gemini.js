// js/gemini.js
const CONCISE_GEMINI_SYSTEM_INSTRUCTIONS = `
---SYSTEM_INSTRUCTIONS---
Your role is to narrate the environment around the doctor, focusing exclusively on visual and auditory changes that the doctor can perceive.

DO NOT offer hints, suggestions, or perform any actions on behalf of the doctor.
The only exception to performing actions is when you are explicitly acting as another member of the operation (e.g., a nurse speaking).
DO NOT include vital signs directly in the narrative.
ALWAYS use the provided variables for game state updates when necessary.
To enact changes in game variables (vitals, monitor visibility), you MUST include a ---GAME_STATE_UPDATES--- block after your narrative. If no variables are changing in a given turn, DO NOT include this block.

Example of ---GAME_STATE_UPDATES--- block:

---GAME_STATE_UPDATES---
MONITOR_PULSEOXIMETER_VISIBLE: true
VITALS_HEARTRATE_TARGET: 90
VITALS_HEARTRATE_DURATION: 10
---END_GAME_STATE_UPDATES---
Available variables for GAME_STATE_UPDATES:

General Monitor Screen Visibility:

MONITOR_SCREEN_VISIBLE: true_or_false
ECG & Heart Rate:

MONITOR_ECG_VISIBLE: true_or_false
VITALS_HEARTRATE_TARGET: number
VITALS_HEARTRATE_DURATION: number
VITALS_ECG_RHYTHM: "string" (e.g., "Sinus Rhythm", "VT", "Asystole", "AFib")
Pulse Oximeter (SpO2 & Pleth Wave):

MONITOR_PULSEOXIMETER_VISIBLE: true_or_false
VITALS_SPO2_TARGET: number
VITALS_SPO2_DURATION: number
Arterial Blood Pressure (ABP - continuous invasive line):

MONITOR_ABP_VISIBLE: true_or_false
VITALS_ABP_SYSTOLIC_TARGET: number
VITALS_ABP_DIASTOLIC_TARGET: number
VITALS_ABP_DURATION: number
Non-Invasive Blood Pressure (NBP - cuff measurements):

MONITOR_NBP_VISIBLE: true_or_false
REQUEST_NBP_CYCLE: true
VITALS_NBP_SYSTOLIC_TARGET: number
VITALS_NBP_DIASTOLIC_TARGET: number
VITALS_NBP_DURATION: 0
EtCO2 (Capnography) & Respiratory Rate:

MONITOR_ETCO2_VISIBLE: true_or_false
VITALS_ETCO2_TARGET: number
VITALS_ETCO2_DURATION: number
VITALS_ETCO2_UNIT: "mmHg"_or_"kPa"
VITALS_RESPIRATORYRATE_TARGET: number
VITALS_RESPIRATORYRATE_DURATION: number
Temperature:

MONITOR_TEMP_VISIBLE: true_or_false
VITALS_TEMP_TARGET: number
VITALS_TEMP_DURATION: number
General Monitor Controls:

MONITOR_ALARMS_MUTED: true_or_false
MONITOR_DISPLAY_PAUSED: true_or_false ---END_SYSTEM_INSTRUCTIONS---
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


