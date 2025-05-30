// js/storage.js

const storage = {
    APP_DATA_STORAGE_ID: 'criticalChoices_appData',

    /**
     * Gets the entire application data object from localStorage.
     * @returns {Object} The application data object, or a default structure if not found.
     */
    getAppData: function() {
        try {
            const appDataJSON = localStorage.getItem(this.APP_DATA_STORAGE_ID);
            if (appDataJSON) {
                return JSON.parse(appDataJSON);
            }
        } catch (e) {
            console.error("Error parsing app data from localStorage:", e);
        }
        // Return a default structure if no data is found or parsing fails
        return {
            apiKey: '',
            preferences: {
                font: 'normal', // Default font
            },
            playerData: {
                stats: {
                    operationsCompleted: 0,
                    successRate: 0,
                },
                // currentScenario: null, // Example for saving mid-scenario progress
                // achievements: []
            },
            notes: "" // For the notes tab
        };
    },

    /**
     * Saves the entire application data object to localStorage.
     * @param {Object} appData - The complete application data object.
     */
    saveAppData: function(appData) {
        try {
            if (typeof appData !== 'object' || appData === null) {
                console.error("Invalid appData provided to saveAppData. Must be an object.");
                return;
            }
            localStorage.setItem(this.APP_DATA_STORAGE_ID, JSON.stringify(appData));
            // console.log("App data saved:", appData); // For debugging
        } catch (e) {
            console.error("Error saving app data to localStorage:", e);
        }
    },

    /**
     * Exports the current application data as a JSON file.
     */
    exportAppData: function() {
        const appData = this.getAppData();
        const jsonString = JSON.stringify(appData, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `critical_choices_save_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log("Application data exported.");
    },

    /**
     * Imports application data from a user-selected JSON file.
     * @param {File} file - The file object selected by the user.
     * @returns {Promise<Object>} A promise that resolves with the imported appData object, or rejects on error.
     */
    importAppData: async function(file) {
        return new Promise((resolve, reject) => {
            if (!file || file.type !== "application/json") {
                reject(new Error("Invalid file type. Please select a JSON file."));
                return;
            }
            const reader = new FileReader();
            reader.onload = (event) => { // Use arrow function to preserve 'this' context if needed, though not critical here
                try {
                    const importedData = JSON.parse(event.target.result);
                    if (typeof importedData.apiKey === 'string' &&
                        typeof importedData.preferences === 'object' &&
                        typeof importedData.playerData === 'object') {
                        this.saveAppData(importedData); // Use 'this' to call own method
                        resolve(importedData);
                    } else {
                        reject(new Error("Invalid save file format. Missing essential keys."));
                    }
                } catch (e) {
                    console.error("Error parsing imported file:", e);
                    reject(new Error("Invalid save file format. Could not parse JSON."));
                }
            };
            reader.onerror = () => { // Use arrow function
                reject(new Error("Error reading file."));
            };
            reader.readAsText(file);
        });
    }
};