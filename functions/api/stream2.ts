import { createWorkersAI } from "workers-ai-provider";
import { CoreMessage, streamText } from "ai";
import { z } from "zod";

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
  const messages: CoreMessage[] = json.messages as CoreMessage[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workersAi = createWorkersAI({ binding: (ctx.env as any).AI });

  ctx.waitUntil(
    (async () => {
      const stream = await streamText({
        model: workersAi("@hf/nousresearch/hermes-2-pro-mistral-7b"),
        messages,
        tools: {
          searchDocs: {
            name: "search-docs",
            description: "Searches for relevant passages from the provided documents",
            parameters: z.object({
              query: z.string().describe("The query to search for"),
            }),
            execute: async ({ query }) => {
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

              return results.matches.map((match) => match.metadata?.text || "").join("\n");
            },
          },
        },
      });

      if (stream instanceof ReadableStream) {
        stream.pipeTo(writable);
      } else {
        console.log("Type: ", typeof stream);
        console.log("not really a stream: ", JSON.stringify(await stream));
      }
    })()
  );

  return new Response(readable, {
    headers: {
      // add these headers to ensure that the

      "Content-Type": "text/x-unknown",
      "content-encoding": "identity",
      "transfer-encoding": "chunked",
    },
  });
};
