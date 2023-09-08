# Introduction
This is a chatbot that will use the text from a Word or PDF document as an information source for conversation with a user.

To get started, you will need:
* An Azure OpenAI resource and API key
* A Microsoft Cognitive Search service
* An Azure web app set up for Node.js

The existing system prompts assume that the chatbot will use the University of Miami Investigator Manual. You can change the prompts as needed by adjusting the constants at the very top of `index.js`. You might also want to change the title and header of the page in `public/index.html`.

# How This Works: A Bird's Eye View
Chatbots like ChatGPT are great at talking about the knowledge that exists in their training data, but will often fail or hallucinate when asked about specific information that they weren't trained on. How can we create a chatbot that uses our own information?

One solution - and the one used here - is based on vector embedding. Using an OpenAI model called Ada, we can get the vector embedding for a given passage of text; essentially this is a numerical representation of the *semantic meaning* of that text. These numerical representations are stored in a vector index - basically a database for numbers that also keeps the original text as metadata.

When the user asks the chatbot a question, we also get the vector embedding for the question. Then, we ask the vector index to compare the embedding values of the user's question to everything in the database and send us the original text of the closest matches.

We include that original text with the user's prompt to OpenAI GPT-4 to get the chatbot's answer.

# Setting Up Environment Variables
The following need to be added as environment variables. For an Azure web app, you can do this from the Azure Portal in Configuration settings under "Application settings."
* AZURE_OPENAI_RESOURCE - the name of your Azure OpenAI resource retrieved from Azure Portal
* OPENAI_DEPLOYMENT_NAME - the name of the deployed GPT-4 model. You can deploy models in the Azure OpenAI Studio.
* OPENAI_API_KEY - your Azure OpenAI API retrieved from the Azure Portal (must be through Azure; a generic OpenAI key won't work)
* COG_SEARCH_KEY - the API key of your MS Cognitive Search service retrieved from the Azure Portal
* COG_SERVICE_NAME - the name of your MS Cognitive Search service retrieved from the Azure Portal
* INDEX_NAME - the name of the your index in MS Cognitive Search; you will create this soon.

# Creating Your Vector Index in Cognitive Search
While you can create a Cognitive Search index in the Azure Portal, it doesn't give you all the options to create a vector-enabled index. the `createsearchindex.mjs` file here will do it for you, creating an index that is ready to go for 1,536-dimension, OpenAI Ada-friendly index.

Run `node createsearchindex.mjs` from the Terminal to create your index.

# Deploy the App
I recommend using the Azure Web App plugin from Visual Studio Code to deploy the app. Keep in mind that web apps in Azure should run on port 8080.

# Uploading Your Source Document
Either locally or in the deployed app, visit `/uploader` to upload a Word or PDF document for processing. The app will extract the text, segment it into 750-word chunks with 100-word overlap, get vector embeddings for each chunk with OpenAI Ada, and send the vector values to the vector index.

# Known Issue
The PDF-Parse library is used to extract the text from PDF files. There's an issue with this library and importing it as an ES6 module. Their fault, not ours. If you get a runtime error relating to PDF-Parse looking for a file `./test/data/05-versions-space.pdf`, then you need to go into `node_modules/pdf-parse/index.js` and comment out lines 11-26.