// js/preventBodyScroll.js (or integrated into your main.js)

document.addEventListener('DOMContentLoaded', () => {
    const mainContentArea = document.getElementById('main-content-area'); // The ONLY element that should scroll
    const mainHeader = document.getElementById('main-header'); // Your fixed header
    const inputArea = document.getElementById('input-area');   // Your fixed footer/input area
    const gameInterface = document.getElementById('game-interface'); // Your primary app wrapper

    hideInputArea();

    // --- Core Logic for Preventing Body Scroll ---

    // Array of elements that should NOT trigger body scrolling when dragged
    // Ensure these elements exist before adding listeners.
    const nonBodyScrollingElements = [];

    if (mainHeader) nonBodyScrollingElements.push(mainHeader);
    if (inputArea) nonBodyScrollingElements.push(inputArea);

    // Also consider adding the main game interface wrapper itself,
    // as a drag on any *empty space* within it (that's not header/footer/main-content)
    // could still trigger body scroll.
    if (gameInterface) nonBodyScrollingElements.push(gameInterface);


    // This function will prevent the default touchmove behavior
    function preventScroll(e) {
        // We only want to prevent default if the target of the touchmove
        // is NOT within the mainContentArea.
        // This allows scrolling *inside* mainContentArea, but not outside it.
        if (mainContentArea && !mainContentArea.contains(e.target)) {
            // Also, double-check if the scrollbar itself is being dragged (unlikely with touch)
            // or if it's explicitly an element that should never scroll.
            e.preventDefault();
        }
    }

    // Attach the event listener to all identified non-scrolling elements
    // { passive: false } is absolutely essential for preventDefault() to work.
    nonBodyScrollingElements.forEach(element => {
        element.addEventListener('touchmove', preventScroll, { passive: false });
    });

    // You can also add it to the body itself as a last resort if you still see issues
    // document.body.addEventListener('touchmove', preventScroll, { passive: false });
    // This is more aggressive and might sometimes interfere with other things,
    // so try the element-specific listeners first.


    // --- Defensive CSS Enforcement (Less Critical if CSS is correct, but good for robustness) ---
    // These should already be in your style.css at the top, but JS can re-apply them.
    document.documentElement.style.height = '100%';
    document.body.style.height = '100%';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overflowX = 'hidden'; // Explicitly prevent horizontal on html
    document.body.style.overflowX = 'hidden';           // Explicitly prevent horizontal on body


    // --- Keyboard Squishing Logic (from previous discussions - ensure it's still here) ---
    const playerCommandInput = document.getElementById('player-command-input');

    function adjustMainContentHeight() {
        if (window.visualViewport && mainContentArea) {
            const visualHeight = window.visualViewport.height;
            const headerHeight = mainHeader ? mainHeader.offsetHeight : 0;
            const inputAreaHeight = inputArea && inputArea.offsetParent !== null && !inputArea.classList.contains('hidden') ? inputArea.offsetHeight : 0;

            const desiredMainHeight = visualHeight - headerHeight - inputAreaHeight;

            mainContentArea.style.minHeight = `${desiredMainHeight}px`;
            mainContentArea.style.maxHeight = `${desiredMainHeight}px`;
            mainContentArea.style.height = `${desiredMainHeight}px`;
        } else if (mainContentArea) {
            mainContentArea.style.height = 'auto'; // Fallback
        }
    }

    // Initial adjustment
    adjustMainContentHeight();

    // Re-adjust on viewport changes
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', adjustMainContentHeight);
        window.visualViewport.addEventListener('scroll', adjustMainContentHeight);
    }
    window.addEventListener('resize', adjustMainContentHeight); // For orientation changes etc.

    // Auto-scroll to bottom of main content area when keyboard appears
    if (playerCommandInput) {
        playerCommandInput.addEventListener('focus', () => {
            setTimeout(() => {
                if (mainContentArea) {
                    mainContentArea.scrollTop = mainContentArea.scrollHeight;
                }
            }, 300);
        });
    }
});