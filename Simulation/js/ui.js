// js/ui.js

const ui = {
    FONT_CLASSES: ['font-normal', 'font-monospace', 'font-handwriting'],
    _globalTabBar: null,
    _mainContentArea: null,
    _footerTimerDisplay: null, // Added from timer logic

    getGlobalTabBar: function () {
        if (!this._globalTabBar) {
            this._globalTabBar = document.getElementById('global-tab-bar');
            console.log("UI: getGlobalTabBar - Fetched #global-tab-bar element:", this._globalTabBar); // Log when fetched
        }
        if (!this._globalTabBar) {
            console.error("UI: CRITICAL - #global-tab-bar element is NULL even after getElementById!");
        }
        return this._globalTabBar;
    },
    getMainContentArea: function () {
        if (!this._mainContentArea) this._mainContentArea = document.getElementById('main-content-area');
        return this._mainContentArea;
    },
    getFooterTimerDisplay: function () { // Added from timer logic
        if (!this._footerTimerDisplay) this._footerTimerDisplay = document.getElementById('global-scenario-timer-display');
        return this._footerTimerDisplay;
    },

    fetchHtmlTemplate: async function (templateUrl) {
        console.log(`UI: Fetching template: ${templateUrl}`);
        try {
            const response = await fetch(templateUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch template ${templateUrl}. Status: ${response.status} ${response.statusText}`);
            }
            const htmlString = await response.text();
            console.log(`UI: Template '${templateUrl}' fetched successfully.`);
            return htmlString;
        } catch (error) {
            console.error(`UI Error: Could not fetch HTML template '${templateUrl}':`, error);
            return `<p class="error-message">Error loading UI component: ${error.message}</p>`;
        }
    },

    injectHtmlWithPlaceholders: function (targetElement, htmlString, placeholders = {}) {
        let processedHtml = htmlString;
        for (const key in placeholders) {
            const placeholderPattern = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'); // Escape special regex chars
            const regex = new RegExp(placeholderPattern, 'g');
            processedHtml = processedHtml.replace(regex, placeholders[key]);
        }
        targetElement.innerHTML = processedHtml;
        console.log("UI: HTML injected with placeholders. Target:", targetElement, "Placeholders used:", placeholders);
    },

    applyFontPreference: function (fontPreference) {
        console.log("UI_LOG: Applying font preference:", fontPreference);
        document.body.classList.remove(...this.FONT_CLASSES);
        const fontClass = `font-${fontPreference || 'normal'}`;
        if (this.FONT_CLASSES.includes(fontClass)) {
            document.body.classList.add(fontClass);
        } else {
            document.body.classList.add('font-normal');
        }
    },

    renderGlobalTabs: function (tabConfigs, activeTabId, onTabClick, onTabClose) {
        const tabBar = this.getGlobalTabBar();
        if (!tabBar) {
            console.error("UI Error: Global tab bar element not found in renderGlobalTabs.");
            return;
        }
        tabBar.innerHTML = ''; // Clear existing tabs

        tabConfigs.forEach(tabConfig => {
            const tabButton = document.createElement('button');
            tabButton.className = 'tab-button';
            tabButton.dataset.tabId = tabConfig.id;
            tabButton.textContent = tabConfig.label;

            if (tabConfig.id === activeTabId) {
                tabButton.classList.add('active');
            }

            // Main tab button click listener
            tabButton.addEventListener('click', () => {
                console.log(`UI: Main tab button clicked for ${tabConfig.id}`);
                onTabClick(tabConfig.id); // This calls handleTabClick in main.js
            });

            // Add close button IF the tab is closeable AND onTabClose callback is provided
            if (tabConfig.isCloseable && typeof onTabClose === 'function') {
                const closeButton = document.createElement('span');
                closeButton.className = 'tab-close-button';
                closeButton.innerHTML = '×'; // 'x' character
                closeButton.title = `Close ${tabConfig.label}`;

                // CRITICAL: Close button click listener
                closeButton.addEventListener('click', (event) => {
                    event.stopPropagation(); // PREVENT event from bubbling up to tabButton
                    console.log(`UI: Close button clicked for ${tabConfig.id}`);
                    onTabClose(tabConfig.id); // This calls handleTabClose in main.js
                });
                tabButton.appendChild(closeButton);
            }
            tabBar.appendChild(tabButton);


            tabButton.setAttribute('draggable', 'true');

            // js/ui.js (inside renderGlobalTabs, for each tabButton's dragstart listener)

            tabButton.addEventListener('dragstart', (event) => {
                const tabId = tabConfig.id;
                const tabLabel = tabConfig.label; // Available from closure
                console.log(`UI: Drag started for tab ${tabId} - ${tabLabel}`);

                // --- Dynamically construct the full URL for the tab ---
                const baseUrl = `${window.location.origin}${window.location.pathname}`;
                // window.location.origin gives "http://127.0.0.1:5500" or "https://yourdomain.com"
                // window.location.pathname gives "/" or "/subfolder/" if your app is in a subfolder

                const tabUrl = `${baseUrl}#${tabId}`;
                // This ensures it works whether served from localhost, a subfolder, or a domain.
                // Example:
                // If current URL is http://127.0.0.1:5500/index.html#home
                // origin = "http://127.0.0.1:5500"
                // pathname = "/index.html" (or just "/" if it's the root)
                // tabUrl becomes "http://127.0.0.1:5500/index.html#yourTabId" or "http://127.0.0.1:5500/#yourTabId"

                console.log(`UI: Constructed tab URL for drag: ${tabUrl}`);

                // 1. Set text/plain to the full, navigable URL. This is key for browser behavior.
                event.dataTransfer.setData('text/plain', tabUrl);

                // 2. Set URL-specific data types as a good practice (browsers *might* use them).
                event.dataTransfer.setData('URL', tabUrl); // Some desktop environments might use this
                event.dataTransfer.setData('text/uri-list', tabUrl); // Standard for lists of URIs

                // 3. Set our custom data for internal logic (when dragend fires *within our app*).
                event.dataTransfer.setData('application/x-medsim-tab', JSON.stringify(tabConfig));

                event.dataTransfer.effectAllowed = 'link'; // 'link' is appropriate as we are providing a URL
                // 'copyLink' is also good. Avoid 'move' unless you intend to remove the original tab on successful external drop.

                tabButton.classList.add('dragging');

                // Optional drag image setup (from before, if you use it)
                // if (event.dataTransfer.setDragImage) { ... }
            });

            // The 'dragend' listener remains largely the same.
            // Its logic for calling window.appShell.handleTabDragOut will still use window.open(tabUrl, '_blank')
            // where tabUrl is reconstructed similarly or retrieved from the dataTransfer if needed (though usually reconstructed).
            tabButton.addEventListener('dragend', (event) => {
                const tabId = tabConfig.id;
                console.log(`UI: Drag ended for tab ${tabId}. Drop effect: ${event.dataTransfer.dropEffect}, ClientX: ${event.clientX}, ClientY: ${event.clientY}`);
                tabButton.classList.remove('dragging');

                const mainAppArea = document.getElementById('game-interface');
                const tabBar = this.getGlobalTabBar(); // Assuming this.getGlobalTabBar() is available

                let droppedOutsideAppRect = true;
                if (mainAppArea) {
                    const rect = mainAppArea.getBoundingClientRect();
                    if (event.clientX >= rect.left && event.clientX <= rect.right &&
                        event.clientY >= rect.top && event.clientY <= rect.bottom) {
                        droppedOutsideAppRect = false;
                    }
                }

                // Determine if it was really "out" and if our app should open the window
                // This heuristic is tricky. If dropEffect is 'none' it means the browser didn't handle it.
                // If it's 'link' or 'copy', the browser *might* have handled it (e.g., user dropped on URL bar).
                // We primarily want to act if dropEffect is 'none' AND it seems out of our UI.
                const isConsideredOutOfWindow =
                    (event.dataTransfer.dropEffect === 'none' && // Browser did nothing
                        droppedOutsideAppRect && // Mouse was outside main game area
                        (!tabBar || event.clientY > (tabBar.offsetTop + tabBar.offsetHeight + 10))); // And below tab bar

                if (isConsideredOutOfWindow) {
                    console.log(`UI: Tab ${tabId} determined as dragged out (dropEffect 'none' and out of bounds). Opening new window.`);
                    if (window.appShell && typeof window.appShell.handleTabDragOut === 'function') {
                        try {
                            const tabDataString = event.dataTransfer.getData('application/x-medsim-tab');
                            if (tabDataString) {
                                const tabData = JSON.parse(tabDataString);
                                window.appShell.handleTabDragOut(tabData); // main.js reconstructs URL for window.open
                            } else {
                                // Fallback to tabConfig from closure (less ideal as it might be stale if config changed)
                                console.warn("UI: Could not retrieve 'application/x-medsim-tab' data, using closure's tabConfig.");
                                window.appShell.handleTabDragOut(tabConfig);
                            }
                        } catch (e) {
                            console.error("UI: Error parsing/handling custom tab data on dragend:", e);
                            window.appShell.handleTabDragOut(tabConfig); // Fallback
                        }
                    }
                } else {
                    console.log(`UI: Tab ${tabId} drag ended. DropEffect: '${event.dataTransfer.dropEffect}'. Not triggering new window from app.`);
                }
            });
        });
    },
    renderTabPanelContent: function (tabId, contentData) {
        // This function is now simpler. It expects contentData to be either:
        // 1. An HTMLElement (already constructed by a component's JS)
        // 2. A string of HTML (less common now, but possible for very simple tabs)
        // 3. An object like { templateUrl: 'path/to/template.html', placeholders: {...}, onLoaded: (panelElement) => {} }
        const contentArea = this.getMainContentArea();
        if (!contentArea) { /* ... error ... */ return; }
        contentArea.querySelectorAll('.tab-panel.active').forEach(p => p.classList.remove('active'));
        let panel = contentArea.querySelector(`.tab-panel[data-tab-id="${tabId}"]`);
        if (!panel) {
            panel = document.createElement('div');
            panel.className = 'tab-panel';
            panel.dataset.tabId = tabId;
            contentArea.appendChild(panel);
        }

        if (typeof contentData === 'string') {
            panel.innerHTML = contentData;
        } else if (contentData instanceof HTMLElement) {
            panel.innerHTML = ''; panel.appendChild(contentData);
        } else if (typeof contentData === 'object' && contentData.templateUrl) {
            // Handle template loading
            panel.innerHTML = `<div class="in-tab-loading"><div class="spinner"></div><p>Loading content...</p></div>`; // Initial loading state
            this.fetchHtmlTemplate(contentData.templateUrl)
                .then(htmlString => {
                    this.injectHtmlWithPlaceholders(panel, htmlString, contentData.placeholders || {});
                    if (typeof contentData.onLoaded === 'function') {
                        contentData.onLoaded(panel); // Pass the panel so component JS can find its elements
                    }
                })
                .catch(err => {
                    panel.innerHTML = `<p class="error-message">Failed to load tab content: ${err.message}</p>`;
                });
        } else {
            panel.innerHTML = `<h2>Content for ${tabId}</h2><p>Error: Invalid or no content data provided.</p>`;
        }
        panel.classList.add('active');
    },

    removeTabPanel: function (tabId) {
        const contentArea = this.getMainContentArea();
        if (!contentArea) return;
        const panel = contentArea.querySelector(`.tab-panel[data-tab-id="${tabId}"]`);
        if (panel) panel.remove();
    },

    /**
     * Appends text or HTML to a specific scenario tab's output area.
     * Clears previous loading messages if isFinalContent is true.
     * @param {string} scenarioTabId - The ID of the scenario tab (e.g., 'scenario-er-123').
     * @param {string} htmlContent - The HTML content to append or set.
     * @param {boolean} isFinalContent - If true, clears loading indicators and sets this as the main content.
     */
    updateScenarioOutput: function (scenarioTabId, htmlContent, scrollToBottom = true) {
        const outputDivId = `scenario-output-${scenarioTabId}`;
        const outputDiv = document.getElementById(outputDivId);

        if (outputDiv) {
            console.log(`UI: Updating scenario output for ${outputDivId}`);
            outputDiv.innerHTML = htmlContent; // Replace content
            if (scrollToBottom) {
                outputDiv.scrollTop = outputDiv.scrollHeight;
            }
        } else {
            console.warn(`UI Warn: Scenario output div '${outputDivId}' not found for tab '${scenarioTabId}'.`);
        }
    },

    /**
     * Appends a player command or AI response to the active scenario's output.
     * @param {string} text - The text of the command or response.
     * @param {boolean} isPlayerCommand - True if it's a player command, false for AI response.
     */
    appendToScenarioLog: function (scenarioTabId, text, isPlayerCommand) {
        const outputDivId = `scenario-output-${scenarioTabId}`;
        const outputDiv = document.getElementById(outputDivId);

        if (outputDiv) {
            // Remove any existing "thinking" message before appending new content
            const thinkingMsg = outputDiv.querySelector('.thinking-message');
            if (thinkingMsg) thinkingMsg.remove();

            const p = document.createElement('p');
            p.innerHTML = text.replace(/\n/g, '<br>');
            p.classList.add(isPlayerCommand ? 'player-command-log' : (text.toLowerCase().includes('error:') || text.toLowerCase().includes('failed') ? 'system-message error' : 'ai-response-log')); // Basic error styling
            outputDiv.appendChild(p);
            outputDiv.scrollTop = outputDiv.scrollHeight;
        } else {
            console.warn(`UI Warn: Scenario output div '${outputDivId}' not found for logging in tab '${scenarioTabId}'.`);
        }
    },

    _footerTimerDisplay: null,

    getFooterTimerDisplay: function () {
        if (!this._footerTimerDisplay) {
            this._footerTimerDisplay = document.getElementById('global-scenario-timer-display');
        }
        return this._footerTimerDisplay;
    },

    /**
     * Updates the global timer display in the footer.
     * @param {number | null} totalSeconds - Total elapsed seconds for the active scenario, or null to hide/reset.
     * @param {boolean} [isPaused=false] - If the timer is paused.
     */
    // js/ui.js
    updateFooterTimerDisplay: function (totalSeconds, isPaused = false) {
        const timerElement = this.getFooterTimerDisplay();
        if (timerElement) {
            if (totalSeconds !== null && totalSeconds >= 0) {
                const timeString = this.formatTimeForDisplay(totalSeconds);
                timerElement.textContent = timeString + (isPaused ? " (P)" : "");
                timerElement.style.display = 'block'; // Ensure it's block if it was none
            } else {
                timerElement.textContent = "00:00";
                // timerElement.style.display = 'none'; // Keep it visible for now with default text for debugging
                timerElement.style.display = 'block'; // Keep visible
                timerElement.style.color = 'gray'; // Indicate inactive
            }
        } else {
            console.warn("UI WARN: Footer timer element not found in updateFooterTimerDisplay.");
        }
    },

    // updateScenarioTimerDisplay (for in-tab timer) remains the same
    updateScenarioTimerDisplay: function (scenarioTabId, totalSeconds, isPaused = false) {
        const timerDisplayId = `scenario-timer-${scenarioTabId}`;
        const timerElement = document.getElementById(timerDisplayId);
        if (timerElement) {
            const timeString = ui.formatTimeForDisplay(totalSeconds);
            timerElement.textContent = timeString + (isPaused ? " (Paused)" : "");
        }
    },

    formatTimeForDisplay: function (totalSeconds) {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        let timeString = "";
        if (hours > 0) timeString += `${String(hours).padStart(2, '0')}:`;
        timeString += `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        return timeString;
    }
};

window.ui = ui;
console.log("UI_LOG: 'ui' object assigned to window.ui. Checking window.ui.fetchHtmlTemplate:", typeof window.ui?.fetchHtmlTemplate);
console.log("UI_LOG: ui.js script parsing finished.");