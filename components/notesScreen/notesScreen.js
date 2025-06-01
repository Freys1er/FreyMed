// components/notesScreen/notesScreen.js

const notesScreen = {
    /**
     * Fetches, populates, and returns the HTML content element for the Notes tab.
     * @param {string} currentNotes - The current notes string from appData.notes.
     * @param {Function} onNotesUpdate - Callback to main.js to save updated notes.
     *                                   Receives the new notes string.
     * @returns {Promise<HTMLElement>} - A promise that resolves with the fully prepared DOM element.
     */
    getContentElement: async function(currentNotes, onNotesUpdate) {
        console.log("NotesScreenJS: Fetching and preparing content.");

        try {
            if (!window.ui || typeof window.ui.fetchHtmlTemplate !== 'function') {
                console.error("NotesScreenJS: ui.fetchHtmlTemplate is not available!");
                const errorPanel = document.createElement('div');
                errorPanel.innerHTML = "<p>Error: UI module not loaded correctly for Notes screen.</p>";
                return errorPanel;
            }

            const htmlString = await window.ui.fetchHtmlTemplate('components/notesScreen/notesScreen.html');
            const panelContainer = document.createElement('div'); // Temporary container
            panelContainer.innerHTML = htmlString;
            const panelElement = panelContainer.firstElementChild; // Get the actual .notes-panel-content

            const textArea = panelElement.querySelector('#notes-textarea');

            if (textArea) {
                textArea.value = currentNotes || ""; // Populate with existing notes

                let debounceTimer;
                textArea.addEventListener('input', () => {
                    clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => {
                        if (typeof onNotesUpdate === 'function') {
                            onNotesUpdate(textArea.value);
                            console.log("NotesScreenJS: Notes updated and callback triggered.");
                        }
                    }, 750); // Debounce saving by 750ms
                });
            } else {
                console.error("NotesScreenJS: #notes-textarea not found in the template!");
            }

            return panelElement;
        } catch (error) {
            console.error("NotesScreenJS: Error fetching or processing notesScreen.html:", error);
            const errorPanel = document.createElement('div');
            errorPanel.innerHTML = `<p class="error-message">Error loading Notes screen: ${error.message}</p>`;
            return errorPanel;
        }
    }
};

// Make it globally available
window.notesScreen = notesScreen;