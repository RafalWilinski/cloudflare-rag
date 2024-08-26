import { runWithTools } from "@cloudflare/ai-utils";
import { Ai, RoleScopedChatInput } from "@cloudflare/workers-types";

interface EmbeddingResponse {
  shape: number[];
  data: number[][];
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const json = await ctx.request.json();
  console.log(json);

  const textEncoder = new TextEncoder();
  const messages: RoleScopedChatInput[] = json.messages as RoleScopedChatInput[];

  ctx.waitUntil(
    (async () => {
      const stream = await runWithTools(
        ctx.env.AI as Ai,
        "@hf/nousresearch/hermes-2-pro-mistral-7b",
        {
          messages,
          tools: [
            {
              name: "search-docs",
              description: "Searches for relevant passages from the provided documents",
              parameters: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "The query to search for",
                  },
                },
                required: ["query"],
              },
              function: async ({ query }) => {
                await writer.write(textEncoder.encode(`Querying: ${query}\n`));

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const queryVector: EmbeddingResponse = await (ctx.env.AI as any).run(
                  "@cf/baai/bge-large-en-v1.5",
                  {
                    text: [query],
                  }
                );

                const results = await ctx.env.VECTORIZE_INDEX.query(queryVector.data[0], {
                  topK: 5,
                  returnValues: true,
                  returnMetadata: true,
                });

                console.log(`results.count: ${results.count}`);

                await writer.write(textEncoder.encode(`Found ${results.count} results\n`));
                // await writer.close();
                writer.releaseLock();

                return results.matches.map((match) => match.metadata?.text || "").join("\n");
              },
            },
          ],
        },
        {
          strictValidation: true,
          maxRecursiveToolRuns: 10,
          verbose: true,
          streamFinalResponse: true,
        }
      );

      if (stream instanceof ReadableStream) {
        console.log("Piping to writable");

        stream.getReader();
        await stream.pipeTo(writable);

        console.log("Done piping");
      } else {
        console.log("Type: ", typeof stream);
        console.log("not really a stream: ", JSON.stringify(await stream));
      }
    })()
  );

  return new Response(readable, { headers: { "content-type": "text/event-stream" } });
};
