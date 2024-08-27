import { Ai, RoleScopedChatInput } from "@cloudflare/workers-types";

interface EmbeddingResponse {
  shape: number[];
  data: number[][];
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  ctx.waitUntil(
    (async () => {
      const json = await ctx.request.json();
      const textEncoder = new TextEncoder();
      const messages: RoleScopedChatInput[] = json.messages as RoleScopedChatInput[];
      const lastMessage = messages[messages.length - 1];
      const query = lastMessage.content;

      const queryVector: EmbeddingResponse = await (ctx.env.AI as Ai).run(
        "@cf/baai/bge-large-en-v1.5",
        {
          text: [query],
        }
      );
      await writer.write(textEncoder.encode(`data: {"message": "Querying vector index..."}\n\n`));

      const results = await ctx.env.VECTORIZE_INDEX.query(queryVector.data[0], {
        topK: 5,
        returnValues: true,
        returnMetadata: true,
      });
      await writer.write(
        textEncoder.encode(`data: {"message": "Found relevant documents..."}\n\n`)
      );

      const relevantDocs = results.matches.map((match) => match.metadata?.text || "").join("\n");
      messages.push({
        role: "user",
        content: `Relevant documents:\n${relevantDocs}`,
      });

      try {
        const stream = await (ctx.env.AI as Ai).run("@cf/meta/llama-3.1-8b-instruct", {
          messages,
          stream: true,
        });

        // const transformStream = new TransformStream({
        //   async transform(chunk, controller) {
        //     if (!chunk || chunk.includes("[DONE]")) {
        //       return;
        //     } else {
        //       try {
        //         const parsed = JSON.parse(chunk.trim().replace("data: ", ""));
        //         if (parsed.response) {
        //           controller.enqueue(parsed.response);
        //         }
        //       } catch (error) {
        //         controller.enqueue("error: " + JSON.stringify(error));
        //       }
        //     }
        //   },
        // });

        // Release the lock on the writer so that the stream can be piped to the client
        writer.releaseLock();

        await (stream as ReadableStream)
          // .pipeThrough(new TextDecoderStream())
          // .pipeThrough(transformStream)
          // .pipeThrough(new TextEncoderStream())
          .pipeTo(writable);
      } catch (error) {
        await writer.write(textEncoder.encode("Error: " + error));
        await writer.close();
      }
    })()
  );

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream", // enable for SSE
      // "Content-Type": "text/x-unknown",
      // "content-encoding": "identity",
      // "transfer-encoding": "chunked",
    },
  });
};
