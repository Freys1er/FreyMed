// js/audioManager.js
const audioManager = {
    beepSounds: [], // Array to hold all beep sound Audio objects
    isBeepLoaded: false, // Flag to indicate if all sounds are loaded
    loadedCount: 0,      // Counter for successfully loaded sounds
    totalSounds: 7,      // Total number of sounds (0 to 6 inclusive)
    audioContext: null,  // For more advanced audio if needed, not strictly for simple beep

    init: function () {
        try {
            // Try to create AudioContext for future-proofing and overcoming autoplay restrictions
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log("AudioManager: AudioContext initialized.");
        } catch (e) {
            console.warn("AudioManager: Web Audio API is not supported in this browser.", e);
        }

        this.beepSounds = [];
        this.loadedCount = 0;
        this.isBeepLoaded = false;

        // Load sounds from 0 to 6 (inclusive)
        for (let i = 0; i < this.totalSounds; i++) {
            const audioPath = `assets/sounds/monitor_beep_single_${i}.wav`;
            const beepSound = new Audio(audioPath);
            beepSound.preload = 'auto'; // Preload the sound for better performance

            // Event listener for when the audio can play through
            beepSound.oncanplaythrough = () => {
                this.loadedCount++;
                console.log(`AudioManager: Sound ${i} loaded. Loaded count: ${this.loadedCount}/${this.totalSounds}`);
                if (this.loadedCount === this.totalSounds) {
                    this.isBeepLoaded = true;
                    console.log("AudioManager: All beep sounds loaded.");
                }
            };

            // Event listener for errors during loading
            beepSound.onerror = (e) => {
                console.error(`AudioManager: Error loading beep sound ${i} from ${audioPath}.`, e);
                // Even if one fails, we still try to load others.
                // You might want to handle this more robustly, e.g., mark specific sound as failed.
            };

            // Attempt to load the sound
            beepSound.load();
            this.beepSounds.push(beepSound);
        }
    },

    /**
     * Plays a specific beep sound based on the tone.
     * Handles user interaction requirement for audio playback.
     * @param {number} tone - The tone level (0 for low, 6 for high). Defaults to 6.
     */
    playBeep: function (tone = 6) {
        // Ensure tone is within the valid range [0, 6]
        const selectedTone = Math.max(0, Math.min(6, tone));

        // Get the specific beep sound to play
        const beepSoundToPlay = this.beepSounds[selectedTone];

        if (!beepSoundToPlay) {
            console.warn(`AudioManager: No sound found for tone ${selectedTone}.`);
            return;
        }

        // Resume AudioContext if it was suspended (common browser policy)
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume().then(() => {
                console.log("AudioManager: AudioContext resumed on user interaction.");
                this._doPlayBeep(beepSoundToPlay);
            }).catch(error => {
                console.error("AudioManager: Failed to resume AudioContext.", error);
            });
        } else {
            this._doPlayBeep(beepSoundToPlay);
        }
    },

    /**
     * Internal function to handle the actual playing of a beep sound.
     * @param {HTMLAudioElement} beepSound - The Audio object to play.
     */
    _doPlayBeep: function (beepSound) {
        // Check if all sounds are loaded before attempting to play
        if (this.isBeepLoaded && beepSound) {
            beepSound.currentTime = 0; // Rewind to start if playing again quickly
            beepSound.play().catch(error => {
                // Autoplay policies might prevent playback until user interacts with the page.
                // This is a common and expected error if no prior user interaction occurred.
                console.warn("AudioManager: Beep playback failed, possibly due to autoplay policy or other error.", error);
            });
        } else if (!this.isBeepLoaded) {
            console.warn("AudioManager: All beep sounds not loaded yet. Cannot play.");
        }
    }
};

// Initialize audio manager when the script loads.
// User interaction might be needed later to fully enable audio.
// It's recommended to call audioManager.init() from your main application script
// after the DOM is fully loaded, e.g., in a DOMContentLoaded listener.
window.audioManager = audioManager;
