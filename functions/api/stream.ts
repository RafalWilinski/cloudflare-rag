import { RoleScopedChatInput } from "@cloudflare/workers-types";
import { inArray, sql } from "drizzle-orm";
import { drizzle, DrizzleD1Database } from "drizzle-orm/d1";
import { documentChunks } from "schema";
import { llmResponse, streamLLMResponse } from "~/lib/aiGateway";

interface EmbeddingResponse {
  shape: number[];
  data: number[][];
}

async function rewriteToQueries(content: string, env: Env): Promise<string[]> {
  const prompt = `Given the following user message, rewrite it into 5 distinct queries that could be used to search for relevant information. Each query should focus on different aspects or potential interpretations of the original message. No questions, just a query maximizing the chance of finding relevant information.

User message: "${content}"

Provide 5 queries, one per line and nothing else:`;

  const response = await llmResponse({
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    messages: [{ role: "user", content: prompt }],
    apiKeys: {
      openai: env.OPENAI_API_KEY,
      groq: env.GROQ_API_KEY,
      anthropic: env.ANTHROPIC_API_KEY,
    },
    model: "llama-3.1-8b-instant",
    provider: "groq",
    AI: env.AI,
  });

  const regex = /^\d+\.\s*"|"$/gm;
  const queries = response
    .replace(regex, "")
    .split("\n")
    .filter((query) => query.trim() !== "")
    .slice(1, 5);

  return queries;
}

interface DocumentChunk {
  id: string;
  document_id: string;
  text: string;
  session_id: string;
  rank: number;
}

async function searchDocumentChunks(searchTerms: string[], db: DrizzleD1Database<any>) {
  const queries = searchTerms.filter(Boolean).map(
    (term) => {
      const sanitizedTerm = term.trim().replace(/[^\w\s]/g, '');
      return sql`
        SELECT document_chunks.*, document_chunks_fts.rank
        FROM document_chunks_fts
        JOIN document_chunks ON document_chunks_fts.id = document_chunks.id
        WHERE document_chunks_fts MATCH ${sanitizedTerm}
        ORDER BY rank DESC
        LIMIT 5
      `;
    }
  );

  const results = await Promise.all(
    queries.map(async (query) => {
      const { results } = (await db.run(query)) as { results: DocumentChunk[] };
      return results;
    })
  );

  console.log({ fts: results });

  return results
    .flat()
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 10);
}

// Helper function to perform reciprocal rank fusion
function performReciprocalRankFusion(
  fullTextResults: DocumentChunk[],
  vectorResults: VectorizeMatches[]
): { id: string; score: number }[] {
  const k = 60; // Constant for fusion, can be adjusted
  const scores: { [id: string]: number } = {};

  // Process full-text search results
  fullTextResults.forEach((result, index) => {
    const score = 1 / (k + index);
    scores[result.id] = (scores[result.id] || 0) + score;
  });

  // Process vector search results
  vectorResults.forEach((result) => {
    result.matches.forEach((match, index) => {
      const score = 1 / (k + index);
      scores[match.id] = (scores[match.id] || 0) + score;
    });
  });

  // Sort and return fused results
  return Object.entries(scores)
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}

const systemMessage = `You are a helpful assistant that answers questions based on the provided context. When giving a response, always include the source of the information in the format [1], [2], [3] etc.`;

async function queryVectorIndex(queries: string[], env: Env, sessionId: string) {
  const queryVectors: EmbeddingResponse[] = await Promise.all(
    queries.map((q) => env.AI.run("@cf/baai/bge-large-en-v1.5", { text: [q] }))
  );

  const allResults = await Promise.all(
    queryVectors.map((qv) =>
      env.VECTORIZE_INDEX.query(qv.data[0], {
        topK: 5,
        returnValues: true,
        returnMetadata: "all",
        namespace: "default",
        filter: {
          sessionId,
        },
      })
    )
  );

  return allResults;
}

async function getRelevantDocuments(ids: string[], db: DrizzleD1Database<any>) {
  const relevantDocs = await db
    .select({ text: documentChunks.text })
    .from(documentChunks)
    .where(inArray(documentChunks.id, ids));

  return relevantDocs;
}

