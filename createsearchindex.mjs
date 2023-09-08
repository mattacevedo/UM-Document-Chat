
const COG_SEARCH_KEY = process.env["COG_SEARCH_KEY"];
const COG_SERVICE_NAME = process.env["COG_SERVICE_NAME"];
const INDEX_NAME = process.env["INDEX_NAME"];;
const COG_API_VERSION = "2023-07-01-Preview";
const COG_SEARCH_URL = `https://${COG_SERVICE_NAME}.search.windows.net/indexes?api-version=${COG_API_VERSION}`


// create a vector index in MS Cognitive Search
async function createIndex() {
  console.log("creating index");
  const CREATE_INDEX_BODY = `{
    "name": "${INDEX_NAME}",
    "fields": [
        {
            "name": "id",
            "type": "Edm.String",
            "key": true,
            "filterable": true
        },
        {
            "name": "content",
            "type": "Edm.String",
            "searchable": true,
            "retrievable": true
        },
        {
            "name": "contentVector",
            "type": "Collection(Edm.Single)",
            "searchable": true,
            "retrievable": true,
            "dimensions": 1536,
            "vectorSearchConfiguration": "vector-config"
        }
    ],
    "corsOptions": {
        "allowedOrigins": [
            "*"
        ],
        "maxAgeInSeconds": 60
    },
    "vectorSearch": {
        "algorithmConfigurations": [
            {
                "name": "vector-config",
                "kind": "hnsw",
                "hnswParameters": {
                    "m": 4,
                    "efConstruction": 400,
                    "efSearch": 500,
                    "metric": "cosine"
                }
            }
        ]
    }
}`;

  const response = await fetch(COG_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": COG_SEARCH_KEY,
    },
    body: CREATE_INDEX_BODY,
  });
  const status = await response.status;
  if (status == 201) console.log("Successfully created index " + INDEX_NAME);
  else console.log("An error has occurred. Please check the configuration and try again.");
}


async function main() {

  await createIndex();
  
}

main();