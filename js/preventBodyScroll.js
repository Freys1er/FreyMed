// js/preventBodyScroll.js

document.addEventListener('DOMContentLoaded', () => {
    const mainContentArea = document.getElementById('main-content-area');
    const mainHeader = document.getElementById('main-header');
    const inputArea = document.getElementById('input-area');
    const gameInterface = document.getElementById('game-interface');
    const playerCommandInput = document.getElementById('player-command-input');

    // Initial call to hideInputArea if you want it hidden by default in JS too,
    // though the 'hidden' class in HTML is the primary way.
    // This is useful if main.js showInputArea/hideInputArea are the sole controllers.
    // If main.js hideInputArea isn't called initially, this ensures adjustMainContentHeight
    // runs with the footer hidden.
    if (inputArea && inputArea.classList.contains('hidden')) {
         // No need to call adjustMainContentHeight here explicitly if it's called by DOMContentLoaded listener below
    }


    // This function will be globally available if this script is loaded.
    // If main.js needs to call it, and preventBodyScroll.js is loaded after main.js,
    // you might need to expose it on `window` or pass it as a callback.
    // For now, assume it's available or main.js's show/hide will call it.
    window.adjustMainContentHeight = function() {
        if (!gameInterface || !mainHeader || !mainContentArea) {
            console.warn("adjustMainContentHeight: Essential layout elements not found.");
            return;
        }

        let visualHeight = window.innerHeight; // Fallback to innerHeight (layout viewport)
        let topOffset = 0;

        if (window.visualViewport) {
            visualHeight = window.visualViewport.height;
            topOffset = window.visualViewport.offsetTop; // How much the viewport is offset from the top
            // console.log("VisualViewport - Height:", visualHeight, "OffsetTop:", topOffset);
        } else {
            // console.log("Window InnerHeight:", visualHeight);
        }

        // The #game-interface should fill the available visual space.
        // Its children (header, main-content, footer) will be laid out by flexbox.
        gameInterface.style.height = `${visualHeight}px`;

        // Handle potential top offset (e.g., due to on-screen keyboard pushing content up on mobile)
        // On desktop, topOffset is usually 0.
        // If topOffset > 0, it means the visual viewport has shrunk from the top.
        // We might not need to manually transform if the body/html are already 100% and overflow hidden.
        // The browser itself handles the "scrolling" of the layout viewport into the visual viewport.
        // Our goal is to make sure our fixed-height elements (header/footer) are still visible
        // and main-content-area takes the rest.
        // The flexbox layout within #game-interface should handle this distribution.
        // So, transform might not be needed here and could cause issues on desktop.
        // gameInterface.style.transform = `translateY(${topOffset}px)`; // Re-evaluate if this is needed.

        // NO LONGER MANUALLY SETTING #main-content-area height.
        // Flexbox (`flex-grow: 1` on #main-content-area and `flex-shrink: 0` on header/footer)
        // within the now correctly sized #game-interface will handle the distribution of space.
        // #main-content-area will automatically get the height:
        //   gameInterface.height - mainHeader.height - inputArea.height (if visible)

        console.log(`Adjusted: gameInterface.height = ${gameInterface.style.height}`);
    };

    // Initial adjustment on load
    window.adjustMainContentHeight();

    // Re-adjust on viewport changes (resize of window OR virtual keyboard)
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', window.adjustMainContentHeight);
        // scroll on visualViewport might be too noisy and not always what you want for this adjustment.
        // window.visualViewport.addEventListener('scroll', window.adjustMainContentHeight);
    }
    window.addEventListener('resize', window.adjustMainContentHeight); // For desktop window resize, orientation changes

    // --- Body Scroll Prevention & Keyboard Focus Logic (from your previous version) ---
    const nonBodyScrollingElements = [];
    if (mainHeader) nonBodyScrollingElements.push(mainHeader);
    if (inputArea) nonBodyScrollingElements.push(inputArea); // Only if it's not meant to be scrolled itself
    if (gameInterface) nonBodyScrollingElements.push(gameInterface); // To prevent scroll on empty areas

    function preventScroll(e) {
        if (mainContentArea && !mainContentArea.contains(e.target)) {
            let currentElement = e.target;
            let allowScroll = false;
            // Allow scrolling for elements with explicit overflow-y: auto or scroll, like #global-tab-bar
            while (currentElement && currentElement !== document.body) {
                const style = window.getComputedStyle(currentElement);
                if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                    // Check if element is actually scrollable (has content exceeding its height)
                    if (currentElement.scrollHeight > currentElement.clientHeight) {
                        allowScroll = true;
                        break;
                    }
                }
                currentElement = currentElement.parentElement;
            }
            if (!allowScroll) {
                e.preventDefault();
            }
        }
    }
    nonBodyScrollingElements.forEach(element => {
        element.addEventListener('touchmove', preventScroll, { passive: false });
    });

    // Defensive CSS should primarily be in CSS files (base.css)
    // document.documentElement.style.height = '100%';
    // document.body.style.height = '100%';
    // document.documentElement.style.overflow = 'hidden';
    // document.body.style.overflow = 'hidden';

    if (playerCommandInput) {
        playerCommandInput.addEventListener('focus', () => {
            // When keyboard appears, visualViewport resize should trigger adjustMainContentHeight.
            // We also want to scroll the content to the bottom so the input isn't obscured.
            setTimeout(() => {
                // It's possible adjustMainContentHeight hasn't finished its effect from the resize event yet.
                // Re-ensure #game-interface is at the top of the visual viewport if offset by keyboard.
                if (window.visualViewport && window.visualViewport.offsetTop > 0 && gameInterface) {
                    // This might fight with the browser's own handling. Test carefully.
                    // gameInterface.style.transform = `translateY(${window.visualViewport.offsetTop}px)`;
                }
                if (mainContentArea) {
                    mainContentArea.scrollTop = mainContentArea.scrollHeight;
                }
                // Optional: scroll input into view as well if it's part of a scrollable container (not the case here)
                // playerCommandInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 300); // Delay to allow keyboard to fully appear and viewport to resize
        });

        playerCommandInput.addEventListener('blur', () => {
            // When keyboard hides, visualViewport resize should trigger adjustMainContentHeight again.
            // Optional: Reset transform if it was used
            // if (gameInterface) gameInterface.style.transform = 'translateY(0px)';
        });
    }
});