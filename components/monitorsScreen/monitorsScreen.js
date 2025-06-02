// components/monitorsScreen/monitorsScreen.js (Simplified)
const monitorsScreen = {
    activeScenarioId: null,
    activeScenarioName: "N/A",
    panelElement: null,
    // No more this.visibleMonitors here; patientMonitor manages its own content.

    // components/monitorsScreen/monitorsScreen.js
    getContentElement: async function (scenarioId, scenarioName, initialMonitorStatesFromAppData = {}) {
        console.log(`MonitorsScreenJS: getContentElement for scenario ${scenarioId} ('${scenarioName}')`);
        this.activeScenarioId = scenarioId;
        this.activeScenarioName = scenarioName;
        // initialMonitorStatesFromAppData is not directly used here anymore to toggle individual monitors;
        // patientMonitor.initInstance will use appData/defaults for its initial state.

        const panelContainer = document.createElement('div'); // This will be the direct child for ui.renderTabPanelContent
        // and patientMonitor.html will be injected into it.
        try {
            if (!window.ui?.fetchHtmlTemplate) throw new Error("ui.fetchHtmlTemplate missing.");
            const htmlString = await window.ui.fetchHtmlTemplate('patientMonitor/patientMonitor.html');
            if (htmlString.toLowerCase().includes("error")) throw new Error(htmlString);

            // Inject the patientMonitor's HTML into panelContainer, replacing SCENARIO_ID
            window.ui.injectHtmlWithPlaceholders(panelContainer, htmlString, { "{{SCENARIO_ID}}": scenarioId });
            // The actual root element of the monitor UI is the first child of panelContainer now
            const monitorWidgetRootElement = panelContainer.firstElementChild;

            if (!monitorWidgetRootElement) {
                throw new Error("Failed to get patient monitor widget root after HTML injection.");
            }
            this.panelElement = monitorWidgetRootElement; // Store reference if needed by monitorsScreen itself

            // Update general info in the patientMonitor template if needed
            const patientIdEl = monitorWidgetRootElement.querySelector(`#pm-patient-id-${scenarioId}`);
            if (patientIdEl) patientIdEl.textContent = `PATIENT: ${scenarioName.substring(0, 10)}... (${scenarioId.slice(-4)})`;

            // Initialize the patientMonitor JavaScript logic
            if (window.patientMonitor && typeof window.patientMonitor.initInstance === 'function') {
                const appData = window.appShell?.getAppData();
                const scenarioData = appData?.playerData.activeScenarios[this.activeScenarioId];
                const initialVitalsForMonitor = scenarioData?.patientData?.vitals || scenarioData?.vitals || {};

                console.log(`MonitorsScreenJS: Calling patientMonitor.initInstance for scenario: ${this.activeScenarioId}`);
                // Pass the actual root element of the monitor's UI to initInstance
                await window.patientMonitor.initInstance(
                    this.activeScenarioId,
                    monitorWidgetRootElement, // Pass the DOM element
                    initialVitalsForMonitor   // Pass initial vitals from appData
                );
            } else {
                console.error("MonitorsScreenJS: patientMonitor.initInstance not found!");
                if (this.panelElement) this.panelElement.innerHTML = "<p class='error-message'>Main Patient Monitor logic failed.</p>";
                else panelContainer.innerHTML = "<p class='error-message'>Main Patient Monitor logic failed (no panel).</p>";
            }
            // The entire content of panelContainer (which is patientMonitor.html's processed content)
            // will be returned and inserted by main.js into the tab panel.
            return panelContainer; // Or return this.panelElement if panelContainer only ever has one child. For safety, return the container.
            // ui.renderTabPanelContent expects an HTMLElement. If panelContainer is just a wrapper,
            // return panelContainer.firstElementChild (this.panelElement).

        } catch (error) {
            console.error("MonitorsScreenJS: Error in getContentElement:", error);
            const errorPanel = document.createElement('div');
            errorPanel.innerHTML = `<p class="error-message">Error loading Monitors screen: ${error.message}</p>`;
            return errorPanel;
        }
    },

    cleanup: function () {
        console.log("MonitorsScreenJS: Cleaning up for scenario", this.activeScenarioId);
        if (this.activeScenarioId && window.patientMonitor?.removeInstance) {
            window.patientMonitor.removeInstance(this.activeScenarioId); // Tell patientMonitor to clean its specific instance
        }
        this.activeScenarioId = null;
        this.activeScenarioName = "N/A";
        this.panelElement = null;
    }
};
window.monitorsScreen = monitorsScreen;