"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");
const mongodb_chatbot_server_1 = require("mongodb-chatbot-server");
const MONGODB_CONNECTION_URI = process.env
    .MONGODB_CONNECTION_URI;
const OPENAI_ENDPOINT = process.env.OPENAI_ENDPOINT;
const VECTOR_SEARCH_INDEX_NAME = process.env
    .VECTOR_SEARCH_INDEX_NAME;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_EMBEDDING_DEPLOYMENT = process.env
    .OPENAI_EMBEDDING_DEPLOYMENT;
const MONGODB_DATABASE_NAME = process.env
    .MONGODB_DATABASE_NAME;
const OPENAI_CHAT_COMPLETION_DEPLOYMENT = process.env
    .OPENAI_CHAT_COMPLETION_DEPLOYMENT;
class SimpleEmbedder {
    async embed(query) {
        try {
            const response = await openAiClient.getEmbeddings(OPENAI_EMBEDDING_DEPLOYMENT, [query.text]);
            return { embedding: response.data[0].embedding };
        }
        catch (e) {
            mongodb_chatbot_server_1.logger.error(`Error embedding query: ${e} \nquery:${query}`);
            return { embedding: [] };
        }
    }
}
const openAiClient = new OpenAIClient(OPENAI_ENDPOINT, new AzureKeyCredential(OPENAI_API_KEY));
const systemPrompt = {
    role: "system",
    content: `You are a helpful assistant with great knowledge about movies.
            Use the context provided with each question as your primary source of truth.
            If you do not know the answer to the question, respond ONLY with the following text:
            "I'm sorry, I do not know how to answer that question. Please try to rephrase your query. You can also refer to the further reading to see if it helps."`,
};
const makeUserMessage = async function ({ originalUserMessage, content, queryEmbedding, }) {
    const chunkSeparator = "~~~~~~";
    const context = content.map((c) => c.text).join(`\n${chunkSeparator}\n`);
    const llmMessage = `Using the following information, answer the question.
Different pieces of information are separated by "${chunkSeparator}".

<Information>
${context}
<End information>

<Question>
${originalUserMessage}
<End Question>`;
    return {
        role: "user",
        content: originalUserMessage,
        embedding: queryEmbedding,
        contentForLlm: llmMessage,
    };
};
const llm = (0, mongodb_chatbot_server_1.makeOpenAiChatLlm)({
    openAiClient,
    deployment: OPENAI_CHAT_COMPLETION_DEPLOYMENT,
    openAiLmmConfigOptions: {
        temperature: 0,
        maxTokens: 1500,
    },
});
const dataStreamer = (0, mongodb_chatbot_server_1.makeDataStreamer)();
const embeddedContentStore = (0, mongodb_chatbot_server_1.makeMongoDbEmbeddedContentStore)({
    connectionUri: MONGODB_CONNECTION_URI,
    databaseName: MONGODB_DATABASE_NAME,
});
const findContent = (0, mongodb_chatbot_server_1.makeDefaultFindContent)({
    embedder: new SimpleEmbedder(),
    store: embeddedContentStore,
    findNearestNeighborsOptions: {
        k: 5,
        path: "embedding",
        indexName: VECTOR_SEARCH_INDEX_NAME,
        minScore: 0.9,
    },
});
const generateUserPrompt = (0, mongodb_chatbot_server_1.makeRagGenerateUserPrompt)({
    findContent,
    makeUserMessage,
    makeReferenceLinks: () => [],
});
const mongodb = new mongodb_chatbot_server_1.MongoClient(MONGODB_CONNECTION_URI);
const conversations = (0, mongodb_chatbot_server_1.makeMongoDbConversationsService)(mongodb.db(MONGODB_DATABASE_NAME), systemPrompt);
const config = {
    conversationsRouterConfig: {
        dataStreamer,
        llm,
        conversations,
        generateUserPrompt,
    },
    maxRequestTimeoutMs: 30000,
    corsOptions: {
        origin: "*",
    },
};
const PORT = process.env.PORT || 3000;
const startServer = async () => {
    mongodb_chatbot_server_1.logger.info("Starting server...");
    const app = await (0, mongodb_chatbot_server_1.makeApp)(config);
    const server = app.listen(PORT, () => {
        mongodb_chatbot_server_1.logger.info(`Server listening on port: ${PORT}`);
    });
    process.on("SIGINT", async () => {
        mongodb_chatbot_server_1.logger.info("SIGINT signal received");
        await mongodb.close();
        await embeddedContentStore.close();
        await new Promise((resolve, reject) => {
            server.close((error) => {
                error ? reject(error) : resolve();
            });
        });
        process.exit(1);
    });
};
try {
    startServer();
}
catch (e) {
    mongodb_chatbot_server_1.logger.error(`Fatal error: ${e}`);
    process.exit(1);
}
//# sourceMappingURL=app.js.map