import { Ai, RoleScopedChatInput } from "@cloudflare/workers-types";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { documentChunks } from "schema";
import { streamLLMResponse } from "~/lib/aiGateway";

interface EmbeddingResponse {
  shape: number[];
  data: number[][];
}

async function rewriteToQueries(content: string, ai: Ai): Promise<string[]> {
  const prompt = `Given the following user message, rewrite it into 5 distinct queries that could be used to search for relevant information. Each query should focus on different aspects or potential interpretations of the original message:

User message: "${content}"

Provide 5 queries, one per line and nothing else:`;

  const { response } = (await ai.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [{ role: "user", content: prompt }],
  })) as { response: string };

  const queries = response
    .split("\n")
    .filter((query) => query.trim() !== "")
    .slice(1, 5);
  console.log({ queries });
  return queries;
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const ipAddress = ctx.request.headers.get("cf-connecting-ip") || "";

  ctx.waitUntil(
    (async () => {
      const json = await ctx.request.json();
      const { provider, model } = json;
      const messages: RoleScopedChatInput[] =
        json.messages as RoleScopedChatInput[];
      const lastMessage = messages[messages.length - 1];
      const query = lastMessage.content;

      const db = drizzle(ctx.env.DB);
      const textEncoder = new TextEncoder();

      await writer.write(
        textEncoder.encode(
          `data: {"message": "Rewriting message to queries..."}\n\n`
        )
      );
      const queries = await rewriteToQueries(query, ctx.env.AI as Ai);

      const queryVectors: EmbeddingResponse[] = await Promise.all(
        queries.map((q) =>
          ctx.env.AI.run("@cf/baai/bge-large-en-v1.5", { text: [q] })
        )
      );

      await writer.write(
        textEncoder.encode(
          `data: {"message": "Querying vector index...", "queries": "${JSON.stringify(
            queries
          )}"}\n\n`
        )
      );

      const allResults = await Promise.all(
        queryVectors.map((qv) =>
          ctx.env.VECTORIZE_INDEX.query(qv.data[0], {
            topK: 5,
            returnValues: true,
            returnMetadata: "all",
            namespace: "default",
          })
        )
      );

      const allResultsFlattened = Array.from(
        new Set(allResults.flatMap((r) => r.matches.map((m) => m.id)))
      ).map((id) =>
        allResults.flatMap((r) => r.matches).find((m) => m.id === id)
      );

      const relevantDocs = await db
        .select({ text: documentChunks.text })
        .from(documentChunks)
        .where(
          inArray(
            documentChunks.id,
            allResultsFlattened.map((r) => r?.id || "unknown")
          )
        );

      const relevantTexts = relevantDocs.map((doc) => doc.text).join("\n\n");

      await writer.write(
        textEncoder.encode(
          `data: {"message": "Found relevant documents...", "relevantContext": "${JSON.stringify(
            relevantTexts
          )}"}\n\n`
        )
      );

      messages.push({
        role: "user",
        content: `Relevant context from attached documents:\n${relevantTexts}`,
      });

      const apiKeys = {
        anthropic: ctx.env.ANTHROPIC_API_KEY,
        openai: ctx.env.OPENAI_API_KEY,
        groq: ctx.env.GROQ_API_KEY,
      };

      try {
        const stream = await streamLLMResponse({
          accountId: ctx.env.CLOUDFLARE_ACCOUNT_ID,
          messages,
          apiKeys,
          model,
          provider,
          AI: ctx.env.AI,
        });

        console.log(
          Object.keys(stream),
          typeof stream,
          `isBody? ${!!(stream as Response).body}`
        );

        writer.releaseLock();

        (stream as Response).body
          ? await (stream as Response).body?.pipeTo(writable)
          : await (stream as ReadableStream).pipeTo(writable);
      } catch (error) {
        await writer.write(textEncoder.encode("Error: " + error));
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
