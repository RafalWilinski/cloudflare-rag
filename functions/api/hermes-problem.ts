import { Ai } from "@cloudflare/workers-types";

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const stream = await (ctx.env.AI as Ai).run(
    "@hf/nousresearch/hermes-2-pro-mistral-7b",
    {
      messages: [
        {
          role: "user",
          content: "What is the capital of the moon?",
        },
      ],
      stream: true,
    }
  );

  return new Response(stream as any);
};
