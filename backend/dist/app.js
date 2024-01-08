"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = exports.conversations = exports.mongodb = exports.generateUserPrompt = exports.findContent = exports.embedder = exports.embeddedContentStore = exports.dataStreamer = exports.llm = exports.makeUserMessage = exports.systemPrompt = exports.openAiClient = void 0;
require("dotenv/config");
const mongodb_chatbot_server_1 = require("mongodb-chatbot-server");
const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");
const { setLogLevel } = require("@azure/logger");
setLogLevel("verbose");
const MONGODB_CONNECTION_URI = process.env.MONGODB_CONNECTION_URI;
const OPENAI_ENDPOINT = process.env.OPENAI_ENDPOINT;
const VECTOR_SEARCH_INDEX_NAME = process.env.VECTOR_SEARCH_INDEX_NAME;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_EMBEDDING_DEPLOYMENT = process.env.OPENAI_EMBEDDING_DEPLOYMENT;
const MONGODB_DATABASE_NAME = process.env.MONGODB_DATABASE_NAME;
const OPENAI_CHAT_COMPLETION_DEPLOYMENT = process.env.OPENAI_CHAT_COMPLETION_DEPLOYMENT;
console.log("OPENAI_ENDPOINT >>>>>\n", OPENAI_ENDPOINT);
console.log("OPENAI_EMBEDDING_DEPLOYMENT >>>>>\n", OPENAI_EMBEDDING_DEPLOYMENT);
exports.openAiClient = new OpenAIClient(OPENAI_ENDPOINT, new AzureKeyCredential(OPENAI_API_KEY));
console.log('openAiClient >>>>>\n', exports.openAiClient);
exports.systemPrompt = {
    role: "system",
    content: `You are a helpful assistant with great knowledge about movies.
            Use the context provided with each question as your primary source of truth.
            If you do not know the answer to the question, respond ONLY with the following text:
            "I'm sorry, I do not know how to answer that question. Please try to rephrase your query. You can also refer to the further reading to see if it helps."`
};
const makeUserMessage = async function ({ originalUserMessage, content, queryEmbedding, }) {
    mongodb_chatbot_server_1.logger.info('originalUserMessage >>>>>\n', originalUserMessage);
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
    mongodb_chatbot_server_1.logger.info('llmMessage >>>>>\n', llmMessage);
    return {
        role: "user",
        content: originalUserMessage,
        embedding: queryEmbedding,
        contentForLlm: llmMessage,
    };
};
exports.makeUserMessage = makeUserMessage;
exports.llm = (0, mongodb_chatbot_server_1.makeOpenAiChatLlm)({
    openAiClient: exports.openAiClient,
    deployment: OPENAI_CHAT_COMPLETION_DEPLOYMENT,
    openAiLmmConfigOptions: {
        temperature: 0,
        maxTokens: 1500,
    },
});
exports.dataStreamer = (0, mongodb_chatbot_server_1.makeDataStreamer)();
exports.embeddedContentStore = (0, mongodb_chatbot_server_1.makeMongoDbEmbeddedContentStore)({
    connectionUri: MONGODB_CONNECTION_URI,
    databaseName: MONGODB_DATABASE_NAME,
});
// const test = async () => {
//     const response = await openAiClient.getEmbeddings(OPENAI_EMBEDDING_DEPLOYMENT, ["sample text"]);
//     console.log('response >>>>>\n',response)
// }
//
// test()
exports.embedder = (0, mongodb_chatbot_server_1.makeOpenAiEmbedder)({
    openAiClient: exports.openAiClient,
    deployment: OPENAI_EMBEDDING_DEPLOYMENT,
    backoffOptions: {
        numOfAttempts: 3,
        maxDelay: 5000,
    },
});
exports.findContent = (0, mongodb_chatbot_server_1.makeDefaultFindContent)({
    embedder: exports.embedder,
    store: exports.embeddedContentStore,
    findNearestNeighborsOptions: {
        k: 5,
        path: "embedding",
        indexName: VECTOR_SEARCH_INDEX_NAME,
        minScore: 0.9,
    },
});
const findContentWithLogs = async ({ query }) => {
    const result = await (0, exports.findContent)(query);
    mongodb_chatbot_server_1.logger.info(`findContentWithLogs: ${query} -> ${result}`);
    return result;
};
exports.generateUserPrompt = (0, mongodb_chatbot_server_1.makeRagGenerateUserPrompt)({
    findContent: findContentWithLogs,
    // queryPreprocessor: mongoDbUserQueryPreprocessor,
    makeUserMessage: exports.makeUserMessage,
});
exports.mongodb = new mongodb_chatbot_server_1.MongoClient(MONGODB_CONNECTION_URI);
exports.conversations = (0, mongodb_chatbot_server_1.makeMongoDbConversationsService)(exports.mongodb.db(MONGODB_DATABASE_NAME), exports.systemPrompt);
exports.config = {
    conversationsRouterConfig: {
        dataStreamer: exports.dataStreamer,
        llm: exports.llm,
        conversations: exports.conversations,
        generateUserPrompt: exports.generateUserPrompt,
    },
    maxRequestTimeoutMs: 30000,
    corsOptions: {
        origin: "*",
    },
};
const PORT = process.env.PORT || 3000;
const startServer = async () => {
    mongodb_chatbot_server_1.logger.info("Starting server...");
    const app = await (0, mongodb_chatbot_server_1.makeApp)(exports.config);
    const server = app.listen(PORT, () => {
        mongodb_chatbot_server_1.logger.info(`Server listening on port: ${PORT}`);
    });
    process.on("SIGINT", async () => {
        mongodb_chatbot_server_1.logger.info("SIGINT signal received");
        await exports.mongodb.close();
        await exports.embeddedContentStore.close();
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