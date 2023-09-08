/*
UM Document Chatbot
9/8/23
Contact: mattacevedo at miami.edu
*/


// Chat prompts, listed here at the top as global constants for easy reference
// SYSTEM_MESSAGE is the instruction for the chatbot used to guide its behavior
// INITIAL_MESSAGE is what is displayed to the user when opening the chat
// USER_MESSAGE_PREPEND will be combined with the user's question and the relevant context and sent to GPT for a response
const SYSTEM_MESSAGE = `You are an AI-powered chatbot programmed to provide answers to questions about conducting research with human subjects at the University of Miami. You will receive the following:

- the transcript of your conversation thus far
- some information from the University of Miami Investigator Manual, which is a document that contains policies, procedures, and guidance for conducting research with human subjects at the University of Miami.
- a question from the user who is most likely a University of Miami faculty member or researcher who will be conducting research with human subjects.

If the question relates to the information provided from the Investigator Manual, use that information to the best of your ability to provide an accurate and truthful response.

Some of the information provided to you from the Investigator Manual may not be relevant to the question. Ignore any non-pertinent information in your response. If you are asked about information that is not provided to you, respond with a friendly variation of "I'm sorry, I don't know that one," and refer the user to the University of Miami Human Subjects Research Office (HSRO) at http://hsro.uresearch.miami.edu/.

Do not reference information other than what is provided to you.

You may reference prior parts of your conversation.

Use a tone that is helpful and casually professional.`;

const INITIAL_MESSAGE = "Hello! I'm an AI-powered chatbot with knowledge about conducting research with human subjects at the University of Miami. My knowledge comes from the [University of Miami Investigator Manual](https://hsro.uresearch.miami.edu/_assets/pdf/hrp-103-investigator-manual.pdf). Feel free to ask me a question and I'll do my best to point you in the right direction.";


const USER_MESSAGE_PREPEND = `Below is some information from the University of Miami Investigator Manual, which is a document that contains policies, procedures, and guidance for conducting research with human subjects at the University of Miami as well as a question from the user who is most likely a University of Miami faculty member or researcher who will be conducting research with human subjects.

If the user's question relates to the information provided, use that information to the best of your ability to provide an accurate and truthful response.

If you are asked about something that is not provided in the information, respond with a friendly variation of "I'm sorry, I don't know that one," and refer the user to the University of Miami Human Subjects Research Office (HSRO) at http://hsro.uresearch.miami.edu/.

Do not reference information other than what is provided to you from the Investigator Manual information. You may engage in smalltalk and friendly banter. You may reference prior parts of your conversation. Use a tone that is helpful and casually professional.


`;

// express server setup
import express from "express";
import bodyParser from "body-parser";
import path from "path";
const app = express();
app.use(
  bodyParser.urlencoded({
    extended: false,
  })
);
app.use(bodyParser.json());
app.use(express.static("public"));
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baseDir = __dirname;

// mammoth and multer for word doc upload
import mammoth from 'mammoth';
import multer from 'multer';
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// pdf-parse for PDF upload
/*
Important: if pdf-parse gives you an error about "./test/data/05-versions-space.pdf", then you have go go into [node_modules/pdf-parse/index.js] and comment out lines 11-26.
*/
import pdfParse from 'pdf-parse';


// Azure OpenAI settings
const OPENAI_API_KEY = process.env['OPENAI_API_KEY'];
const AZURE_OPENAI_RESOURCE = process.env['AZURE_OPENAI_RESOURCE'];
const OPENAI_DEPLOYMENT_NAME = process.env['OPENAI_DEPLOYMENT_NAME'];
const API_VERSION = "2023-05-15";
const TEMPERATURE = 1.0;

// Azure Cognitive Search settings
const COG_SEARCH_KEY = process.env['COG_SEARCH_KEY']
const COG_SERVICE_NAME = process.env['COG_SERVICE_NAME']
const INDEX_NAME = process.env['INDEX_NAME']
const COG_API_VERSION = "2023-07-01-Preview";


/******* FUNCTIONS *******/

