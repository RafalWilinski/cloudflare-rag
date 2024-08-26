import { Env } from "worker-configuration";
export const onRequest: PagesFunction<Env> = async (ctx) => {

  // Create a TransformStream to handle streaming data
  let { readable, writable } = new TransformStream();
  let writer = writable.getWriter();
  const textEncoder = new TextEncoder();

  ctx.waitUntil((async () => {
    const stream = {
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: 'Part 1: ' } }] };
        await new Promise(resolve => setTimeout(resolve, 1000));
        yield { choices: [{ delta: { content: 'Part 2: ' } }] };
        await new Promise(resolve => setTimeout(resolve, 1000));
        yield { choices: [{ delta: { content: 'Part 4: ' } }] };
      }
    };

    // loop over the data as it is streamed and write to the writeable
    for await (const part of stream) {
      await writer.write(textEncoder.encode(part.choices[0]?.delta?.content || ''));
    }
    await writer.close();
  })());

  // Send the readable back to the browser
  return new Response(readable);
}