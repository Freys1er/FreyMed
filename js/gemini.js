// js/gemini.js

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

        console.log("GEMINI_ASK: Received promptText (first 100 chars):", promptText ? promptText.substring(0, 100) + "..." : "PROMPT IS NULL/EMPTY");
        console.log("GEMINI_ASK: Received chatHistory length:", chatHistory.length);
        
        if (!this.isReady()) {
            console.error("GEMINI: API Key not set.");
            return { text: "Error: Gemini API Key not configured. Please set it in 'Data & Settings'." };
        }
        if (!promptText) return { text: "Error: No prompt provided." };

        const endpoint = `${this.API_BASE_URL}/${this.MODEL_NAME}:generateContent?key=${this._apiKey}`;
        let apiContents;

        if (chatHistory && chatHistory.length > 0) {
            // This is a follow-up turn in a conversation
            apiContents = [...chatHistory];
            apiContents.push({ role: "user", parts: [{ text: promptText }] });
            console.log("GEMINI: Sending CHAT request.");
        } else {
            // This is an initial prompt (like scenario generation)
            // Based on your sample, it might expect no 'role' for a single, initial prompt.
            apiContents = [{ parts: [{ text: promptText }] }]; // NO 'role'
            console.log("GEMINI: Sending INITIAL/NON-CHAT request.");
        }

        const requestBody = {
            contents: apiContents,
            // Safety settings from your sample (adjust if needed)
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
            ],
            generationConfig: {
                // temperature: 0.4, // From your sample
                maxOutputTokens: 2048, // Increased for potentially long scenario + patient details
            }
        };

        try {
            console.log(`GEMINI: Sending request to ${endpoint}. Request body (structure check):`, JSON.stringify({ contents_structure_type: (chatHistory && chatHistory.length > 0) ? 'chat' : 'single_prompt', num_contents: apiContents.length }, null, 2));
            // console.log("GEMINI: Full request body:", JSON.stringify(requestBody, null, 2)); // Uncomment for full body debug

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const responseData = await response.json();

            if (!response.ok) {
                console.error("GEMINI API Error Response (status " + response.status + "):", responseData);
                let detail = "Unknown API error.";
                if (responseData.error && responseData.error.message) {
                    detail = responseData.error.message;
                }
                // The error message you got suggests the issue is with `contents` field.
                // Let's include part of the `contents` we sent if it's an array.
                if (Array.isArray(apiContents) && apiContents.length > 0) {
                    detail += ` (Sent contents[0] had keys: ${Object.keys(apiContents[0]).join(', ')})`;
                }
                throw new Error(`API returned status ${response.status}: ${detail}`);
            }

            const text = responseData.candidates?.[0]?.content?.parts?.[0]?.text || null;

            if (text === null) {
                console.warn("GEMINI: No text found in API response structure:", responseData);
                if (responseData.candidates?.[0]?.finishReason) {
                    throw new Error(`AI generation stopped. Reason: ${responseData.candidates[0].finishReason}. Prompt may have been blocked by safety filters or other issues.`);
                }
                throw new Error("AI response structure did not contain expected text, and no clear finish reason.");
            }

            console.log(`GEMINI: Received response (first 100 chars):`, text.substring(0, 100));
            return { text: text };

        } catch (error) {
            console.error(`GEMINI: Error in ask function:`, error);
            let errorMessage = "An error occurred with the AI. Please try again.";
            if (error && error.message) {
                // Check if the error message already contains "Error:" to avoid duplication
                errorMessage = error.message.toLowerCase().startsWith("error:") ? error.message : `Error: ${error.message}`;

                // More specific error checks from before
                if (errorMessage.includes("API key not valid") || errorMessage.includes("PERMISSION_DENIED") || (errorMessage.includes("API key") && errorMessage.includes("invalid"))) {
                    errorMessage = "Your API key is invalid, has been revoked, or lacks permissions for this model. Please check it in 'Data & Settings'.";
                } else if (errorMessage.includes("quota")) {
                    errorMessage = "You have exceeded your API quota. Please check your Google AI Studio account.";
                } else if (errorMessage.includes("model") && errorMessage.includes("not found")) {
                    errorMessage = `The AI model (${this.MODEL_NAME}) was not found or is not accessible with your key.`;
                }
            }
            return { text: errorMessage }; // Ensure "Error:" prefix for consistency
        }
    }
};