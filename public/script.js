/**
 * @fileoverview This script contains the logic of the survey webpage and is executed by the 
 * client in the browser. 
 * @author Samuel König
 * @version 1.0.0
 */

/**************************************************************************
 * Definition of variables
 **************************************************************************/

/**
 * Definition of the variables used in the script.
 * 
 * - totalPages @type {number}: the number of pages in the survey.
 * - chatbotPage @type {number}: the page number where the chatbot appears.
 * - emailCollection @type {boolean}: Whether users have the possibility to submit an email 
 *   at the end of the survey. 
 * - textareaReplacement @type {boolean}: Whether the user message input field should be 
 *   replaced by a button to move to the next page when the final dialogue state has been 
 *   reached. 
 * - pages @type {NodeListOf<HTMLElement>}: DOM element.
 * - progressBar @type {HTMLElement}: DOM element.
 * - consentCheckbox @type {HTMLInputElement}: DOM element.
 * - next1 @type {HTMLButtonElement}: DOM element.
 * - currentPage @type {number}: the number of the current page.
 * - historyStates @type {Array<{page: number}>}: an array which stores the state history 
 *   of the webpage to artificially replicate the browser history.
 * - scrollPositions @type {Object.<string, number>}: A dictionary which stores the last 
 *   scroll positions on each page.
 * - scrollFrame1Id @type {number}: The id of the first animation frame used to queue the 
 *   automated scrolling process until a new page has been fully rendered. 
 * - scrollFrame2Id @type {number}: The id of the second animation frame used to queue the 
 *   automated scrolling process until a new page has been fully rendered. 
 * - bypassPopState @type {boolean}: a flag for controlling navigation events. 
 * - dialogueFinished @type {boolean}: a flag indicating whether the final dialgoue state 
 *   has been reached.
 *   on the final page. 
 */
const totalPages = 1;    // To be specified: the actual number of pages in the survey!
const chatbotPage = 1;   // To be specified: the page number where the chatbot appears!
const textareaReplacement = false  //To be specified: Whether the textarea should be replaced!

let pages;
let progressBar;
let consentCheckbox;
let next1;

let currentPage = 1;
let historyStates = [];
let scrollPositions = {};
let scrollFrame1Id = null;
let scrollFrame2Id = null;
let bypassPopState = false;
let dialogueFinished = sessionStorage.getItem('dialogueFinished') === 'true';

/**************************************************************************
 * Initialization of page elements and event listeners
 **************************************************************************/

/**
 * Event Listener for initializing the page.
 * Executes the initializePage() function as soon as the DOM has been fully loaded.
 */
document.addEventListener('DOMContentLoaded', initializePage);

/**
 * Initializes the page.
 * This function is executed as soon as the DOM has been fully loaded.
 * 
 * - References important DOM elements.
 * - Initializes metadata (participantId and treatmentGroup).
 * - Restores previously saved data.
 * - Adds an initial state to the browser history.
 * - Displays the current page.
 * - Attaches all event listeners.
 * - Releases the event "surveyDataInitialized" to trigger the chatbot interface 
 *   initialization in chatbot.js.
 * 
 * @returns {void}
 */
async function initializePage() {
    referenceElements();
    await getMetadata();

    restoreState();
    initializeHistory(currentPage);

    showPage(currentPage);
    attachEventListeners();

    document.dispatchEvent(new Event('surveyDataInitialized'));
}

/**
 * References important DOM elements.
 * 
 * @returns {void}
 */
function referenceElements() {
    pages = document.querySelectorAll('.page');

}

/**
 * Adds event listeners to all relevant survey DOM elements (buttons and inputs).
 *
 * - Logic for saving the page scroll position when the user reloads the page. 
 * - Logic for the popstate event caused by the browser when the user uses the navigation 
 *   buttons of the browser. 
 * 
 * @returns {void}
 */
function attachEventListeners() {

    window.addEventListener('beforeunload', () => {
        saveScrollPositions(currentPage)
    });

    window.addEventListener('popstate', handlePopState);
}

/**************************************************************************
 * Page display and progress bar
 **************************************************************************/

