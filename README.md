# Introduction

This is a chatbot that will use the text from a Word or PDF document as an information source for conversation with a user.

To get started, you will need:
* An Azure OpenAI resource and API key
* A Microsoft Cognitive Search service
* An Azure web app set up for Node.js

The existing system prompts assume that the chatbot will use the [University of Miami Investigator Manual](https://hsro.uresearch.miami.edu/_assets/pdf/hrp-103-investigator-manual.pdf). You can change the prompts as needed by adjusting the constants at the very top of `index.js`. For a different document or use case, you might also want to change the title and header of the page in `public/index.html`.

# Getting Started

## Clone This Repo and Deploy to Azure

I recommend using MS Visual Studio Code to clone this GitHub repo. Use `https://github.com/mattacevedo/UM-Document-Chat.git` as the URL or `gh repo clone mattacevedo/UM-Document-Chat` if using the CLI.

Then, you can use the [Azure App Service extension](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-azureappservice) in VS Code to deploy as an Azure web app.

## Setting Up Environment Variables

The following need to be added as environment variables. For an Azure web app, you can do this from the Azure Portal in Configuration settings under "Application settings."
* `AZURE_OPENAI_RESOURCE` - the name of your Azure OpenAI resource retrieved from Azure Portal
* `OPENAI_DEPLOYMENT_NAME` - the name of the deployed GPT-4 model. You can deploy models in the Azure OpenAI Studio.
* `OPENAI_API_KEY` - your Azure OpenAI API retrieved from the Azure Portal (must be through Azure; a generic OpenAI key won't work)
* `COG_SEARCH_KEY` - the API key of your MS Cognitive Search service retrieved from the Azure Portal
* `COG_SERVICE_NAME` - the name of your MS Cognitive Search service retrieved from the Azure Portal
* `INDEX_NAME` - the name of the your index in MS Cognitive Search; you will create this soon.

## Creating Your Vector Index in Cognitive Search

While you can create a Cognitive Search index in the Azure Portal, it doesn't give you all the options to create a vector-enabled index. the `createsearchindex.mjs` file here will do it for you, creating an index that is ready to go for 1,536-dimension, OpenAI Ada-friendly index. It will use the name stored in your `INDEX_NAME` environment variable.

Run `node createsearchindex.mjs` from the a terminal to create your index. If it's deployed in Azure already, you cam use  web SSH console for this (accessible from the Azure Portal). 

## Uploading Your Source Document

Visit `[your app URL]/uploader` to upload a Word or PDF document for processing. The app will extract the text, segment it into 750-word chunks with 100-word overlap, get vector embeddings for each chunk with OpenAI Ada, and send the vector values to the vector index. If you try to use the chatbot before uploading the source document or creating the index, it won't work.

## Known Issue - Important!

The PDF-Parse library is used to extract the text from PDF files. There's an issue with this library and importing it as an ES6 module. Their fault, not ours. If you get a runtime error relating to PDF-Parse looking for a file `./test/data/05-versions-space.pdf`, then you need to go into `node_modules/pdf-parse/index.js` and comment out lines 11-26.

# How This Works

Chatbots like ChatGPT are great at talking about the knowledge that exists in their training data, but will often fail or hallucinate when asked about specific information that they weren't trained on. How can we create a chatbot that uses our own information?

One solution - and the one used here - is based on vector embedding. Using an OpenAI model called Ada, we can get the vector embedding for a given passage of text; essentially this is a numerical representation of the *semantic meaning* of that text. These numerical representations are stored in a vector index - basically a database for numbers that also keeps the original text as metadata.

When the user asks the chatbot a question, we also get the vector embedding for the question itself. Then, we ask the vector index to compare the embedding values of the user's question to everything in the database and send us the original text of the closest matches. In other words, we find one or more (in this app's case, it's set to five) passages of text that have the closest semantic match to the user's question. 

We include that original text as context along with the user's prompt to OpenAI GPT-4 to get the chatbot's answer.

## Example

Here's a simplified example. A user asks the chatbot:

> How do I begin the IRB process?

This sentence is sent to Ada to get its vector embedding values, and those values are compared to the values of everything in the vector search database. The database finds the closest match and sends back the corresponding original text chunk, which looks like this:

> [...] This chapter describes what investigators should expect from IRB review. 5.1 Levels of IRB Review When the HSRO receives a submission, the first task is to determine whether the proposed project is, indeed, human subject research. If the IRB determines that it meets the definition of a human subject and research, the next task is to determine the level of review. The following are descriptions of the various levels of review available: Not Human Subject Research (HSR) Activities that do not meet the definition of “research” and/or do not include “human subjects,” as defined by regulations, are not subject to IRB oversight or review. This determination is not the same as “exempt” (see below) nor does this mean you are “IRB approved.” [...]

The "user message" that is sent to GPT-4 is structured like this (although the user never sees this):

> Here is some information and a question from the user. Use the information to answer the question.
>
> Information:
> [...]This chapter describes what investigators should expect from IRB review. 5.1 Levels of IRB Review When the HSRO receives a submission, the first task is to determine whether the proposed project is, indeed, human subject research. If the IRB determines that it meets the definition of a human subject and research, the next task is to determine the level of review. [...]
>
> Question from user:
> How do I begin the IRB process?

The GPT-4 model will respond with something like this:
> The Institutional Review Board (IRB) process at the University of Miami is thorough and involves several steps:
>
> 1. Determine if it is Human Subject Research (HSR): The first step is to determine whether your proposed project is considered human subject research. Activities that do not meet the definition of “research” or do not include “human subjects," are not subject to IRB oversight or review.
> [...]

Again, this is the simplified version for illustration. This app's actual guidance to the chatbot is clearer and more precise, and the top 5 semantic matches are provided as context (not just one), giving the chatbot much more text to use to generate the best answer. You can see (and adjust) the chatbot's instructions at the top of `index.js`.

# Helpful Resources

## Microsoft API Documentation

* [Azure OpenAI Service REST API reference](https://learn.microsoft.com/en-us/azure/ai-services/openai/reference#chat-completions)
* [Create or Update Cognitve Search Index (Preview REST API)](https://learn.microsoft.com/en-us/rest/api/searchservice/preview-api/create-or-update-index)
* [Add, Update or Delete Documents (Azure Cognitive Search REST API)](https://learn.microsoft.com/en-us/rest/api/searchservice/addupdate-or-delete-documents)
* [Quickstart: Use preview REST APIs for vector search queries](https://learn.microsoft.com/en-us/azure/search/search-get-started-vector)

## Useful Instructional Guidance

* [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings)
* [Chunking Strategies for LLM Applications](https://www.pinecone.io/learn/chunking-strategies/)
* [Chunking large documents for vector search solutions in Cognitive Search](https://learn.microsoft.com/en-us/azure/search/vector-search-how-to-chunk-documents)
