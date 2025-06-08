/**
 * @fileoverview This script contains the logic for the mobile view and is executed by the 
 * client in the browser. 
 * @author Samuel König
 * @version 1.0.0
 */

/**************************************************************************
 * Initialization of variables and mobile device event listeners
 **************************************************************************/

/**
 * Definition of the variables used in the script.
 * - startY @type {number}: The y-coordinate of a touch point. 
 * - activeContainer @type {Element|null}: The DOM element to which a scroll movement refers. 
 */
let startY = 0;
let activeContainer = null;

/**
 * Adds event listeners to all mobile display-related events.
 * 
 * - The purpose of this function is to improve the view and robustness of the chatbot 
 *   interface on mobile devices. 
 * - When the visual size of the window is changed ('resize' and 'orientationchange' events, 
 *   e.g. by showing or hiding the virtual keyboard or browser bar), the new height of the 
 *   visual area of the window is calculated (using updateVh()) and the chatbot interface is 
 *   re-aligend so that it is displayed fullscreen on mobile devices (using alignChatbotUi()).
 * - The function attachNoBounceListeners() is executed to implement the desired scrolling 
 *   behaviour within the chatbot interface on mobile devices. 
 * - The function updateVh() is executed to initially get the height of the visual window
 *   area. 
 * 
 * @returns {void}
 */
function attachMobileChatbotEventListeners() {

  window.addEventListener('resize', () => {
    updateVh();
    alignChatbotUi();
  });

  window.addEventListener('orientationchange', () => {
    updateVh();
    alignChatbotUi();
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      updateVh();
      alignChatbotUi();
    });
  }

  attachNoBounceListeners();

  updateVh();
}

/**
 * Adds event listeners to scroll events within the chatbot interface.
 * 
 * - Captures every scrolling movement of the user within the chatbot interface on mobile 
 *   devices and executes the functions onTouchStart, onTouchMove and onTouchEnd to ensure 
 *   the desired scrolling behaviour of the chatbot interface on mobile devices. 
 * 
 * @returns {void}
 */
function attachNoBounceListeners() {
  const chatbotInterface = document.getElementById('chatbot-interface');
  chatbotInterface.addEventListener('touchstart', onTouchStart, { passive: false });
  chatbotInterface.addEventListener('touchmove', onTouchMove, { passive: false });
  chatbotInterface.addEventListener('touchend', onTouchEnd, { passive: false });
}

/**************************************************************************
 * Chatbot touch scroll behaviour
 **************************************************************************/

/**
 * Captures the start position of any touch movement by the user. 
 * 
 * - This function is executes when the user starts a touch move. 
 * - Tracks the y-coordinate of the first touch point.
 * - Checks whether the nearest DOM element of the first touch point is the either the 
 *   chatbot-messages-container or the userInput textarea; defines the potentialContainer 
 *   variable either as one of these elements or null otherwise. 
 * - If the potentialContainer is the userInput textarea, checks again whether the first 
 *   touch point is indeed within the boundaries of the message input field; if this is not 
 *   the case sets the potentialContainer variable to null. 
 * - Defines the activeContainer variable as the resulting value of the potentialContainer. 
 * 
 * @param {TouchEvent} e - The touch event object.
 * @returns {void}
 */
function onTouchStart(e) {
  startY = e.touches[0].clientY;

  const scrollableSelector = '.chatbot-messages-container, .input-container textarea';
  let potentialContainer = e.target.closest(scrollableSelector) || null;

  if (potentialContainer && potentialContainer.id === 'userInput') {
    const rect = potentialContainer.getBoundingClientRect();
    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    if (touchX < rect.left || touchX > rect.right || touchY < rect.top || touchY > rect.bottom) {
      potentialContainer = null;
    }
  }

  activeContainer = potentialContainer;
}

/**
 * Controls scrolling within the active container. 
 * 
 * - This function is executed when the user moves their finger across the screen. 
 * - The purpose of this function is to prevent overscrolling on mobile devices in the
 *   chatbot interface (e.g. scrolling beyond the virtual keyboard) to ensure a fullscreen
 *   chatbot view. 
 * - (a) If the start of the touch movement is outside the chatbot-messages-container and 
 *   outside the userInput textarea (so when activeContainer is null), scrolling gets 
 *   disabled. 
 * - (b) If the start of the touch movement is inside the userInput textarea, it is checked
 *   whether this input field is permitted for scrolling (this is the case when the number of 
 *   rows of the user message in the input field exceeds the maximum number of rows). 
 *   If the userInput is not permitted for scrolling (textarea.style.overflowY === "hidden"), 
 *   scrolling gets disabled. 
 * - (c) If the start of the touch movement is inside the chatbot-messages-container, it is
 *   checked whether this container is permitted for scrolling (this is the case when the 
 *   total height of this container (scrollHeight) is larger than the visible height 
 *   (cleintHeight)). If the chatbot-messages-container is not permitted for scrolling, 
 *   scrolling gets disabled. 
 * - (d) If the start of the touch move is inside the userInput textarea or the 
 *   chatbot-messages-container, scrolling is enabled. However, when the user is on top of the 
 *   scrollable area and tries to scroll further upwards, or when the user is on the botton of
 *   the scrollable area and tries to scroll further downwards, scrolling is disabled in order 
 *   to prevent the scroll move to be transferred to the parent element. 
 * 
 * @param {TouchEvent} e - The touch event object.
 * @returns {void}
 */