// sleep ms number of milliseconds
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// get OpenAI Ada embedding for a given text
async function getEmbedding(text) {

  const embeddingsEndpoint =
    "https://umitatoaidev02.openai.azure.com/openai/deployments/text-embedding-ada-002/embeddings?api-version=2023-05-15";

  const response = await fetch(embeddingsEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": OPENAI_API_KEY,
    },
    body: JSON.stringify({
      input: text,
    }),
  });

  // log errors
  if (response.status != 200) {
    console.log(
      `Non-200 response on OpenAI embeddings: ${await response.text()}`
    );
    return false;
  }

  // parse JSON data
  const data = await response.json();

  // extract embeddings
  const embedding = data.data[0].embedding;

  return embedding;
}


// search the index for semantic match
async function searchIndex(vector) {

  // endpoint for document searches
  const URL = `https://${COG_SERVICE_NAME}.search.windows.net/indexes/${INDEX_NAME}/docs/search?api-version=2023-07-01-Preview`;

  // search request package
  // k = the number of top search results to get back
  // a higher k value gets more context for the chatbot, but too much context can confuse the chatbot. Bigger isn't always better.
  const searchRequest = {
    vectors: [
      {
        value: vector,
        k: 5,
        fields: "contentVector",
      },
    ],
  };

  const response = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": COG_SEARCH_KEY,
    },
    body: JSON.stringify(searchRequest),
  });

  const data = await response.json();

  // No matter the value of k, this combines the results into one string, 
  // which we send to the chatbot as the document context
  const combinedContent = data.value.map((item) => item.content).join("\n\n");

  return combinedContent;
}

// Counts how many documents exist in the index and returns that count.
// Used primarily when deleting existing documents from deleteDocuments()
async function countDocuments() {
  const docCountEndpoint = `https://${COG_SERVICE_NAME}.search.windows.net/indexes/${INDEX_NAME}/docs/$count?api-version=2020-06-30`;

  const response = await fetch(docCountEndpoint, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "api-key": COG_SEARCH_KEY,
    },
  });

  // this is the number of documents in the index
  const documentCount = await response.text();

  return documentCount;
}

// deletes all the documents in the index
// this should be the first step in resetting the index before re-upserting
async function deleteDocuments(documentCount) {
  const URL = `https://${COG_SERVICE_NAME}.search.windows.net/indexes/${INDEX_NAME}/docs/index?api-version=2023-07-01-Preview`;

  for (let x = 0; x < documentCount; x++) {
    const deleteBody = {
      value: [
        {
          "@search.action": "delete",
          id: "v" + x,
        },
      ],
    };

    const response = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": COG_SEARCH_KEY,
      },
      body: JSON.stringify(deleteBody),
    });

    // this is because of some intermittent wonky thing where 
    // the for loop randomly continues forever.
    if (x > documentCount) break;
  }
}

// upsert documents into to index
// accepts an array of 
async function upsertDocuments(documents) {

  let embedding = new Array();
  const URL = `https://${COG_SERVICE_NAME}.search.windows.net/indexes/${INDEX_NAME}/docs/index?api-version=2023-07-01-Preview`;

  // for each element of the array, get its vector embedding and then
  // upsert it into the Cognitive Search index.
  for (let x = 0; x < documents.length; x++) {
    embedding = await getEmbedding(documents[x]);

    let upsertRequest = {
      value: [
        {
          "@search.action": "upload",
          id: "v" + x,
          content: documents[x],
          contentVector: embedding,
        },
      ],
    };

    const response = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": COG_SEARCH_KEY,
      },
      body: JSON.stringify(upsertRequest),
    });
    console.log("Upserting v" + x);
    console.log(await response.json());
  }
}


/******* SERVER ROUTES *******/

