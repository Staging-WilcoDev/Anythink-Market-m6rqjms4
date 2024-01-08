"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addMetadataToQuery = exports.generateMongoDbQueryPreProcessorPrompt = exports.makePreprocessMongoDbUserQuery = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const mongodb_chatbot_server_1 = require("mongodb-chatbot-server");
/**
 Query preprocessor that uses the Azure OpenAI service to preprocess
 the user query via [TypeChat](https://microsoft.github.io/TypeChat/docs/introduction/).

 The query preprocessor performs the following:

 - Adds metadata to the query to yield better vector search results.
 - Transforms the query in the context of the conversation to yield better vector search results.
 - Advises the server to not respond if the query is inappropriate.

 */
function makePreprocessMongoDbUserQuery({ azureOpenAiServiceConfig, numRetries = 0, retryDelayMs = 4000, }) {
    const schemaName = "MongoDbUserQueryPreprocessorResponse";
    const schema = fs_1.default.readFileSync(path_1.default.join(__dirname, `${schemaName}.ts`), "utf8");
    const translate = (0, mongodb_chatbot_server_1.makeTypeChatJsonTranslateFunc)({
        azureOpenAiServiceConfig,
        numRetries,
        retryDelayMs,
        schema,
        schemaName,
    });
    return async ({ query, messages }) => {
        if (query === undefined) {
            return { query, rejectQuery: false };
        }
        const prompt = generateMongoDbQueryPreProcessorPrompt({
            query,
            messages: messages ?? [],
        });
        const data = await translate(prompt);
        return {
            ...data,
            query: addMetadataToQuery(data),
        };
    };
}
exports.makePreprocessMongoDbUserQuery = makePreprocessMongoDbUserQuery;
function generateMongoDbQueryPreProcessorPrompt({ query, messages, numMessagesToInclude = 4, }) {
    query = query.trim();
    // If the query is only one word, add "for MongoDB" to the end of it. This is to help the LLM
    // Also, if the query is "mongodb", don't add "for MongoDB" to the end of it
    // since that doesn't make logical sense.
    if (query.split(/\s/).length === 1 && query.toLowerCase() !== "mongodb") {
        query += " for MongoDB";
    }
    const conversationHistory = messages.length
        ? messages
            .filter((message) => message.role !== "system") // remove system message
            .slice(0 - numMessagesToInclude) // only use last 4 messages
            .reduce((acc, message) => {
            return `${acc}\n\n${message.role.toUpperCase()}:\n${message.content}`;
        }, "") // convert conversation to string
            .trim() // remove whitespace
        : "No previous conversation history.";
    // This is adapted from llamaindex https://github.com/jerryjliu/llama_index/blob/551643ac725306560fc635787e7c7a1f197d9393/llama_index/chat_engine/condense_question.py#L23
    const prompt = `Given a conversation (between USER and ASSISTANT) and a follow up message from USER, output an object conforming to the given TypeScript type.

<Conversation History>
${conversationHistory}


<USER Follow Up Message>
${query}

<Standalone question>`;
    return prompt;
}
exports.generateMongoDbQueryPreProcessorPrompt = generateMongoDbQueryPreProcessorPrompt;
function addMetadataToQuery({ query, programmingLanguages, mongoDbProducts, }) {
    return (query &&
        (0, mongodb_chatbot_server_1.updateFrontMatter)(query, {
            programmingLanguages,
            mongoDbProducts,
        }));
}
exports.addMetadataToQuery = addMetadataToQuery;
//# sourceMappingURL=makePreprocessMongoDbUserQuery.js.map