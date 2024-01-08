import "dotenv/config";
import {
    MongoClient,
    makeMongoDbEmbeddedContentStore,
    makeOpenAiEmbedder,
    makeMongoDbConversationsService,
    makeDataStreamer,
    AppConfig,
    makeOpenAiChatLlm,
    SystemPrompt,
    makeDefaultFindContent,
    logger,
    makeApp,
    MakeUserMessageFunc,
    UserMessage,
    MakeUserMessageFuncParams,
    makeRagGenerateUserPrompt,
    GenerateUserPromptFunc,
} from "mongodb-chatbot-server";
const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");
const { setLogLevel } = require("@azure/logger");
setLogLevel("verbose");



const MONGODB_CONNECTION_URI:string = process.env.MONGODB_CONNECTION_URI as string
const OPENAI_ENDPOINT:string = process.env.OPENAI_ENDPOINT as string
const VECTOR_SEARCH_INDEX_NAME:string = process.env.VECTOR_SEARCH_INDEX_NAME as string
const OPENAI_API_KEY:string = process.env.OPENAI_API_KEY as string
const OPENAI_EMBEDDING_DEPLOYMENT: string = process.env.OPENAI_EMBEDDING_DEPLOYMENT as string
const MONGODB_DATABASE_NAME:string = process.env.MONGODB_DATABASE_NAME as string
const OPENAI_CHAT_COMPLETION_DEPLOYMENT:string = process.env.OPENAI_CHAT_COMPLETION_DEPLOYMENT as string

export const openAiClient = new OpenAIClient(
    OPENAI_ENDPOINT,
    new AzureKeyCredential(OPENAI_API_KEY),

);


export const systemPrompt: SystemPrompt = {
    role: "system",
    content: `You are a helpful assistant with great knowledge about movies.
            Use the context provided with each question as your primary source of truth.
            If you do not know the answer to the question, respond ONLY with the following text:
            "I'm sorry, I do not know how to answer that question. Please try to rephrase your query. You can also refer to the further reading to see if it helps."`

};


export const makeUserMessage: MakeUserMessageFunc = async function ({
                                                                        originalUserMessage,
                                                                        content,
                                                                        queryEmbedding,
                                                                    }: MakeUserMessageFuncParams): Promise<UserMessage> {
    logger.info('originalUserMessage >>>>>\n',originalUserMessage)
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
    logger.info('llmMessage >>>>>\n',llmMessage)
    return {
        role: "user",
        content: originalUserMessage,
        embedding: queryEmbedding,
        contentForLlm: llmMessage,
    };
};

export const llm = makeOpenAiChatLlm({
    openAiClient,
    deployment: OPENAI_CHAT_COMPLETION_DEPLOYMENT,
    openAiLmmConfigOptions: {
        temperature: 0,
        maxTokens: 1500,
    },
});


export const dataStreamer = makeDataStreamer();

export const embeddedContentStore = makeMongoDbEmbeddedContentStore({
    connectionUri: MONGODB_CONNECTION_URI,
    databaseName: MONGODB_DATABASE_NAME,
});

// const test = async () => {
//     const response = await openAiClient.getEmbeddings(OPENAI_EMBEDDING_DEPLOYMENT, ["sample text"]);
//     console.log('response >>>>>\n',response)
// }
//
// test()

export const embedder = makeOpenAiEmbedder({
    openAiClient,
    deployment: OPENAI_EMBEDDING_DEPLOYMENT,
    backoffOptions: {
        numOfAttempts: 1,
        maxDelay: 5000,
    },
});

const simpleEmbedder = () => {
    return {
        async embed(query) {
            logger.info('text >>>>>\n',query)
            try{
                const response = await openAiClient.getEmbeddings(OPENAI_EMBEDDING_DEPLOYMENT,  [query.text]);
                logger.info('response >>>>>\n',response)
                return { embedding: response.data[0].embedding };
            } catch (e) {
                logger.error('e >>>>>\n',e)
                return { embedding: [] };
            }
        }
    }
}

// const embedderTest: Embedder = async (text: string): Promise<EmbedResult> => {
//     const response = await openAiClient.getEmbeddings(OPENAI_EMBEDDING_DEPLOYMENT, [text]);
//     console.log('response >>>>>\n',response)
//     return { embedding: response.data[0].embedding };
// }


export const findContent = makeDefaultFindContent({
    embedder: simpleEmbedder(),
    store: embeddedContentStore,
    findNearestNeighborsOptions: {
        k: 5,
        path: "embedding",
        indexName: VECTOR_SEARCH_INDEX_NAME,
        minScore: 0.9,
    },
});

const findContentWithLogs = async ({query}) => {
    const result = await findContent(query);
    logger.info(`findContentWithLogs: ${query} -> ${result}`);
    return result;
}

export const generateUserPrompt: GenerateUserPromptFunc =
    makeRagGenerateUserPrompt({
        findContent,
        // queryPreprocessor: mongoDbUserQueryPreprocessor,
        makeUserMessage,
        makeReferenceLinks :() => []
    });

export const mongodb = new MongoClient(MONGODB_CONNECTION_URI);


export const conversations = makeMongoDbConversationsService(
    mongodb.db(MONGODB_DATABASE_NAME),
    systemPrompt
);

export const config: AppConfig = {
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
    logger.info("Starting server...");
    const app = await makeApp(config);
    const server = app.listen(PORT, () => {
        logger.info(`Server listening on port: ${PORT}`);
    });

    process.on("SIGINT", async () => {
        logger.info("SIGINT signal received");
        await mongodb.close();
        await embeddedContentStore.close();
        await new Promise<void>((resolve, reject) => {
            server.close((error) => {
                error ? reject(error) : resolve();
            });
        });
        process.exit(1);
    });
};

try {
    startServer()
} catch (e) {
    logger.error(`Fatal error: ${e}`);
    process.exit(1);
}