/**
 * Switches to the specified page and updates the displayed content.
 * 
 * - Hides all pages and only shows the active page.
 * - When the user navigates to the chatbot page or back from the chatbot page, executes the 
 *   applyChatbotViewState() function to display the correct view. 
 * - Scrolls to the saved scroll position of the active page, using animation frames to ensure the 
 *   new page has been fully rendered when the scroll action is performed (at the beginning of the 
 *   function, cancelScrollDelays() is called to clear potentially queued animation frames).
 * 
 * @param {number} pageNumber - The number of the page to be displayed.
 * @returns {void}
 */
function showPage(pageNumber) {
    cancelScrollDelays();

    pages.forEach(page => page.classList.remove('active'));
    document.getElementById(`page${pageNumber}`).classList.add('active');

    if (pageNumber >= (chatbotPage - 1) && pageNumber <= (chatbotPage + 1)) {
        applyChatbotViewState();
    }

    if (!(pageNumber === chatbotPage)) {
        const pageElement = document.getElementById(`page${pageNumber}`);
        scrollPos = scrollPositions[pageNumber];
        console.log(`ScrollPosition: ${scrollPos}`); // Nur zum Testen
        if (scrollPos !== undefined) {
            scrollFrame1Id = requestAnimationFrame(() => {
                const dummy = pageElement.offsetHeight;
                scrollFrame2Id = requestAnimationFrame(() => {
                    setTimeout(() => {
                        window.scrollTo({ top: scrollPos, behavior: 'smooth' });
                    }, 50)
                });
            });
        } else {
            window.scrollTo(0, 0);
        }
    }
}

/**
 * Clears all queued animation frames.
 * 
 * - This function is called at the beginning of the showPage(pageNmber) function in order to clear 
 *   all old queued animation frames.
 * 
 * @returns {void}
 */
function cancelScrollDelays() {
    if (scrollFrame1Id !== null) {
      cancelAnimationFrame(scrollFrame1Id);
      scrollFrame1Id = null;
    }
    if (scrollFrame2Id !== null) {
      cancelAnimationFrame(scrollFrame2Id);
      scrollFrame2Id = null;
    }
}

/**************************************************************************
 * Chatbot page
 **************************************************************************/

/**
 * Adjusts the visibility of the chatbot interface.
 * 
 * - Switches between (a) the survey view and (b) the chatbot interface view by 
 *   manipulating the relevant css specifications. 
 * - Displays the correct view based on the currentPage value.
 * - When opening the chatbot interface, calls the mobileChatbotActivation() function to 
 *   ensure that the chatbot is correctly displayed on mobile devices.
 * - If the chatbot interface gets opened, triggers the event "chatbotInterfaceOpened".
 * 
 * @returns {void}
 */
function applyChatbotViewState() {
    const documentBody = document.body;
    const chatbotInterface = document.getElementById('chatbot-interface');
    const surveyContainer = document.getElementById('survey-container');
    const pageContainers = document.getElementsByClassName('page');

    if (!chatbotInterface|| !surveyContainer) return; 

    // (b) Chatbot interface view:
    if (currentPage === chatbotPage) {
        chatbotInterface.classList.remove('chatbot-hidden');
        chatbotInterface.classList.add('chatbot-visible');
        surveyContainer.classList.add('chatbot-visible');
        pageContainers[chatbotPage - 1].classList.add('chatbot-visible');

        setTimeout(() => {
            mobileChatbotActivation()
            surveyContainer.classList.add('chatbot-visible-locked');
            pageContainers[chatbotPage - 1].classList.add('chatbot-visible-locked');
            documentBody.classList.add('chatbot-visible');
        }, 100);

        document.dispatchEvent(new Event('chatbotInterfaceOpened'));
    
    // (a) Survey view:
    } else {
        documentBody.classList.remove('chatbot-visible');
        chatbotInterface.classList.remove('chatbot-visible');
        chatbotInterface.classList.add('chatbot-hidden');
        surveyContainer.classList.remove('chatbot-visible');
        surveyContainer.classList.remove('chatbot-visible-locked');
        pageContainers[chatbotPage - 1].classList.remove('chatbot-visible');
        pageContainers[chatbotPage - 1].classList.remove('chatbot-visible-locked');
    }
}

/**
 * Processes the dialogueFinishedEvent.
 * 
 * - This function is applied when the client receives the finalState = true value from
 *   the chatbot api metadata, meaning the the chatbot has reached the final dialogue 
 *   state. 
 * - Sets the dialogueFinished value to true, stores it in the session storage and calls
 *   the setFinishedDialogueState function to replace the input message text area and 
 *   the send button by the finishedDialogueBtn. 
 * 
 * @returns {void}
 */
