// patientMonitor/patientMonitor.js
console.log("PatientMonitorJS: Script loaded.");

const patientMonitor = {
    instances: {}, // Keyed by scenarioId

    // --- DOM ID BASES (Ensure these match patientMonitor.html after {{SCENARIO_ID}} replacement) ---
    ECG_CANVAS_ID_BASE: 'pm-ecg-canvas-',
    ECG_RHYTHM_ID_BASE: 'pm-ecg-rhythm-',
    HR_VALUE_ID_BASE: 'pm-hr-value-',
    PLETH_CANVAS_ID_BASE: 'pm-pleth-canvas-',
    SPO2_VALUE_ID_BASE: 'pm-spo2-value-',
    ABP_CANVAS_ID_BASE: 'pm-abp-canvas-',
    ABP_VALUE_ID_BASE: 'pm-abp-value-',
    MAP_VALUE_ID_BASE: 'pm-map-value-',
    NBP_VALUE_ID_BASE: 'pm-nbp-value-',
    NBP_MAP_ID_BASE: 'pm-nbp-map-',
    NBP_TIME_ID_BASE: 'pm-nbp-time-',
    ETCO2_CANVAS_ID_BASE: 'pm-etco2-canvas-',
    ETCO2_VALUE_ID_BASE: 'pm-etco2-value-',
    ETCO2_UNIT_ID_BASE: 'pm-etco2-unit-',
    RR_VALUE_ID_BASE: 'pm-rr-value-',
    TEMP_VALUE_ID_BASE: 'pm-temp-value-',
    MUTE_ALARMS_BTN_ID_BASE: 'pm-mute-alarms-btn-',
    PAUSE_ALL_BTN_ID_BASE: 'pm-pause-resume-all-btn-',
    START_NIBP_BTN_SELECTOR: '[data-action="start-nibp"]', // Using data-action as ID might change with scenarioId

    /**
     * Initializes or updates a patient monitor instance for a specific scenario.
     * The monitorWidgetRootElement IS the content from patientMonitor.html, already injected.
     * @param {string} scenarioId
     * @param {HTMLElement} monitorWidgetRootElement - The root DOM element of this monitor's UI.
     * @param {Object} [initialVitalsFromCaller={}] - Explicit initial vitals, e.g., from AI or appData.
     */
    initInstance: async function (scenarioId, monitorWidgetRootElement, initialVitalsFromCaller = {}) {
        console.log(`PatientMonitor (${scenarioId}): initInstance CALLED. InitialVitalsFromCaller:`, JSON.parse(JSON.stringify(initialVitalsFromCaller)), "Widget Root Provided:", !!monitorWidgetRootElement);

        if (!monitorWidgetRootElement || typeof monitorWidgetRootElement.querySelector !== 'function') {
            console.error(`PatientMonitor (${scenarioId}): CRITICAL - monitorWidgetRootElement is invalid or not provided! Cannot initialize.`);
            return;
        }

        let instance = this.instances[scenarioId];
        // isFirstTimeEverForThisInstanceData: True if we have no prior data for this scenarioId's instance
        const isFirstTimeEverForThisInstanceData = !instance || !instance.vitals;

        if (!instance) {
            instance = { scenarioId: scenarioId };
            this.instances[scenarioId] = instance;
            console.log(`PatientMonitor (${scenarioId}): NEW instance object shell created.`);
        }
        instance.scenarioId = scenarioId; // Ensure it's always set

        // --- DOM Element Fetching (Always re-fetch as monitorWidgetRootElement is new) ---
        console.log(`PatientMonitor (${scenarioId}): Performing DOM element fetching within provided widgetElement.`);
        instance.dom = {
            ecgCanvas: monitorWidgetRootElement.querySelector(`#${this.ECG_CANVAS_ID_BASE}${scenarioId}`),
            ecgRhythmText: monitorWidgetRootElement.querySelector(`#${this.ECG_RHYTHM_ID_BASE}${scenarioId}`),
            hrValue: monitorWidgetRootElement.querySelector(`#${this.HR_VALUE_ID_BASE}${scenarioId}`),
            plethCanvas: monitorWidgetRootElement.querySelector(`#${this.PLETH_CANVAS_ID_BASE}${scenarioId}`),
            spo2Value: monitorWidgetRootElement.querySelector(`#${this.SPO2_VALUE_ID_BASE}${scenarioId}`),
            abpCanvas: monitorWidgetRootElement.querySelector(`#${this.ABP_CANVAS_ID_BASE}${scenarioId}`),
            abpValue: monitorWidgetRootElement.querySelector(`#${this.ABP_VALUE_ID_BASE}${scenarioId}`),
            mapValue: monitorWidgetRootElement.querySelector(`#${this.MAP_VALUE_ID_BASE}${scenarioId}`),
            nbpValue: monitorWidgetRootElement.querySelector(`#${this.NBP_VALUE_ID_BASE}${scenarioId}`),
            nbpMap: monitorWidgetRootElement.querySelector(`#${this.NBP_MAP_ID_BASE}${scenarioId}`),
            nbpTime: monitorWidgetRootElement.querySelector(`#${this.NBP_TIME_ID_BASE}${scenarioId}`),
            etco2Canvas: monitorWidgetRootElement.querySelector(`#${this.ETCO2_CANVAS_ID_BASE}${scenarioId}`),
            etco2Value: monitorWidgetRootElement.querySelector(`#${this.ETCO2_VALUE_ID_BASE}${scenarioId}`),
            etco2Unit: monitorWidgetRootElement.querySelector(`#${this.ETCO2_UNIT_ID_BASE}${scenarioId}`),
            rrValue: monitorWidgetRootElement.querySelector(`#${this.RR_VALUE_ID_BASE}${scenarioId}`),
            tempValue: monitorWidgetRootElement.querySelector(`#${this.TEMP_VALUE_ID_BASE}${scenarioId}`),
            muteAlarmsBtn: monitorWidgetRootElement.querySelector(`#${this.MUTE_ALARMS_BTN_ID_BASE}${scenarioId}`),
            pauseResumeAllBtn: monitorWidgetRootElement.querySelector(`#${this.PAUSE_ALL_BTN_ID_BASE}${scenarioId}`),
            startNibpBtn: monitorWidgetRootElement.querySelector(`.patient-monitor-footer-controls ${this.START_NIBP_BTN_SELECTOR}`) // More specific query
        };
        console.log(`PatientMonitor (${scenarioId}): DOM Elements Fetched - HR Value: ${!!instance.dom.hrValue}, SpO2 Value: ${!!instance.dom.spo2Value}, ECG Canvas: ${!!instance.dom.ecgCanvas}`);

        if (!instance.dom.hrValue || !instance.dom.spo2Value || !instance.dom.ecgCanvas /* add other CRITICAL checks */) {
            console.error(`PatientMonitor (${scenarioId}): One or more critical display elements NOT FOUND within widgetElement! Check IDs in patientMonitor.html and here. SCENARIO_ID was: ${scenarioId}`);
            monitorWidgetRootElement.innerHTML = "<p class='error-message'>Monitor critical elements missing.</p>";
            instance._domFullyInitialized = false; // Mark as failed
            return;
        }

        // --- Initialize or Preserve Data Values ---
        if (isFirstTimeEverForThisInstanceData) {
            console.log(`PatientMonitor (${scenarioId}): First time DATA initialization with passed values:`, initialVitalsFromCaller);
            instance.vitals = {
                hr: initialVitalsFromCaller.hr ?? 70,
                spo2: initialVitalsFromCaller.spo2 ?? 98,
                abpSys: initialVitalsFromCaller.abpSys ?? 120, abpDia: initialVitalsFromCaller.abpDia ?? 80,
                map: initialVitalsFromCaller.map ?? this.calculateMap(initialVitalsFromCaller.abpSys ?? 120, initialVitalsFromCaller.abpDia ?? 80),
                nbpSys: initialVitalsFromCaller.nbpSys ?? 122, nbpDia: initialVitalsFromCaller.nbpDia ?? 79,
                nbpMap: initialVitalsFromCaller.nbpMap ?? this.calculateMap(initialVitalsFromCaller.nbpSys ?? 122, initialVitalsFromCaller.nbpDia ?? 79),
                nbpLastReadingTime: null,
                etco2: initialVitalsFromCaller.etco2 ?? 35,
                etco2Unit: initialVitalsFromCaller.etco2Unit || "mmHg",
                rr: initialVitalsFromCaller.rr ?? 16,
                temp: initialVitalsFromCaller.temp ?? 36.9,
                ecgRhythm: initialVitalsFromCaller.ecgRhythm || "Sinus Rhythm"
            };
            instance.targets = { ...instance.vitals };
            instance.durations = {}; instance.changeRates = {};
            instance.isPaused = false; instance.alarmsMuted = false; // Monitor's own pause/mute

            instance.ecgWave = { data: [], index: 0, scrollSpeedFactor: 1.0, amplitude: 0, yOffset: 0 };
            instance.plethWave = { data: [], index: 0, scrollSpeedFactor: 1.0, amplitude: 0, yOffset: 0 };
            instance.abpWave = { data: [], index: 0, scrollSpeedFactor: 1.0, amplitude: 0, yOffset: 0 };
            instance.etco2Wave = { data: [], index: 0, scrollSpeedFactor: 4.0, amplitude: 0, yOffset: 0 };
            instance._dataInitialized = true; // Mark data as initialized for the first time
        } else {
            console.log(`PatientMonitor (${scenarioId}): Re-activating. Preserving existing instance data. Current HR from instance: ${instance.vitals?.hr}`);
            // Ensure vitals object and waveform configs exist if instance was only partially created before
            if (!instance.vitals) instance.vitals = {}; // Should not happen if above is correct
            if (!instance.ecgWave) instance.ecgWave = { data: [], index: 0, scrollSpeedFactor: 1.0, amplitude: 0, yOffset: 0 };
            // ... for other waves
        }

        // --- Canvas Setup (Always do this after DOM elements are re-fetched for this widgetElement) ---
        this.setupCanvas(instance.dom.ecgCanvas, instance, 'ecgWave');
        this.setupCanvas(instance.dom.plethCanvas, instance, 'plethWave');
        this.setupCanvas(instance.dom.abpCanvas, instance, 'abpWave');
        this.setupCanvas(instance.dom.etco2Canvas, instance, 'etco2Wave');

        // --- Button Listeners (Attach to the new DOM elements) ---
        // To prevent multiple listeners on semantic actions if instance object persists but DOM is new:
        // We rely on `monitorWidgetRootElement.querySelector` finding the *new* button.
        if (instance.dom.pauseResumeAllBtn) {
            instance.dom.pauseResumeAllBtn.textContent = instance.isPaused ? "Resume All" : "Pause All";
            // Remove old listener if any (more robust way if element could persist)
            // instance.dom.pauseResumeAllBtn.replaceWith(instance.dom.pauseResumeAllBtn.cloneNode(true));
            // instance.dom.pauseResumeAllBtn = monitorWidgetRootElement.querySelector('#' + this.PAUSE_ALL_BTN_ID_BASE + scenarioId);
            // For simplicity, if the button is new from innerHTML, direct addEventListener is fine.
            // If worried, add a flag like _pauseListenerAttached.
            if (!instance.dom.pauseResumeAllBtn._listenerAttachedPM) {
                instance.dom.pauseResumeAllBtn.addEventListener('click', () => this.togglePauseInstance(scenarioId));
                instance.dom.pauseResumeAllBtn._listenerAttachedPM = true;
            }
        }
        if (instance.dom.muteAlarmsBtn) {
            instance.dom.muteAlarmsBtn.textContent = instance.alarmsMuted ? "Unmute Alarms" : "Mute Alarms";
            if (!instance.dom.muteAlarmsBtn._listenerAttachedPM) {
                instance.dom.muteAlarmsBtn.addEventListener('click', () => this.toggleMuteAlarms(scenarioId));
                instance.dom.muteAlarmsBtn._listenerAttachedPM = true;
            }
        }
        if (instance.dom.startNibpBtn) {
            if (!instance.dom.startNibpBtn._listenerAttachedPM) {
                instance.dom.startNibpBtn.addEventListener('click', () => this.takeNbpReading(scenarioId));
                instance.dom.startNibpBtn._listenerAttachedPM = true;
            }
        }

        instance._domFullyInitialized = true; // Mark that DOM elements specific to this widget are now set up
        this.renderInstance(scenarioId);
        console.log(`PatientMonitor (${scenarioId}): Init/refresh complete. Final Current HR from instance: ${instance.vitals?.hr}`);
    },



    setupCanvas: function (canvasElement, instance, waveType) {
        if (canvasElement && instance) { // Ensure instance is passed and valid
            const waveConfig = instance[waveType]; // e.g., instance.ecgWave or instance.plethWave

            if (!waveConfig) { // If this specific waveConfig object doesn't exist on the instance
                console.error(`PatientMonitor (${instance.scenarioId}): CRITICAL - waveConfig for waveType '${waveType}' is undefined on instance in setupCanvas. Initialize it in initInstance first!`);
                // As a fallback, create it here, but it's better practice to init in initInstance
                // instance[waveType] = { data: [], index: 0, scrollSpeedFactor: 1.0, amplitude: 0, yOffset: 0 };
                // waveConfig = instance[waveType]; // Now try again
                return; // Exit if still not resolvable
            }

            canvasElement.width = canvasElement.clientWidth || window.innerWidth - 100 || 800; // Default to 800 if clientWidth is zero
            canvasElement.height = canvasElement.clientHeight || 100;

            if (canvasElement.height > 0) {
                waveConfig.yOffset = canvasElement.height / 2;
                waveConfig.amplitude = canvasElement.height * 0.3;
                // Generate wave data only if it's empty (e.g., first time)
                if (!waveConfig.data || waveConfig.data.length === 0) {
                    if (waveType === 'ecgWave' && typeof this.generateECGWave === 'function') this.generateECGWave(instance);
                    else if (waveType === 'plethWave' && typeof this.generatePlethWave === 'function') this.generatePlethWave(instance);
                    else if (waveType === 'abpWave' && typeof this.generateABPWave === 'function') this.generateABPWave(instance);
                    else if (waveType === 'etco2Wave' && typeof this.generateEtCO2Wave === 'function') this.generateEtCO2Wave(instance);
                } else {
                    console.log(`PatientMonitor (${instance.scenarioId}): Wave data for '${waveType}' already exists. Length: ${waveConfig.data.length}`);
                }
            } else { /* warn about zero height */ }
        } else if (!canvasElement) {
            console.warn(`PatientMonitor (${instance?.scenarioId || 'UnknownScenario'}): Canvas element for ${waveType} is null in setupCanvas.`);
        } else if (!instance) {
            console.warn(`PatientMonitor (UnknownScenario): Instance is null in setupCanvas for ${waveType}.`);
        }
    },

    // --- Waveform Generation Placeholder Functions ---
    generateECGWave: function (instance) {
        const waveConfig = instance.ecgWave;
        waveConfig.data = [];
        const totalPoints = 30; // Increased points for better detail
        const yBaseline = waveConfig.yOffset;
        const amplitude = waveConfig.amplitude;

        // --- P Wave (Atrial Depolarization) ---
        const pWaveDuration = totalPoints * 0.08; // Approximately 8% of the cycle
        const pWaveAmplitude = amplitude * 0.2;
        for (let i = 0; i < pWaveDuration; i++) {
            const x = i / pWaveDuration;
            // A small, rounded positive wave
            waveConfig.data.push(yBaseline - pWaveAmplitude * (Math.sin(x * Math.PI)));
        }

        // --- PR Segment (Delay at AV Node) ---
        const prSegmentDuration = totalPoints * 0.04; // Approximately 4% of the cycle
        for (let i = 0; i < prSegmentDuration; i++) {
            waveConfig.data.push(yBaseline); // Flat line
        }

        // --- QRS Complex (Ventricular Depolarization) ---
        const qrsComplexDuration = totalPoints * 0.12; // Approximately 12% of the cycle
        const qrsPeakAmplitude = amplitude * 1.5; // Higher amplitude for QRS
        const qrsOffset = waveConfig.data.length; // Starting index for QRS

        // Q wave (initial negative deflection)
        const qWaveDuration = qrsComplexDuration * 0.2;
        for (let i = 0; i < qWaveDuration; i++) {
            const x = i / qWaveDuration;
            waveConfig.data.push(yBaseline + qrsPeakAmplitude * 0.3 * Math.sin(x * Math.PI)); // Sharp downward spike
        }

        // R wave (tall positive deflection)
        const rWaveDuration = qrsComplexDuration * 0.4;
        for (let i = 0; i < rWaveDuration; i++) {
            const x = i / rWaveDuration;
            // Sharp upward spike, then back down
            waveConfig.data.push(yBaseline - qrsPeakAmplitude * (1 - Math.pow(2 * x - 1, 2))); // Parabolic shape for sharp peak
        }

        // S wave (negative deflection after R)
        const sWaveDuration = qrsComplexDuration * 0.4;
        for (let i = 0; i < sWaveDuration; i++) {
            const x = i / sWaveDuration;
            waveConfig.data.push(yBaseline + qrsPeakAmplitude * 0.5 * Math.sin(x * Math.PI)); // Sharp downward spike
        }

        // --- ST Segment (Ventricular Repolarization begins) ---
        const stSegmentDuration = totalPoints * 0.15; // Approximately 15% of the cycle
        for (let i = 0; i < stSegmentDuration; i++) {
            waveConfig.data.push(yBaseline); // Flat line (ideally at baseline)
        }

        // --- T Wave (Ventricular Repolarization) ---
        const tWaveDuration = totalPoints * 0.25; // Approximately 25% of the cycle
        const tWaveAmplitude = amplitude * 0.4;
        for (let i = 0; i < tWaveDuration; i++) {
            const x = i / tWaveDuration;
            // A broader, rounded positive wave
            waveConfig.data.push(yBaseline - tWaveAmplitude * (Math.sin(x * Math.PI)));
        }

        // --- U Wave (Optional, not always present) ---
        // For simplicity, we'll just add a flat line or a very small wave after T
        const uWaveAndDiastoleDuration = totalPoints - waveConfig.data.length;
        for (let i = 0; i < uWaveAndDiastoleDuration; i++) {
            waveConfig.data.push(yBaseline);
        }

        console.log(`PatientMonitor (${instance.scenarioId}): ECG wave generated with components.`);
    },
    generatePlethWave: function (instance) {
        const waveConfig = instance.plethWave;
        waveConfig.data = [];
        const totalPoints = 20; // More points for a smoother wave
        const yBaseline = waveConfig.yOffset;
        const amplitude = waveConfig.amplitude * 0.8; // Adjust amplitude as needed

        // Simulate one full cycle of a pleth wave
        for (let i = 0; i < totalPoints; i++) {
            const x = i / totalPoints; // Normalize x to be between 0 and 1

            let value;

            value = 0.5 * Math.sin(4 * Math.PI * x) + 0.8 * Math.sin(2 * Math.PI * x)

            // Apply amplitude and yOffset, inverting if needed to match typical display (peaks upwards)
            waveConfig.data.push(yBaseline - value * amplitude);
        }

        console.log(`PatientMonitor (${instance.scenarioId}): Pleth wave generated.`);
    },
    generateABPWave: function (instance) { /* ... (similar to pleth but maybe different shape/color) ... */
        const waveConfig = instance.abpWave;
        waveConfig.data = []; const len = 20;
        const totalPoints = 20; // More points for a smoother wave
        const yBaseline = waveConfig.yOffset;
        const amplitude = waveConfig.amplitude * 0.8; // Adjust amplitude as needed

        // Simulate one full cycle of a pleth wave
        for (let i = 0; i < totalPoints; i++) {
            const x = i / totalPoints; // Normalize x to be between 0 and 1

            let value;

            value = 0.5 * Math.sin(4 * Math.PI * x + 0.5) + 0.9 * Math.sin(2 * Math.PI * x)

            // Apply amplitude and yOffset, inverting if needed to match typical display (peaks upwards)
            waveConfig.data.push(yBaseline - value * amplitude);
        }
        console.log(`PatientMonitor (${instance.scenarioId}): ABP wave generated.`);
    },
    generateEtCO2Wave: function (instance) {
        const waveConfig = instance.etco2Wave;
        waveConfig.data = [];

        // Define lengths for each phase of the EtCO2 waveform
        const baselineLength = 5;   // Phase I: Flat baseline (inspiratory)
        const upstrokeLength = 2;   // Phase II: Rapid rise (expiratory upstroke)
        const plateauLength = 50;    // Phase III: Alveolar plateau
        const downstrokeLength = 2; // Phase IV: Rapid fall (inspiratory downstroke)

        // Ensure phases add up to totalCycleLength (or adjust totalCycleLength)
        // For demonstration, these add up to 100: 20+15+45+20 = 100

        for (let i = 0; i < baselineLength + upstrokeLength + plateauLength + downstrokeLength; i++) {
            let y_norm = 0; // Normalized Y value (0 at baseline, 1 at peak)

            if (i < baselineLength) {
                // Phase I: Inspiratory Baseline (flat, near zero CO2)
                y_norm = 0;
            } else if (i < baselineLength + upstrokeLength) {
                // Phase II: Expiratory Upstroke (rapid rise)
                const phaseProgress = (i - baselineLength) / upstrokeLength;
                y_norm = phaseProgress;
            } else if (i < baselineLength + upstrokeLength + plateauLength) {
                // Phase III: Alveolar Plateau (highest CO2 concentration)
                // A slight slope can be added for more realism if desired
                const phaseProgress = (i - (baselineLength + upstrokeLength)) / plateauLength;
                y_norm = 1 + (phaseProgress * 0.2); // Slight decrease over plateau
            } else if (i < baselineLength + upstrokeLength + plateauLength + downstrokeLength) {
                // Phase IV: Inspiratory Downstroke (rapid fall to baseline)
                const phaseProgress = (i - (baselineLength + upstrokeLength + plateauLength)) / downstrokeLength;
                y_norm = 1 - phaseProgress;
            } else {
                // Should theoretically not be reached if lengths sum up to totalCycleLength
                // or if it signifies the very start of the next baseline.
                y_norm = 0;
            }

            // Apply amplitude and yOffset to map to screen coordinates
            // Assuming yOffset is the baseline for your graph, and amplitude is the height
            // This calculates the point from bottom-up for easier visualization.
            waveConfig.data.push(waveConfig.yOffset - y_norm * waveConfig.amplitude);
        }
        console.log(`PatientMonitor (${instance.scenarioId}): EtCO2 wave generated.`);
    },
    /**
     * Updates the internal data model for a specific monitor instance.
     * @param {string} scenarioId
     * @param {number} deltaTimeSeconds
     */
    updateLogicInstance: function (scenarioId, deltaTimeSeconds) {
        const instance = this.instances[scenarioId];
        if (!instance || !instance.vitals || !instance.targets || !instance.durations || !instance.changeRates) {
            // console.warn(`PatientMonitor Logic (${scenarioId}): Instance or vital tracking objects missing.`);
            return;
        }

        // Check main scenario pause state from appData, and monitor's own pause state
        const appData = window.appShell?.getAppData();
        const mainScenarioPaused = appData?.playerData.activeScenarios[scenarioId]?.isPaused === true;
        if (instance.isPaused || mainScenarioPaused) {
            // if (animations.frameCount % 120 === 0) console.log(`PatientMonitor Logic (${scenarioId}): Paused, no updates.`);
            return;
        }

        let vitalsChangedInInstanceThisTick = false;

        // Define all vitals that can change gradually
        const gradualVitalsKeys = ['hr', 'spo2', 'abpSys', 'abpDia', 'etco2', 'rr', 'temp'];

        gradualVitalsKeys.forEach(vitalKey => {
            if (instance.durations[vitalKey] !== undefined && instance.durations[vitalKey] > 0 &&
                instance.targets[vitalKey] !== undefined && instance.vitals[vitalKey] !== undefined &&
                instance.changeRates[vitalKey] !== undefined) {

                const oldValue = instance.vitals[vitalKey];
                let changeThisTick = instance.changeRates[vitalKey] * deltaTimeSeconds;

                // If very close to target, just snap to avoid overshooting due to large deltaTimeSeconds
                if (Math.abs(instance.targets[vitalKey] - instance.vitals[vitalKey]) < Math.abs(changeThisTick)) {
                    changeThisTick = instance.targets[vitalKey] - instance.vitals[vitalKey];
                }

                instance.vitals[vitalKey] += changeThisTick;
                instance.durations[vitalKey] -= deltaTimeSeconds;

                const target = instance.targets[vitalKey];
                if (instance.durations[vitalKey] <= 0 ||
                    (instance.changeRates[vitalKey] > 0 && instance.vitals[vitalKey] >= target) ||
                    (instance.changeRates[vitalKey] < 0 && instance.vitals[vitalKey] <= target)) {
                    instance.vitals[vitalKey] = target;
                    instance.durations[vitalKey] = 0;
                    instance.changeRates[vitalKey] = 0;
                    // console.log(`PatientMonitor Logic (${scenarioId}): ${vitalKey} reached target ${target}`);
                }

                // Clamping values
                if (vitalKey === 'hr') instance.vitals[vitalKey] = Math.max(0, Math.min(300, Math.round(instance.vitals[vitalKey])));
                else if (vitalKey === 'spo2') instance.vitals[vitalKey] = Math.max(0, Math.min(100, Math.round(instance.vitals[vitalKey])));
                else if (vitalKey === 'abpSys' || vitalKey === 'abpDia') instance.vitals[vitalKey] = Math.max(0, Math.min(300, Math.round(instance.vitals[vitalKey])));
                else if (vitalKey === 'etco2') instance.vitals[vitalKey] = Math.max(0, Math.min(100, parseFloat(instance.vitals[vitalKey].toFixed(1))));
                else if (vitalKey === 'rr') instance.vitals[vitalKey] = Math.max(0, Math.min(60, Math.round(instance.vitals[vitalKey])));
                else if (vitalKey === 'temp') instance.vitals[vitalKey] = Math.max(30, Math.min(45, parseFloat(instance.vitals[vitalKey].toFixed(1))));

                if (oldValue !== instance.vitals[vitalKey]) {
                    vitalsChangedInInstanceThisTick = true;
                    // console.log(`PatientMonitor Logic (${scenarioId}): ${vitalKey} changed to ${instance.vitals[vitalKey]}`); // DEBUG
                }
            }
        });

        // Update Calculated Vitals (MAPs) if their components changed
        let mapChanged = false;
        if (instance.vitals.abpSys !== undefined && instance.vitals.abpDia !== undefined) {
            const newMap = this.calculateMap(instance.vitals.abpSys, instance.vitals.abpDia);
            if (instance.vitals.map !== newMap) { instance.vitals.map = newMap; mapChanged = true; }
        }
        if (instance.vitals.nbpSys !== undefined && instance.vitals.nbpDia !== undefined) {
            const newNbpMap = this.calculateMap(instance.vitals.nbpSys, instance.vitals.nbpDia);
            if (instance.vitals.nbpMap !== newNbpMap) { instance.vitals.nbpMap = newNbpMap; mapChanged = true; }
        }
        if (mapChanged) vitalsChangedInInstanceThisTick = true;


        // If any vital in the instance changed, update the central appData state
        if (vitalsChangedInInstanceThisTick) {
            if (appData?.playerData.activeScenarios[scenarioId]) {
                if (!appData.playerData.activeScenarios[scenarioId].patientData) appData.playerData.activeScenarios[scenarioId].patientData = {};
                if (!appData.playerData.activeScenarios[scenarioId].patientData.vitals) appData.playerData.activeScenarios[scenarioId].patientData.vitals = {};

                // Sync all current vitals from instance to appData
                // Also sync targets and remaining durations for persistence on reload
                for (const key in instance.vitals) {
                    appData.playerData.activeScenarios[scenarioId].patientData.vitals[key] = instance.vitals[key];
                }
                if (instance.targets) {
                    for (const key in instance.targets) {
                        const capKey = key.charAt(0).toUpperCase() + key.slice(1);
                        appData.playerData.activeScenarios[scenarioId].patientData.vitals[`target${capKey}`] = instance.targets[key];
                    }
                }
                if (instance.durations) {
                    for (const key in instance.durations) {
                        appData.playerData.activeScenarios[scenarioId].patientData.vitals[`${key}DurationRemaining`] = instance.durations[key] || 0;
                    }
                }
                // console.log(`PatientMonitor (${scenarioId}): Synced instance vitals to appData after logic update.`);
                // No direct save here; main.js handles saving appData.
            }
        }
    },
    /**
     * Renders a specific monitor instance.
     * @param {string} scenarioId
     */
    // patientMonitor/patientMonitor.js

    renderInstance: function (scenarioId) {
        const instance = this.instances[scenarioId];
        if (!instance || !instance._domFullyInitialized || !instance.dom || !instance.vitals) {
            // Optional: log less frequently if continuously called for unready instance
            // if (window.animations && window.animations.frameCount % 120 === 0) {
            //     console.warn(`PatientMonitor Render WARN (${scenarioId}): Instance, DOM, or vitals not ready for render.`);
            // }
            return;
        }

        // If the monitor widget itself is paused by its own button
        if (instance.isPaused) {
            // Update text to show paused state, then draw "Paused" on canvases
            if (instance.dom.hrValue && instance.vitals.hr !== undefined) instance.dom.hrValue.textContent = `${Math.round(instance.vitals.hr)} (P)`;
            if (instance.dom.spo2Value && instance.vitals.spo2 !== undefined) instance.dom.spo2Value.textContent = `${Math.round(instance.vitals.spo2)} (P)`;
            if (instance.dom.abpValue && instance.vitals.abpSys !== undefined) instance.dom.abpValue.textContent = `${Math.round(instance.vitals.abpSys)}/${Math.round(instance.vitals.abpDia)} (P)`;
            if (instance.dom.mapValue && instance.vitals.map !== undefined) instance.dom.mapValue.textContent = `${Math.round(instance.vitals.map)} (P)`;
            if (instance.dom.nbpValue && instance.vitals.nbpSys !== undefined) instance.dom.nbpValue.textContent = `${Math.round(instance.vitals.nbpSys)}/${Math.round(instance.vitals.nbpDia)} (P)`;
            if (instance.dom.nbpMap && instance.vitals.nbpMap !== undefined) instance.dom.nbpMap.textContent = `${Math.round(instance.vitals.nbpMap)} (P)`;
            if (instance.dom.etco2Value && instance.vitals.etco2 !== undefined) instance.dom.etco2Value.textContent = `${instance.vitals.etco2.toFixed(1)} (P)`;
            if (instance.dom.rrValue && instance.vitals.rr !== undefined) instance.dom.rrValue.textContent = `${Math.round(instance.vitals.rr)} (P)`;
            if (instance.dom.tempValue && instance.vitals.temp !== undefined) instance.dom.tempValue.textContent = `${instance.vitals.temp.toFixed(1)} (P)`;

            this.clearOrPauseCanvas(instance.dom.ecgCanvas, "Display Paused");
            this.clearOrPauseCanvas(instance.dom.plethCanvas, "Display Paused");
            this.clearOrPauseCanvas(instance.dom.abpCanvas, "Display Paused");
            this.clearOrPauseCanvas(instance.dom.etco2Canvas, "Display Paused");
            return; // Stop further rendering if paused
        }

        // HR
        if (instance.dom.hrValue) {
            const hrStr = (instance.vitals.hr !== undefined) ? String(Math.round(instance.vitals.hr)) : "--";
            if (instance.dom.hrValue.textContent !== hrStr) instance.dom.hrValue.textContent = hrStr;
        }
        // SpO2
        if (instance.dom.spo2Value) {
            const spo2Str = (instance.vitals.spo2 !== undefined) ? String(Math.round(instance.vitals.spo2)) : "--";
            if (instance.dom.spo2Value.textContent !== spo2Str) instance.dom.spo2Value.textContent = spo2Str;
        }
        // ABP & MAP
        if (instance.dom.abpValue) {
            instance.dom.abpValue.textContent = (instance.vitals.abpSys !== undefined && instance.vitals.abpDia !== undefined) ?
                `${Math.round(instance.vitals.abpSys)}/${Math.round(instance.vitals.abpDia)}` : "--/--";
        }
        if (instance.dom.mapValue) {
            instance.dom.mapValue.textContent = (instance.vitals.map !== undefined) ?
                String(Math.round(instance.vitals.map)) : "--";
        }
        // NBP & NBP MAP & Time
        if (instance.dom.nbpValue) {
            instance.dom.nbpValue.textContent = (instance.vitals.nbpSys !== undefined && instance.vitals.nbpDia !== undefined) ?
                `${Math.round(instance.vitals.nbpSys)}/${Math.round(instance.vitals.nbpDia)}` : "--/--";
        }
        if (instance.dom.nbpMap) {
            instance.dom.nbpMap.textContent = (instance.vitals.nbpMap !== undefined) ?
                String(Math.round(instance.vitals.nbpMap)) : "--";
        }
        if (instance.dom.nbpTime) { // Always update time or show placeholder
            instance.dom.nbpTime.textContent = instance.vitals.nbpLastReadingTime ?
                `@ ${new Date(instance.vitals.nbpLastReadingTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` :
                "@ --:--";
        }


        // EtCO2 & Unit & RR
        if (instance.dom.etco2Value) {
            instance.dom.etco2Value.textContent = (instance.vitals.etco2 !== undefined) ?
                instance.vitals.etco2.toFixed(1) : "--.-";
        }
        if (instance.dom.etco2Unit) { // Assuming unit might change (mmHg/kPa)
            instance.dom.etco2Unit.textContent = instance.vitals.etco2Unit || "mmHg";
        }
        if (instance.dom.rrValue) {
            instance.dom.rrValue.textContent = (instance.vitals.rr !== undefined) ?
                String(Math.round(instance.vitals.rr)) : "--";
        }
        // Temperature
        if (instance.dom.tempValue) {
            instance.dom.tempValue.textContent = (instance.vitals.temp !== undefined) ?
                instance.vitals.temp.toFixed(1) : "--.-";
        }
        // ECG Rhythm Text
        if (instance.dom.ecgRhythmText && instance.vitals.ecgRhythm) {
            if (instance.dom.ecgRhythmText.textContent !== instance.vitals.ecgRhythm) {
                instance.dom.ecgRhythmText.textContent = instance.vitals.ecgRhythm;
            }
        } else if (instance.dom.ecgRhythmText) instance.dom.ecgRhythmText.textContent = "---";


        // --- Draw Waveforms ---
        // (This part assumes instance.vitals.hr and instance.vitals.rr are used by drawWave for speed)
        if (instance.dom.ecgCanvas) this.drawWave(instance.dom.ecgCanvas, instance.ecgWave, '#00FF00', instance.vitals.hr);
        if (instance.dom.plethCanvas) this.drawWave(instance.dom.plethCanvas, instance.plethWave, '#00FFFF', instance.vitals.hr);
        if (instance.dom.abpCanvas) this.drawWave(instance.dom.abpCanvas, instance.abpWave, '#FF0000', instance.vitals.hr);
        if (instance.dom.etco2Canvas) this.drawWave(instance.dom.etco2Canvas, instance.etco2Wave, '#FFFF00', instance.vitals.rr);
    },


    /**
     * Generic waveform drawing function.
     * @param {HTMLCanvasElement} canvasEl
     * @param {Object} waveConfig - { data, index, amplitude, yOffset, scrollSpeedFactor }
     * @param {string} color
     * @param {number} rateForSpeed - e.g., HR or RR to influence scroll speed
     */
    drawWave: function (canvasEl, waveConfig, color, rate) {
        if (!canvasEl || !waveConfig || !waveConfig.data || waveConfig.data.length === 0) return;
        const ctx = canvasEl.getContext('2d');
        if (!ctx) return;

        const width = canvasEl.width;
        const height = canvasEl.height;

        const pointsInOneCycle = waveConfig.data.length;
        const effectiveRate = rate;

        // --- Core Spacing Parameters ---
        // 1. How much each *actual data point* from waveConfig.data contributes to horizontal space.
        // INCREASE this to make the *pulses themselves* wider, thus fewer pulses on screen.
        const pixelsPerDataPoint = 3; // Start with a noticeable value, like 5 or 10, to see the effect.

        // 2. How much additional blank space (gap) there is after each pulse.
        // This is the primary control for the *gap between pulses*.
        // It's defined as a multiplier of the pulse's visual width.
        // For example: if 1, spacing is equal to pulse width. If 0.5, spacing is half pulse width.
        // To INCREASE the space between pulses, INCREASE this value.
        const spacingMultiplier = 60 / effectiveRate + 0.4; // For example, 2 means the gap is twice the width of the pulse.
        // You can derive this from 'rate' if you want it rate-dependent.
        // const spacingMultiplier = (1 / effectiveRate) - 1; // Example for rate dependency


        // Calculate the effective visual length of one pulse on the canvas
        const visualPulseLength = pointsInOneCycle * pixelsPerDataPoint;

        // Calculate the effective visual length of the spacing on the canvas
        const visualSpacingLength = visualPulseLength * spacingMultiplier;

        // The total visual length of one complete pulse + gap cycle on the canvas
        const totalVisualCycleLength = visualPulseLength + visualSpacingLength;


        // --- CRT Monitor Effect Parameters ---
        const scanSpeed = pixelsPerDataPoint; // How many pixels the "eraser/drawing head" moves per frame (increase for faster scan)
        const eraserWidth = 10; // Width of the "black box" eraser
        const scanLineColor = color; // Color of the actively drawn line
        const fadeAmount = 0.01; // How much the *entire canvas* fades per frame (for persistence, smaller is slower)
        const backgroundColor = 'black'; // The color the canvas fades towards

        // Initialize scanX and waveConfig.index if they don't exist
        if (typeof waveConfig.scanX === 'undefined') {
            waveConfig.scanX = 0;
        }
        if (typeof waveConfig.index === 'undefined') { // This `index` tracks our position within the *visual* waveform
            waveConfig.index = 0;
        }

        // --- Core CRT Scan Logic ---

        // 1. Apply a subtle fade to the entire canvas for persistence
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = `rgba(0, 0, 0, ${fadeAmount})`;
        ctx.fillRect(0, 0, width, height);

        // 2. Move the "eraser" (clear a small rectangle)
        ctx.clearRect(waveConfig.scanX, 0, eraserWidth, height);

        // 3. Draw the new segment of the waveform
        ctx.strokeStyle = scanLineColor;
        ctx.lineWidth = 2;
        ctx.beginPath();

        const x = waveConfig.scanX; // Current X position on the canvas

        // Calculate the position within the *totalVisualCycleLength*
        // waveConfig.index now represents our scroll position in *visual pixels*
        const currentVisualPositionInCycle = (waveConfig.index + x) % totalVisualCycleLength;

        let y;
        if (currentVisualPositionInCycle >= 0 && currentVisualPositionInCycle < visualPulseLength) {
            // We are in the "pulse" part of the cycle
            // Map the visual position back to the actual data index
            const dataIndex = Math.floor(currentVisualPositionInCycle / pixelsPerDataPoint);
            y = waveConfig.data[dataIndex % pointsInOneCycle]; // Ensure data index wraps
        } else {
            // We are in the "spacing" part of the cycle
            y = height / 2; // Centered flat line for spacing
        }

        if (typeof y !== 'number' || isNaN(y)) {
            y = height / 2;
        }

        // Initialize lastY if it's the very first point or if we've just reset the scan
        if (typeof waveConfig.lastY === 'undefined' || waveConfig.scanX === 0) {
            // When scanX is 0, we need to correctly determine the starting Y for the new scan line.
            // This makes sure the first segment of the new scan connects correctly.
            // We need to look at the 'y' value at (width - scanSpeed) from the previous scan line.
            const prevScanX = (width - scanSpeed);
            const prevVisualPositionInCycle = (waveConfig.index + prevScanX) % totalVisualCycleLength;

            let prevY;
            if (prevVisualPositionInCycle >= 0 && prevVisualPositionInCycle < visualPulseLength) {
                const prevDataIndex = Math.floor(prevVisualPositionInCycle / pixelsPerDataPoint);
                prevY = waveConfig.data[prevDataIndex % pointsInOneCycle];
            } else {
                prevY = height / 2;
            }
            waveConfig.lastY = prevY;
        }

        ctx.moveTo(waveConfig.scanX - scanSpeed, waveConfig.lastY); // Start from previous point
        ctx.lineTo(x, y); // Draw to current point
        ctx.stroke();

        // Update lastY for the next frame
        waveConfig.lastY = y;

        // 4. Update scanX for the next frame
        waveConfig.scanX += scanSpeed;

        // 5. Reset scanX and advance waveform data if the "drawing head" hits the end
        if (waveConfig.scanX >= width) {
            waveConfig.scanX = 0; // Reset to the left

            // Advance the underlying waveform data by the width of the canvas in terms of visual pixels.
            // This ensures that the *next* scan starts drawing a segment of the waveform
            // that is 'canvas.width' pixels further along the total waveform pattern.
            waveConfig.index = (waveConfig.index + width) % totalVisualCycleLength;

            // Reset lastY to the value at the new start of the scan (x=0, with the new waveConfig.index)
            const initialVisualPositionInCycle = (waveConfig.index + 0) % totalVisualCycleLength;
            let initialY;
            if (initialVisualPositionInCycle >= 0 && initialVisualPositionInCycle < visualPulseLength) {
                const dataIndex = Math.floor(initialVisualPositionInCycle / pixelsPerDataPoint);
                initialY = waveConfig.data[dataIndex % pointsInOneCycle];
            } else {
                initialY = height / 2;
            }
            waveConfig.lastY = initialY;
        }
    },
    /**
     * Sets target vital signs for a specific scenario's monitor.
     * @param {string} scenarioId
     * @param {Object} targets - e.g., { hr: 90, spo2: 95, abpSys: 110, abpDia: 70, etco2: 40, rr: 20, temp: 37.2 }
     * @param {number} durationSeconds - How long the change should take.
     */
    // patientMonitor/patientMonitor.js
    // patientMonitor/patientMonitor.js
    setTargetVitals: function (scenarioId, targets, durations = {}) { // durations is an object
        const instance = this.instances[scenarioId];
        if (!instance || !instance.vitals) {
            console.warn(`PatientMonitor SetTargets WARN (${scenarioId}): Cannot set targets, instance or instance.vitals not found.`);
            return;
        }
        // Ensure these tracking objects exist on the instance if they somehow weren't created in init
        if (!instance.targets) instance.targets = {};
        if (!instance.durations) instance.durations = {};
        if (!instance.changeRates) instance.changeRates = {};

        console.log(`PatientMonitor SetTargets LOG (${scenarioId}): === ENTERING setTargetVitals ===`);
        console.log(`PatientMonitor SetTargets LOG (${scenarioId}): Received Targets:`, JSON.parse(JSON.stringify(targets)));
        console.log(`PatientMonitor SetTargets LOG (${scenarioId}): Received Durations:`, JSON.parse(JSON.stringify(durations)));
        console.log(`PatientMonitor SetTargets LOG (${scenarioId}): Instance.vitals BEFORE processing:`, JSON.parse(JSON.stringify(instance.vitals)));


        let somethingChangedForInstance = false;
        let longestDurationThisCall = 0;

        // Iterate through all keys in the 'targets' object received from AI/command
        for (const key in targets) {
            console.log(`PatientMonitor SetTargets LOG (${scenarioId}): Processing target key: '${key}', Value: '${targets[key]}'`);

            // Check if this 'key' from 'targets' is a recognized vital that this monitor instance manages
            if (instance.vitals.hasOwnProperty(key) || ['ecgRhythm', 'etco2Unit'].includes(key)) {
                const targetValueFromInput = targets[key];
                let parsedTargetValue;

                if (key === 'ecgRhythm' || key === 'etco2Unit') {
                    parsedTargetValue = String(targetValueFromInput);
                } else {
                    parsedTargetValue = parseFloat(targetValueFromInput);
                    if (isNaN(parsedTargetValue)) {
                        console.warn(`PatientMonitor SetTargets WARN (${scenarioId}): Invalid numeric target value for ${key}: '${targetValueFromInput}'. Skipping this target.`);
                        continue; // Skip this key
                    }
                }

                console.log(`PatientMonitor SetTargets LOG (${scenarioId}): Validated target for '${key}': ${parsedTargetValue}`);

                instance.targets[key] = parsedTargetValue; // Store the validated target on the instance

                // Get specific duration for this vital, or default, or 0
                const durationForThisKey = durations[key]; // This might be undefined
                const defaultDurationFromInput = durations.default; // This might be undefined
                let effectiveDuration = 0; // Default to instant change

                if (durationForThisKey !== undefined && !isNaN(parseFloat(durationForThisKey)) && parseFloat(durationForThisKey) >= 0) {
                    effectiveDuration = parseFloat(durationForThisKey);
                } else if (defaultDurationFromInput !== undefined && !isNaN(parseFloat(defaultDurationFromInput)) && parseFloat(defaultDurationFromInput) >= 0) {
                    effectiveDuration = parseFloat(defaultDurationFromInput);
                }
                // effectiveDuration is now set (could be 0)

                instance.durations[key] = effectiveDuration;
                if (effectiveDuration > longestDurationThisCall) longestDurationThisCall = effectiveDuration;

                if (effectiveDuration > 0 && typeof parsedTargetValue === 'number' && typeof instance.vitals[key] === 'number') {
                    instance.changeRates[key] = (parsedTargetValue - instance.vitals[key]) / effectiveDuration;
                    console.log(`PatientMonitor SetTargets LOG (${scenarioId}): Gradual change for ${key}: Current=${instance.vitals[key]}, Target=${parsedTargetValue}, Duration=${effectiveDuration}s, Rate=${instance.changeRates[key]?.toFixed(2)}/s`);
                } else { // Instant change or non-numeric vital
                    instance.vitals[key] = parsedTargetValue; // Directly set current vital in the instance
                    if (instance.changeRates) instance.changeRates[key] = 0; // Reset rate
                    instance.durations[key] = 0; // Ensure duration is also 0
                    console.log(`PatientMonitor SetTargets LOG (${scenarioId}): Instant change for ${key}: Set instance.vitals.${key} to ${parsedTargetValue}`);
                }
                somethingChangedForInstance = true;
            } else {
                console.warn(`PatientMonitor SetTargets WARN (${scenarioId}): Target key '${key}' is unknown or not present in instance.vitals. Skipping.`);
            }
        } // End for...in loop

        // ... (NBP/ABP MAP update logic as before, using instance.vitals) ...

        if (somethingChangedForInstance) {
            console.log(`PatientMonitor SetTargets LOG (${scenarioId}): Instance.vitals AFTER processing all targets:`, JSON.parse(JSON.stringify(instance.vitals)));
            // Syncing to appData and saving is handled by main.js after this function returns
            // and processAiStateUpdates calls updateCurrentScenarioVitalsToAppData & storage.saveAppData.

            if (longestDurationThisCall === 0) { // If all changes processed by this call were instant
                console.log(`PatientMonitor SetTargets LOG (${scenarioId}): All target changes were instant, forcing immediate re-render.`);
                this.renderInstance(scenarioId); // Re-render to show instant changes
            }
        }
        console.log(`PatientMonitor SetTargets LOG (${scenarioId}): === EXITING setTargetVitals ===`);
    },

    // --- Control Methods ---
    togglePauseInstance: function (scenarioId) {
        const instance = this.instances[scenarioId];
        if (instance) {
            instance.isPaused = !instance.isPaused;
            if (instance.dom.pauseResumeAllBtn) {
                instance.dom.pauseResumeAllBtn.textContent = instance.isPaused ? "Resume All" : "Pause All";
            }
            console.log(`PatientMonitor (${scenarioId}): Display ${instance.isPaused ? 'PAUSED' : 'RESUMED'}`);
            if (!instance.isPaused) this.renderInstance(scenarioId); // Re-render if resuming
        }
    },
    toggleMuteAlarms: function (scenarioId) {
        const instance = this.instances[scenarioId];
        if (instance) {
            instance.alarmsMuted = !instance.alarmsMuted;
            if (instance.dom.muteAlarmsBtn) {
                instance.dom.muteAlarmsBtn.textContent = instance.alarmsMuted ? "Unmute Alarms" : "Mute Alarms";
            }
            console.log(`PatientMonitor (${scenarioId}): Alarms ${instance.alarmsMuted ? 'MUTED' : 'UNMUTED'}`);
            // TODO: Implement actual alarm sound silencing logic
        }
    },
    calculateMap: function (sys, dia) {
        if (sys === undefined || dia === undefined) return undefined;
        return Math.round((parseFloat(dia) * 2 + parseFloat(sys)) / 3);
    },


    // Methods called by animations.js
    renderAllActiveInstances: function (allScenarioIdsToConsider) {
        allScenarioIdsToConsider.forEach(scenarioId => {
            const instance = this.instances[scenarioId];
            if (instance && instance._domFullyInitialized) {
                // The widget's root element ID for visibility check
                const widgetElement = document.getElementById(`pm-widget-${scenarioId}`);
                if (widgetElement && widgetElement.offsetParent !== null) {
                    this.renderInstance(scenarioId);
                }
            }
        });
    },


    clearOrPauseCanvas: function (canvasEl, message = "Paused") {
        if (!canvasEl) return;
        const ctx = canvasEl.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        ctx.fillStyle = "#444"; // Darker gray for paused text
        ctx.font = "bold 12px Roboto, Arial";
        ctx.textAlign = "center";
        ctx.fillText(message, canvasEl.width / 2, canvasEl.height / 2);
    },

    takeNbpReading: function (scenarioId) {
        const instance = this.instances[scenarioId];
        if (!instance || !instance.vitals) return;
        console.log(`PatientMonitor (${scenarioId}): takeNbpReading called.`);
        // Simulate taking a reading: set current NBP to target NBP instantly
        // Gemini would provide NBP_SYSTOLIC_TARGET and NBP_DIASTOLIC_TARGET with DURATION: 0
        // This function would be called by a button or by Gemini.
        // For now, let's assume Gemini sets targets, and this just updates the timestamp.
        instance.vitals.nbpSys = instance.targets.nbpSys !== undefined ? instance.targets.nbpSys : instance.vitals.nbpSys;
        instance.vitals.nbpDia = instance.targets.nbpDia !== undefined ? instance.targets.nbpDia : instance.vitals.nbpDia;
        instance.vitals.nbpMap = this.calculateMap(instance.vitals.nbpSys, instance.vitals.nbpDia);
        instance.vitals.nbpLastReadingTime = Date.now();

        // Update appData and trigger a save
        const appData = window.appShell?.getAppData();
        if (appData?.playerData.activeScenarios[scenarioId]) {
            if (!appData.playerData.activeScenarios[scenarioId].patientData) appData.playerData.activeScenarios[scenarioId].patientData = {};
            if (!appData.playerData.activeScenarios[scenarioId].patientData.vitals) appData.playerData.activeScenarios[scenarioId].patientData.vitals = {};
            appData.playerData.activeScenarios[scenarioId].patientData.vitals.nbpSys = instance.vitals.nbpSys;
            appData.playerData.activeScenarios[scenarioId].patientData.vitals.nbpDia = instance.vitals.nbpDia;
            appData.playerData.activeScenarios[scenarioId].patientData.vitals.nbpMap = instance.vitals.nbpMap;
            appData.playerData.activeScenarios[scenarioId].patientData.vitals.nbpLastReadingTime = instance.vitals.nbpLastReadingTime;
            window.appShell?.saveGameData(); // Immediate save after NBP reading
        }
        this.renderInstance(scenarioId); // Re-render to show new NBP and time
    },

    updateAllActiveLogic: function (allScenarioIdsToConsider, deltaTimeSeconds) {
        allScenarioIdsToConsider.forEach(scenarioId => {
            if (this.instances[scenarioId]) { // Check if an instance exists for this scenario
                this.updateLogicInstance(scenarioId, deltaTimeSeconds);
            }
        });
    },

    removeInstance: function (scenarioId) {
        if (this.instances[scenarioId]) {
            // Any specific cleanup for this instance's resources can go here
            // e.g., if canvases held complex objects or workers
            delete this.instances[scenarioId];
            console.log(`PatientMonitor (${scenarioId}): Instance removed.`);
        }
    }
};
window.patientMonitor = patientMonitor; // Expose as patientMonitor