async function processUserQuery(json: any, env: Env, writer: WritableStreamDefaultWriter) {
  const { provider, model, sessionId } = json;
  const messages: RoleScopedChatInput[] = json.messages as RoleScopedChatInput[];
  messages.unshift({ role: "system", content: systemMessage });
  const lastMessage = messages[messages.length - 1];
  const query = lastMessage.content;

  const db = drizzle(env.DB);
  const textEncoder = new TextEncoder();

  await writer.write(
    textEncoder.encode(`data: {"message": "Rewriting message to queries..."}\n\n`)
  );

  const queries = await rewriteToQueries(query, env);
  const queryingVectorIndexMsg = {
    message: "Querying vector index and full text search...",
    queries,
  };
  await writer.write(textEncoder.encode(`data: ${JSON.stringify(queryingVectorIndexMsg)}\n\n`));
  console.log({ queries });

  const [fullTextSearchResults, vectorIndexResults] = await Promise.all([
    searchDocumentChunks(queries, db),
    queryVectorIndex(queries, env, sessionId),
  ]);

  // Perform reciprocal rank fusion on fullTextSearchResults and vectorIndexResults
  // Sort in descending order because higher scores are better in reciprocal rank fusion
  const mergedResults = performReciprocalRankFusion(fullTextSearchResults, vectorIndexResults).sort(
    (a, b) => b.score - a.score
  );

  const relevantDocs = await getRelevantDocuments(mergedResults.map((r) => r.id).slice(0, 10), db);

  const relevantTexts = relevantDocs
    .map((doc, index) => `[${index + 1}]: ${doc.text}`)
    .join("\n\n");

  const relevantDocsMsg = {
    message: "Found relevant documents, generating response...",
    relevantContext: relevantDocs,
    queries,
  };
  await writer.write(textEncoder.encode(`data: ${JSON.stringify(relevantDocsMsg)}\n\n`));

  messages.push({
    role: "assistant",
    content: `The following queries were made:\n${queries.join(
      "\n"
    )}\n\nRelevant context from attached documents:\n${relevantTexts}`,
  });

  return { messages, provider, model };
}

async function streamResponse(
  params: Awaited<ReturnType<typeof processUserQuery>>,
  env: Env,
  writable: WritableStream
) {
  // Rafal's account id. If it is deployed on my account (aka this is demo), expensive models are prohibited.
  const IS_DEPLOYED_AS_DEMO = env.CLOUDFLARE_ACCOUNT_ID === 'fa3e82d8258ac121c26085c2a5952780'
  const { messages, provider, model } = params;
  const apiKeys = {
    anthropic: env.ANTHROPIC_API_KEY,
    openai: env.OPENAI_API_KEY,
    groq: env.GROQ_API_KEY,
  };

  const stream = await streamLLMResponse({
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    messages,
    apiKeys,
    model,
    provider,
    AI: env.AI,
    isDemo: IS_DEPLOYED_AS_DEMO
  });

  (stream as Response).body
    ? await (stream as Response).body?.pipeTo(writable)
    : await (stream as ReadableStream).pipeTo(writable);
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const ipAddress = ctx.request.headers.get("cf-connecting-ip");

  const rateLimit = await ctx.env.rate_limiter.get(ipAddress);
  if (rateLimit) {
    const lastRequestTime = parseInt(rateLimit);
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime - lastRequestTime < 3) {
      return new Response("Too many requests", { status: 429 });
    }
  }

  await ctx.env.rate_limiter.put(ipAddress, Math.floor(Date.now() / 1000).toString(), {
    expirationTtl: 60,
  });

  ctx.waitUntil(
    (async () => {
      try {
        const json = await ctx.request.json();
        const params = await processUserQuery(json, ctx.env, writer);
        writer.releaseLock();
        await streamResponse(params, ctx.env, writable);
      } catch (error) {
        console.error(error);
        await writer.write(new TextEncoder().encode(`data: ${JSON.stringify({ error: (error as Error).message })}\n\n`));
        await writer.close();
      }
    })()
  );

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Transfer-Encoding": "chunked",
      "content-encoding": "identity",
    },
  });
};