function handleFinishedDialogue(){ 
    dialogueFinished = true;
    sessionStorage.setItem('dialogueFinished', dialogueFinished);
    setFinishedDialogueState();
}

/**************************************************************************
 * Data and metadata management
 **************************************************************************/

/**
 * Loads the metadata (participantId and treatmentGroup).
 * 
 * - This function is called as soon as the DOM is fully loaded.
 * - Requests the metadata from the server when the page is loaded for the 
 *   first time, otherwise the metadata is retrieved from the session storage. 
 * - If the client cannot receive a treatmentGroup value from the server, it
 *   creates a random treatmentGroup value itself. 
 * 
 * @async
 * @returns {void}
 */
async function getMetadata() {
    let surveyData = {};
    if (!sessionStorage.getItem('participantId') || !sessionStorage.getItem('treatmentGroup')) {
        surveyData = await fetchMetadataFromServer();
    }
    const participantId = sessionStorage.getItem('participantId') || surveyData.participantId;
    let treatmentGroup = sessionStorage.getItem('treatmentGroup') || surveyData.treatmentGroup;
    treatmentGroup = Number(treatmentGroup);

    if (!((treatmentGroup === 0) || (treatmentGroup === 1))) {
        treatmentGroup = 1
    }
    
    sessionStorage.setItem('participantId', participantId);
    sessionStorage.setItem('treatmentGroup', treatmentGroup);
}

/**
 * Requests the metadata from the server (participantId and treatmentGroup).
 * 
 * @async
 * @returns {{participantId: string, treatmentGroup: string}} The metadata.
 */
async function fetchMetadataFromServer() {
    const response = await fetch('/generateSurveyData');
    const json = await response.json();
    return {
        participantId: json.participantId,
        treatmentGroup: json.treatmentGroup
    };
}

/**************************************************************************
 * State management
 **************************************************************************/

/**
 * Saves the current navigation state of the survey webpage.
 * 
 * - Saves the currentPage value and the historyStates value in the session storage.
 * - This function is called each time the participant navigates within the single 
 *   page application. 
 * 
 * @returns {void}
 */
function saveNavigationState() {
    sessionStorage.setItem('currentPage', currentPage);
    sessionStorage.setItem('historyStates', JSON.stringify(historyStates));
}

/**
 * Saves the scroll position of a page.
 * 
 * - Determines the current scroll position and saves it as value for the specified page in 
 *   the scrollPositions object.
 * - Saves the updated scrollPositions object in the session storage. 
 * - Excludes the view where the chatbot interface is opened from the procedure. 
 * 
 * @param {number} pageNumber - The page number for which the scroll posotion should be saved. 
 * @returns {void}
 */
function saveScrollPositions(pageNumber) {
    const scrollY = window.scrollY;
    if (!(currentPage === chatbotPage)) {
        scrollPositions[pageNumber] = scrollY;
        sessionStorage.setItem('scrollPositions', JSON.stringify(scrollPositions));
    }
}

/**
 * Sets the view of the bottom in the chatbot interface.
 * 
 * - Switches the view on the bottom area of the chatbot interface between the view 
 *   showing the input message text area and the send button and the view showing the 
 *   finishedDialogueBtn. 
 * - The view to display is determined based on the value of the dialogueFInished variable. 
 * - If the variable textareaReplacement is set to false, the user message input field is not
 *   replaced by the finishedDialogueButton even when the final dialogue state has been 
 *   reached. 
 * 
 * @returns {void}
 */
function setFinishedDialogueState() { 
    const inputContainer = document.getElementById('input-container');
    const finishedDialogueButton = document.getElementById('finished-dialogue-container');
    if (!textareaReplacement) {
        finishedDialogueButton.classList.add('hidden');
        inputContainer.classList.remove('hidden');
        return;
    }
    if (!dialogueFinished) {
        finishedDialogueButton.classList.add('hidden');
        inputContainer.classList.remove('hidden');
    }
    else {
        inputContainer.classList.add('hidden');
        finishedDialogueButton.classList.remove('hidden');
    }
}

/**
 * Restores the saved state from the session storage.
 * 
 * - The purpose of this function is to retain state of the page if the page 
 *   is accidentally reloaded.
 * - This function is called as soon as the DOM is fully loaded. 
 * - Retrieves the currentPage value, the historyStates value, the scrollPositions value
 *   in the session storage.
 * - Restores the view of the bottom area in the chatbot interface by calling the 
 *   setFinishedDialogueState() function. 
 * 
 * @returns {void}
 */
