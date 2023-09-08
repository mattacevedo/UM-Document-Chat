// DOM elements
const chatContainer = document.getElementById("chat-container");
const chatInputForm = document.getElementById("chat-input-form");
const userInput = document.getElementById("user-input");
const submitButton = document.getElementById("submit-button");

// global variables
let transcript;
let chatbotResponse;
const contextLimit = 4000; // you can use 30000 if using 32k context model


// clear Marked warnings
marked.use({
  headerIds: false,
  mangle: false,
});

// startup items
window.onload = async function () {

  // clear transcript from localstorage
  localStorage.clear();

  // hide the user input until ready to load
  userInput.style.display = "none";
  submitButton.style.display = "none";
  event.preventDefault();

  // create the transcript
  getTranscript();

  // send initial message to the browser
  const chatMessages = await getChatMessages();
  await printMessage(chatMessages.initialMessage);

  // once the initial message is printed, show the user input field
  enableInput();
};

// enable button and input
function enableInput() {
  userInput.disabled = false;
  submitButton.disabled = false;
  userInput.style.display = "";
  submitButton.style.display = "";
  userInput.focus();
}

// disable button and input
function disableInput() {
  userInput.disabled = true;
  submitButton.disabled = true;
}

// get transcript from LocalStorage if it exists
async function getTranscript() {
  if (localStorage.getItem("transcript")) {
    transcript = JSON.parse(localStorage.getItem("transcript"));
  } else {
    const chatMessages = await getChatMessages();
    transcript = [
      {
        role: "system",
        content: chatMessages.systemMessage,
      },
      {
        role: "assistant",
        content: chatMessages.initialMessage,
      },
    ];
  }
}

// when user submits text in the chat form
async function submitChatForm() {
  event.preventDefault();

  disableInput();

  // get user's text
  const userText = userInput.value;

  // create user chat line in browser and transcript
  await addUserMessageToChat(userText);

  // secret ability for testing to clear the chat history
  // type "//reset" to reset the transcript
  if (userText == "//reset") {
    localStorage.clear();
    getTranscript();
    await printMessage("Your conversation history has been reset.");
    await printMessage(initialMessage);
    return;
  }

  // send the updated transcript to OpenAI for response
  await sendTranscriptAndStreamResponse();

  // make sure we're safe within the context limit
  checkContextLimit();
}

// 
async function addUserMessageToChat(message) {
  // create user chat line
  const userMessageElement = document.createElement("div");
  userMessageElement.classList.add("usermessage");
  chatContainer.appendChild(userMessageElement);

  // fill it with user's chat
  userMessageElement.textContent = message;
  console.log("\nUser input message: " + message);

  // make sure we're at the bottom of the chat history
  // pageBody.scrollTop = pageBody.scrollHeight;
  if (document.body.scrollHeight > window.innerHeight) {
    window.scrollTo(0, document.body.scrollHeight);
  }

  // reset chat input text message
  userInput.value = "";
  userInput.style.height = "auto";

  // get the closest matches from the vector database
  const context = await getContext(message);

  const chatMessages = await getChatMessages();

  const compiledMessage = chatMessages.userMessagePrepend + `

    Information:
    ${context}
    
    Question from the user:
    ${message}`;

  // add the new messages to the transcript
  const userMessageToAppend = {
    role: "user",
    content: compiledMessage,
  };
  console.log(userMessageToAppend);
  transcript.push(userMessageToAppend);
  localStorage.setItem("transcript", JSON.stringify(transcript));
}

// sends transcript with new user message to OpenAI and
// streams response in the browser and updates the transcript
async function sendTranscriptAndStreamResponse() {
  console.log(
    JSON.stringify({
      transcript: transcript,
    })
  );
  const botMessageElement = document.createElement("div");
  botMessageElement.classList.add("botmessage");
  chatContainer.appendChild(botMessageElement);

  // send user's entry to server and get GPT response
  const response = await fetch("/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transcript: transcript,
    }),
  });

  const reader = response.body.getReader();
  // Create a TextDecoder to decode the response body stream
  const decoder = new TextDecoder();
  let botMessageBody = "";

  reader.read().then(
    function processText({ done, value }) {
      if (done) {
        // add user's message to the transcript
        const chatbotMessageToAppend = {
          role: "assistant",
          content: botMessageBody,
        };
        transcript.push(chatbotMessageToAppend);
        localStorage.setItem("transcript", JSON.stringify(transcript));

        enableInput();

        console.log("Stream complete");
        if (document.body.scrollHeight > window.innerHeight) {
          window.scrollTo(0, document.body.scrollHeight);
        }
        return;
      }

      // value for fetch streams is a Uint8Array
      const chunk = decoder.decode(value);

      if (chunk) {
        // intercede if it's a function call response
        // and handle appropriately
        // ((add future function call handling here))
        // if not a function call, add the chat response to the browser window
        botMessageBody += chunk;
        botMessageElement.innerHTML = marked.parse(botMessageBody);

        // scroll to the bottom of the page
        if (document.body.scrollHeight > window.innerHeight) {
          window.scrollTo(0, document.body.scrollHeight);
        }
      }
      return reader.read().then(processText);
    }
  );
}

// show a message as the bot
// words one-at-a-time to simulate ChatGPT-style streaming
async function printMessage(message) {
  disableInput();

  const botMessageElement = document.createElement("div");
  botMessageElement.classList.add("botmessage");
  chatContainer.appendChild(botMessageElement);
  let messageContainer = "";

  const chunks = message.split(" ");
  for (const chunk of chunks) {
    // send words from the welcome message one-at-a-time
    messageContainer += chunk + " ";
    botMessageElement.innerHTML = marked.parse(messageContainer);

    // insert little random-length pauses between chunks
    //to make it seem like chatgpt
    const min = 25;
    const max = 100;
    const interval = Math.floor(Math.random() * (max - min + 1)) + min;
    await sleep(interval);
  }
}

// pause for ms number of milliseconds
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// if the conversation history is nearing the token
// limit (within 500 tokens), start stripping stuff from the conversation
function checkContextLimit() {
  const contentsForTokenCounting = JSON.stringify(transcript);
  const tokenEstimate = Math.round(contentsForTokenCounting.length / 4); // 1 token ≈ .75 words

  if (tokenEstimate > contextLimit - 500) {
    transcript.splice(2, 3);
  }
}

// enter key submits the form
userInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    submitChatForm();
  }
});

// resize the user input text box as needed
userInput.addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = this.scrollHeight + "px";
});

// send the user's input off to get vectorized
// and queried against the vector database
// to get the most relevant context
async function getContext(message) {
  // send user's entry to server and get GPT response
  const response = await fetch("/context", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: message,
    }),
  });

  const context = await response.json();

  return context;
}

// gets the system message, user message prepend, and initial message from the server
async function getChatMessages() {

  const response = await fetch("/getmessages", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    }
  });

  const chatMessages = await response.json();
  return JSON.parse(chatMessages);

}