// This is the server route that is called when chat form is submitted by user.
// The client sends the conversatation transcript from its local storage
// and this is sent to the GPT chat endpoint to get a chatbot response.
// The response from GPT is in a streaming format, which is then streamed to the client.
app.post("/chat", async (req, res) => {

  // get transcript from client-side
  const transcript = req.body.transcript;

  // URL for the Azure OpenAI chat endpoint
  const URL = `https://${AZURE_OPENAI_RESOURCE}.openai.azure.com/openai/deployments/${OPENAI_DEPLOYMENT_NAME}/chat/completions?api-version=${API_VERSION}`;

  // send the request package to OpenAI and
  // start the streamed response
  const response = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": OPENAI_API_KEY,
    },
    body: JSON.stringify({
      messages: transcript,
      temperature: TEMPERATURE,
      stream: true,
    }),
  });

  // log errors
  if (response.status != 200) {
    console.log(
      `Non-200 response on OpenAI chat response: ${await response.text()}`
    );
    return false;
  }

  // Create a TextDecoder to decode the response body stream
  const decoder = new TextDecoder();

  // these is used to collect full stream result
  let result = ""; // for chat responses

  // Create a reader to read the stream
  const reader = response.body.getReader();

  // reads the openAI stream and re-streams it to the client
  await reader.read().then(async function processText({ done, value }) {
    // Result objects contain two properties:
    // done  - true if the stream has already given you all its data.
    // value - some data. Always undefined when done is true.
    if (done) {

      if (result == "") {
        const chunks =
          "I'm sorry, I didn't get that. Would you try again?".split(" ");
        for (const chunk of chunks) {
          // send words from the welcome message one-at-a-time
          res.write(chunk + " ");

          // insert little random-length pauses between chunks
          //to make it seem more like chatgpt
          const min = 10;
          const max = 100;
          const interval = Math.floor(Math.random() * (max - min + 1)) + min;
          await sleep(interval);
        }
      }
      res.end();

      return;
    }

    // value for fetch streams is a Uint8Array
    const chunk = decoder.decode(value);

    // clean the unneeded stuff out of the stream chunk
    const lines = chunk
      .split("\n")
      .map((line) => line.replace("data: ", ""))
      .filter((line) => line.length > 0)
      .filter((line) => line !== "[DONE]")
      .map((line) => JSON.parse(line));

    // extract the content out of the cleaned up JSON chunk
    for (const line of lines) {
      const {
        choices: [
          {
            delta: { content },
          },
        ],
      } = line;

      // if it's a chat response, comes in as content
      // insert little random-length pauses between chunks
      // to make it seem more like chatgpt
      if (content && content != "") {
        const min = 10;
        const max = 100;
        const interval = Math.floor(Math.random() * (max - min + 1)) + min;
        await sleep(interval);
        result += content;
        res.write(content); // this sends the text to the client
      }
    }

    // Read some more, and call this function again
    return reader.read().then(processText);
  });
});

// server route to send the context relating to the
// closest vector search result
app.post("/context", async (req, res) => {
  const message = req.body.message;

  const embedding = await getEmbedding(message);

  // send as a query to get the context
  const context = await searchIndex(embedding);

  res.send(JSON.stringify(context));
});

// server route to send the context relating to the
// closest vector search result
app.post("/pushupdate", async (req, res) => {
  const truth = req.body.truth;

  const documentCount = await countDocuments();
  await deleteDocuments(documentCount);

  console.log("upserting documents");
  await upsertDocuments(truth);
  res.send(JSON.stringify("DONE"));
});



// server route to send the uploader app
app.get("/uploader", async (req, res) => {
  res.sendFile("public/uploader.html", { root: __dirname });
});

// This route accepts the document from the user, 
// determines if it's a Word doc or PDF, extracts the text,
// creates individual text segments with overlaps,
// resets the index, and upserts the new segments.
app.post('/uploaddocument', upload.single('wordDoc'), async (req, res) => {

  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }

  const SEGMENT_LENGTH = 750;
  const OVERLAP = 100;
  let text = "";

  try {
    if (req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      // Handle Word Document
      const result = await mammoth.extractRawText({ buffer: req.file.buffer });
      text = result.value;
    } else if (req.file.mimetype === 'application/pdf') {
      // Handle PDF Document
      const data = await pdfParse(req.file.buffer);
      text = data.text;
    } else {
      return res.status(400).send("Unsupported file type.");
    }

    const words = text.split(/\s+/);

    let segments = [];
    for (let i = 0; i < words.length; i += OVERLAP) {
      segments.push(words.slice(i, i + SEGMENT_LENGTH).join(' '));
    }

    // reset the index
    const docCount = await countDocuments();
    if (docCount) await deleteDocuments(docCount);
    await upsertDocuments(segments);

    // sends the segments back to the client in case we want them
    res.json(segments);

  } catch (error) {
    res.status(500).send("Error processing document.");
  }
});

// sends the chat prompts to the client
app.get('/getmessages', async (req, res) => {

  const chatMessages = {
    systemMessage: SYSTEM_MESSAGE,
    initialMessage: INITIAL_MESSAGE,
    userMessagePrepend: USER_MESSAGE_PREPEND
  }

  res.json(JSON.stringify(chatMessages));

});

// turn the server on
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