function restoreState() {
    const savedPage = sessionStorage.getItem('currentPage');
    if (savedPage) {
        currentPage = parseInt(savedPage, 10);
    }
    
    const savedHistoryStates = sessionStorage.getItem('historyStates');
    if (savedHistoryStates) {
        historyStates = JSON.parse(savedHistoryStates);
    }

    const savedScrollPositions = sessionStorage.getItem('scrollPositions');
    if (savedScrollPositions) {
        scrollPositions = JSON.parse(savedScrollPositions);
    }

    setFinishedDialogueState()
}

/**************************************************************************
 * Navigation and history management
 **************************************************************************/

/**
 * Initializes the current browser history state.
 * 
 * - This function is called at the beginning when the page is initially loaded or when 
 *   it is reloaded.
 * - A state with the corresponding page is attached to the automatically generated entry
 *   in the browser history when the page is loaded or reloaded. 
 * - If the current page is not part of the historyStates array, this page is added to the 
 *   historyStates array (this should only be the case when the page is initially loaded 
 *   and not when the page is reloaded).
 * - Saves the new webpage state in the session storage using saveNavigationState().
 * 
 * @param {number} page - The page to be attached to the browser history.
 * @returns {void}
 */
function initializeHistory(page) {
    const stateObj = { page: page };
    if (!historyStates.some(obj => obj.page === currentPage)) historyStates.push(stateObj);
    window.history.replaceState(stateObj, "", "");
    saveNavigationState();
}

/**
 * Adds a new state with the specified page number to the browser history.
 * 
 * - This function is called each time the user accessses a new survey page for the first time. 
 *   In this case, this new page is added as a new state to the browser history and the internal
 *   historyStates array. 
 * - Saves the new webpage state in the session storage using saveNavigationState().
 * 
 * @param {number} page - The page to be added to the browser history.
 * @returns {void}
 */
function pushPageToHistory(page) {
    const stateObj = { page: page };
    historyStates.push(stateObj);
    window.history.pushState(stateObj, "", "");
    saveNavigationState();
}

/**
 * Manages the navigation via the navigation buttons of the browser.
 * 
 * - The popstate event is fired automatically by the browser each time the user uses the back 
 *   or forward navigation button of the browser, or if you manually jump forwards or backwards 
 *   in the browser history in the javascript file. In this case, the popstate event listener calls
 *   this function. 
 * - (a) If the user navigates back or forward within the survey webpage using the navigation buttons
 *   of the browser, this function saves the current scroll position, synchronizes the currentPage 
 *   value, displays the corresponding survey page using showPage(currentPage) and saves the new state 
 *   using saveNavigationState().
 * - (b) This function additionally prevents the possibility to move forward in the survey via the 
 *   navigation button of the browser when the user is on page 1 and has not activated the consent 
 *   checkbox. 
 * - (c) When the participant has submitted the survey, is on the final page ("thankyou" page) and 
 *   presses the back button of the browser, the popstate event listener is destroyed so that the 
 *   currentPage value is not decremented and the webpage stil displays the "thankyou" page.
 * - (d) If the bypassPopState flag is set to true, a pre-check prevents this function to be executed.
 * 
 * @param {PopStateEvent} event - The event triggered by pressing the navigation button of the browser.
 * @returns {void}
 */
function handlePopState(event) {

    // (d) Prevent execution of the function if bypassPopState flag is set to true: 
    if (bypassPopState) {
        bypassPopState = false;
        return;
    }

    // (b) Behaviour when the user is on page one and has not activated the consent checkbox:
    const consentIsChecked = consentCheckbox.checked; 
    if (currentPage === 1 && event.state.page === 2 && !consentIsChecked) {
        bypassPopState = true;
        window.history.back();
        return;
    }

    // (c) Behaviour when the user is on the final page:
    if (currentPage === totalPages) {
        window.removeEventListener('popstate', handlePopState);
        window.history.back();
        return;
    }

    // (a) Default behaviour:
    if (event.state.page < currentPage) {
        saveScrollPositions(currentPage);
        currentPage--;
    } else {
        saveScrollPositions(currentPage);
        currentPage++;
    }
    
    showPage(currentPage);
    saveNavigationState();
}