function onTouchMove(e) {
  // (a) Disable scrolling for non-permitted areas:
  if (!activeContainer) {
    e.preventDefault();
    return;
  }

  // (b) Check whether scrolling in the userIpnut is allowed:
  if (activeContainer.id === 'userInput') {
    const textarea = document.getElementById('userInput');
    if (textarea.style.overflowY === "hidden") {
      e.preventDefault();
      return;
    }
  }

  // (c) Check whether scrolling in the chatbot-messages-container is allowed: 
  if (activeContainer.scrollHeight <= activeContainer.clientHeight) {
    e.preventDefault();
    return;
  }

  // (d) Conditionally enable scrolling in permitted areas: 
  const scrollTop = activeContainer.scrollTop;
  const atTop = (scrollTop <= 0);
  const atBottom = (scrollTop + activeContainer.clientHeight >= activeContainer.scrollHeight);
  const currentY = e.touches[0].clientY;
  const deltaY = currentY - startY;
  if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
    e.preventDefault();
  }
}

/**
 * Resets the active container at the end of any touch movement by the user.
 * 
 * - This function is executes when the user finishes a touch move. 
 * - Resets the activeContainer variable at the end of the touch move. 
 * 
 * @param {TouchEvent} e - The touch event object.
 * @returns {void}
 */
function onTouchEnd(e) {
  activeContainer = null;
}

/**************************************************************************
 * Chatbot display adjustements
 **************************************************************************/

/**
 * Updates the visual height (vh) value. 
 * 
 * - The purpose of this function is to update the height of the visible area for the css 
 *   specifications each time this value changes, so that the height of the chatbot interface 
 *   can be dynamically adjusted to the available space. 
 * - Determines the height of the visible area in the browser window. 
 * - Sets the css --vh property to the corresponding height. 
 * 
 * @returns {void}
 */
function updateVh() {
  if (window.visualViewport) {
    const vh = window.visualViewport.height * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  } else {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  }
}

/**
 * Ensures that the chatbot interface is displayed correctly after visual height changes. 
 * 
 * - (a) Standard behaviour: Sets a timeout of 100 milliseconds after a visual height change 
 *   (to ensure that all layout changes are finished), and then initiates an automatic scroll 
 *   to the top of the page and scrolls to the bottom of the message container. 
 * - (b) Fallback: If the chatbot interface is still not aligned on top of the visible area,
 *   the offset is determined and added as an additional margin via the css specification 
 *   translateY to the chatbot-interface and the progress-bar. Additionally, it is scrolled 
 *   to the bottom of the message container. When the chatbot interface is closed, this 
 *   additional margin is resetted to 0. For this operations, the requestAnimationFrame 
 *   function and a timeout are used to ensure that all prior layout changes have been 
 *   finished. 
 * - This function is designed to catch default browser behaviours which are undesired in 
 *   this use case (especially the behaviour of safari and firefox to move a focused textare
 *   element to the center of the visible area). 
 * 
 * @returns {void}
 */
function alignChatbotUi() {
  if (window.visualViewport) {
    const page = parseInt(sessionStorage.getItem('currentPage'), 10);
    const chatbotInterface = document.getElementById('chatbot-interface');
    const progressBar = document.getElementById('progress-bar');

    // (a) Standard behaviour: Scroll to the top of the page:
    if (page === chatbotPage) {
      setTimeout(() => {
        window.scrollTo({
          top: 0
        });
        scrollMessagesToBottom();
      }, 100)
    }

    // (b) Fallback: Set an artificial margin: 
    if (page >= (chatbotPage - 1) && page <= (chatbotPage + 1)) {
      window.requestAnimationFrame(() => {
        setTimeout(() => {
          const offset = window.visualViewport.offsetTop;
          chatbotInterface.style.transform = `translateY(${offset}px)`;
          scrollMessagesToBottom();
        }, 100)
      })
    } else {
      window.requestAnimationFrame(() => {
        setTimeout(() => {
          chatbotInterface.style.transform = `translateY(0px)`;
      }, 100)
      })
    }

  }
}

/**
 * Automatically scrolls to the bottom when the chatbot interface is opened. 
 * 
 * - This function is executed when the chatbot interface is opened in order to trigger a
 *   re-calculation of the height of the visible area. 
 * - After that, the new height of the visible area is determined using the updateVh()
 *   function. 
 * 
 * @returns {void}
 */
function mobileChatbotActivation() {
  window.scrollTo({
    top: document.body.scrollHeight,
    behavior: 'smooth' 
  });
  updateVh();
}
