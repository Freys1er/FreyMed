// js/audioManager.js
const audioManager = {
    beepSound: null,
    isBeepLoaded: false,
    audioContext: null, // For more advanced audio if needed, not strictly for simple beep

    init: function() {
        try {
            // Try to create AudioContext for future-proofing and overcoming autoplay restrictions
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log("AudioManager: AudioContext initialized.");
        } catch (e) {
            console.warn("AudioManager: Web Audio API is not supported in this browser.", e);
        }

        this.beepSound = new Audio('assets/sounds/monitor_beep_single.wav'); // Path to your beep sound
        this.beepSound.oncanplaythrough = () => {
            this.isBeepLoaded = true;
        };
        this.beepSound.onerror = () => {
            console.error("AudioManager: Error loading beep sound.");
            this.isBeepLoaded = false;
        };
        // Preload attempt - might be restricted by browser policies until user interaction
        this.beepSound.load();
    },

    /**
     * Plays the beep sound.
     * Handles user interaction requirement for audio playback.
     */
    playBeep: function() {
        // Resume AudioContext if it was suspended (common browser policy)
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume().then(() => {
                console.log("AudioManager: AudioContext resumed on user interaction.");
                this._doPlayBeep();
            });
        } else {
            this._doPlayBeep();
        }
    },

    _doPlayBeep: function() {
        if (this.isBeepLoaded && this.beepSound) {
            this.beepSound.currentTime = 0; // Rewind to start if playing again quickly
            this.beepSound.play().catch(error => {
                // Autoplay policies might prevent playback until user interacts with the page.
                // console.warn("AudioManager: Beep playback failed, possibly due to autoplay policy.", error);
            });
        } else if (!this.isBeepLoaded) {
            // console.warn("AudioManager: Beep sound not loaded yet.");
        }
    }
};

// Initialize audio manager when the script loads.
// User interaction might be needed later to fully enable audio.
// audioManager.init(); // Let main.js call this after DOMContentLoaded
window.audioManager = audioManager;